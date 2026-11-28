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
  let deviceId;
  let registered = false;

  const baseUrl = 'http://localhost:3004/api/supabase/data/push_tokens';

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
    const result = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        `${method} failed with HTTP ${response.status}: ${JSON.stringify(result)}`
      );
    }

    return result;
  }

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    accessToken = data.session.access_token;
    deviceId = `supabase-test-${crypto.randomUUID()}`;

    console.log('\nSupabase sign-in successful.');

    console.log('\n1. REGISTER temporary device token');

    const firstToken = `SupabaseTestToken-${crypto.randomUUID()}`;

    const firstRegistration = await api('POST', '', {
      expo_push_token: firstToken,
      platform: 'test',
      device_id: deviceId
    });

    assert(firstRegistration.length === 1, 'Expected one registered token.');
    assert(
      firstRegistration[0].deleted_at === null,
      'New token should be active.'
    );

    registered = true;
    console.log('PASS: Device token registered.');

    console.log('\n2. READ registered token');

    let rows = await api(
      'GET',
      `?device_id=${encodeURIComponent(deviceId)}`
    );

    assert(rows.length === 1, 'Expected one active token.');
    assert(rows[0].expo_push_token === firstToken, 'Token did not match.');
    console.log('PASS: Registered token retrieved.');

    console.log('\n3. SOFT-DELETE device token');

    await api('DELETE', `?device_id=${encodeURIComponent(deviceId)}`);
    console.log('PASS: Token soft-deleted.');

    console.log('\n4. VERIFY deleted token is hidden');

    rows = await api(
      'GET',
      `?device_id=${encodeURIComponent(deviceId)}`
    );

    assert(rows.length === 0, 'Deleted token should be hidden.');
    console.log('PASS: Deleted token is hidden by default.');

    console.log('\n5. VERIFY tombstone exists');

    rows = await api(
      'GET',
      `?device_id=${encodeURIComponent(deviceId)}&include_deleted=true`
    );

    assert(rows.length === 1, 'Expected one deleted token.');
    assert(rows[0].deleted_at, 'Expected deleted_at timestamp.');
    console.log('PASS: Deleted token tombstone retrieved.');

    console.log('\n6. RE-REGISTER the same device');

    const secondToken = `SupabaseTestToken-${crypto.randomUUID()}`;

    const secondRegistration = await api('POST', '', {
      expo_push_token: secondToken,
      platform: 'test',
      device_id: deviceId
    });

    assert(secondRegistration.length === 1, 'Expected one reactivated token.');
    assert(
      secondRegistration[0].deleted_at === null,
      'Re-registered token still has deleted_at set.'
    );
    assert(
      secondRegistration[0].expo_push_token === secondToken,
      'Re-registered token value did not update.'
    );

    console.log('PASS: Device token reactivated.');

    console.log('\n7. VERIFY reactivated token is visible');

    rows = await api(
      'GET',
      `?device_id=${encodeURIComponent(deviceId)}`
    );

    assert(rows.length === 1, 'Expected one active re-registered token.');
    assert(
      rows[0].expo_push_token === secondToken,
      'Active token value does not match the new token.'
    );

    console.log('PASS: Reactivated token is visible.');

    console.log('\n8. CLEAN UP test token');

    await api('DELETE', `?device_id=${encodeURIComponent(deviceId)}`);
    registered = false;

    console.log('PASS: Temporary token soft-deleted.');

    console.log('\nALL PUSH TOKEN TESTS PASSED.');
    console.log('Test device ID:', deviceId);
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);

    if (registered && accessToken && deviceId) {
      try {
        await api('DELETE', `?device_id=${encodeURIComponent(deviceId)}`);
        console.log('Cleanup: temporary token soft-deleted.');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError.message);
      }
    }

    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
