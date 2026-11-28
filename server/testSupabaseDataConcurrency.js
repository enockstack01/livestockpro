require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  let accessToken;
  let testId;
  let created = false;
  let baseUrl;

  try {
    const email = (await ask('Test user email: ')).trim();
    const password = await ask('Test user password: ');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) throw authError;

    accessToken = authData.session.access_token;
    baseUrl = 'http://localhost:3004/api/supabase/data/animals';

    async function api(method, query = '', body = undefined) {
      const response = await fetch(`${baseUrl}${query}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });

      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      return { status: response.status, data };
    }

    testId = crypto.randomUUID();

    const query = `?id=${encodeURIComponent(testId)}`;

    console.log('\n1. CREATE test animal');
    const create = await api('POST', '', {
      id: testId,
      tag_id: `CONCURRENCY-${Date.now()}`,
      name: 'Temporary Concurrency Test',
      species: 'cattle',
      breed: 'Test breed',
      sex: 'female',
      health_status: 'Healthy',
      notes: 'Initial version'
    });

    assert(create.status === 200, `Create returned HTTP ${create.status}`);
    assert(Array.isArray(create.data), 'Create response was not an array.');

    let current = create.data.find(row => row.id === testId);
    assert(current?.updated_at, 'Create response has no updated_at.');
    created = true;

    const originalTimestamp = current.updated_at;
    console.log('PASS: Created record with updated_at:', originalTimestamp);

    console.log('\n2. UPDATE using current timestamp');
    let result = await api('PATCH', query, {
      notes: 'First successful update',
      base_updated_at: originalTimestamp
    });

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    current = result.data?.[0];
    assert(current?.updated_at, 'Update response has no updated_at.');
    assert(current.notes === 'First successful update', 'First update did not persist.');

    const refreshedTimestamp = current.updated_at;
    console.log('PASS: Current-version update succeeded.');

    console.log('\n3. REJECT stale PATCH');
    result = await api('PATCH', query, {
      notes: 'This stale update must not overwrite newer data',
      base_updated_at: originalTimestamp
    });

    assert(result.status === 409, `Expected stale PATCH HTTP 409, got ${result.status}`);
    assert(
      result.data?.error?.code === 'SYNC_CONFLICT',
      'Stale PATCH did not return SYNC_CONFLICT.'
    );
    console.log('PASS: Stale PATCH rejected with 409 SYNC_CONFLICT.');

    console.log('\n4. UPDATE using refreshed timestamp');
    result = await api('PATCH', query, {
      notes: 'Second successful update',
      base_updated_at: refreshedTimestamp
    });

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    current = result.data?.[0];
    assert(current?.updated_at, 'Second update response has no updated_at.');
    assert(current.notes === 'Second successful update', 'Second update did not persist.');

    const latestTimestamp = current.updated_at;
    console.log('PASS: Refreshed-version update succeeded.');

    console.log('\n5. REJECT stale DELETE');
    result = await api('DELETE', `${query}&base_updated_at=${encodeURIComponent(originalTimestamp)}`);

    assert(result.status === 409, `Expected stale DELETE HTTP 409, got ${result.status}`);
    assert(
      result.data?.error?.code === 'SYNC_CONFLICT',
      'Stale DELETE did not return SYNC_CONFLICT.'
    );
    console.log('PASS: Stale DELETE rejected with 409 SYNC_CONFLICT.');

    console.log('\n6. DELETE using latest timestamp');
    result = await api('DELETE', `${query}&base_updated_at=${encodeURIComponent(latestTimestamp)}`);

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(Array.isArray(result.data) && result.data.length === 1, 'Delete did not return the tombstone row.');
    assert(result.data[0].deleted_at, 'Deleted row has no deleted_at timestamp.');
    console.log('PASS: Current-version DELETE succeeded.');

    console.log('\n7. VERIFY tombstone');
    result = await api('GET', `${query}&include_deleted=true`);

    assert(result.status === 200, `Tombstone read returned HTTP ${result.status}`);
    assert(result.data?.length === 1, 'Expected one tombstone.');
    assert(result.data[0].notes === 'Second successful update', 'Tombstone data was unexpectedly changed.');
    console.log('PASS: Tombstone retains the latest successful data.');

    console.log('\nALL SUPABASE CONCURRENCY TESTS PASSED.');
    console.log('Test record ID:', testId);
    created = false;
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
  } finally {
    if (created && testId && accessToken && baseUrl) {
      try {
        const response = await fetch(
          `${baseUrl}?id=${encodeURIComponent(testId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        console.log(
          'Cleanup:',
          response.ok ? 'temporary record soft-deleted' : `HTTP ${response.status}`
        );
      } catch {
        console.log('Cleanup could not reach the test server.');
      }
    }

    rl.close();
  }

  if (created) process.exitCode = 1;
}

main();