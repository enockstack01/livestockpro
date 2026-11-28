require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
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

    console.log('\nSupabase sign-in successful.');
    console.log('User ID:', data.user.id);

    const response = await fetch(
      'http://localhost:3004/api/supabase/data/animals',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          Accept: 'application/json'
        }
      }
    );

    const result = await response.json();

    console.log('\nData endpoint HTTP status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (
      response.status === 403 &&
      result?.error?.code === 'ACCOUNT_NOT_APPROVED'
    ) {
      console.log('\nPASS: Pending account correctly denied access.');
      return;
    }

    if (response.status === 200) {
      console.log('\nAccount is already approved; endpoint access succeeded.');
      return;
    }

    throw new Error(
      `Unexpected response. Expected pending-account HTTP 403, received ${response.status}.`
    );
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
