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
    console.log('\nSupabase sign-in successful.');

    const baseUrl = 'http://localhost:3004/api/supabase/data/animals';

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
      let result;

      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Server returned invalid JSON: ${text}`);
      }

      if (!response.ok) {
        throw new Error(
          `${method} ${query || '/'} failed with HTTP ${response.status}: ${JSON.stringify(result)}`
        );
      }

      return result;
    }

    testId = crypto.randomUUID();

    const testAnimal = {
      id: testId,
      tag_id: `SUPABASE-TEST-${Date.now()}`,
      name: 'Temporary Supabase CRUD Test',
      species: 'cattle',
      breed: 'Test breed',
      sex: 'female',
      health_status: 'Healthy',
      notes: 'Temporary record created by testSupabaseDataCrud.js'
    };

    console.log('\n1. CREATE animal');
    const createdRows = await api('POST', '', testAnimal);
    assert(Array.isArray(createdRows), 'Create response was not an array.');
    assert(createdRows.some(row => row.id === testId), 'Created animal was not returned.');
    created = true;
    console.log('PASS: Animal created:', testId);

    console.log('\n2. READ animal');
    const readRows = await api('GET', `?id=${encodeURIComponent(testId)}`);
    assert(readRows.length === 1, 'Expected exactly one animal.');
    assert(readRows[0].name === testAnimal.name, 'Animal name did not match.');
    console.log('PASS: Animal retrieved.');

    console.log('\n3. UPDATE animal');
    const updatedRows = await api(
      'PATCH',
      `?id=${encodeURIComponent(testId)}`,
      { notes: 'Updated by Supabase CRUD test' }
    );
    assert(updatedRows.length === 1, 'Expected one updated animal.');
    assert(
      updatedRows[0].notes === 'Updated by Supabase CRUD test',
      'Updated notes did not match.'
    );
    console.log('PASS: Animal updated.');

    console.log('\n4. SOFT DELETE animal');
    await api('DELETE', `?id=${encodeURIComponent(testId)}`);
    console.log('PASS: Soft-delete request succeeded.');

    console.log('\n5. VERIFY normal reads hide deleted animal');
    const normalRows = await api('GET', `?id=${encodeURIComponent(testId)}`);
    assert(normalRows.length === 0, 'Deleted animal appeared in normal results.');
    console.log('PASS: Deleted animal is hidden by default.');

    console.log('\n6. VERIFY sync can retrieve tombstone');
    const deletedRows = await api(
      'GET',
      `?id=${encodeURIComponent(testId)}&include_deleted=true`
    );
    assert(deletedRows.length === 1, 'Expected deleted animal in tombstone results.');
    assert(deletedRows[0].deleted_at, 'Deleted animal has no deleted_at timestamp.');
    assert(
      deletedRows[0].notes === 'Updated by Supabase CRUD test',
      'Deleted animal data did not match.'
    );
    console.log('PASS: Deleted animal is available to sync.');

    console.log('\nALL SUPABASE ANIMAL CRUD TESTS PASSED.');
    console.log('Test record ID:', testId);
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);

    if (created && testId && accessToken) {
      try {
        const response = await fetch(
          `http://localhost:3004/api/supabase/data/animals?id=${encodeURIComponent(testId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        console.log(
          'Cleanup attempt:',
          response.ok ? 'soft-delete succeeded' : `HTTP ${response.status}`
        );
      } catch {
        console.log('Cleanup attempt could not reach the test server.');
      }
    }

    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
