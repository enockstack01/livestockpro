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
    const email = await ask('Test user email: ');
    const password = await ask('Test user password: ');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
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
      'http://localhost:3003/api/supabase/account',
      {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`
        }
      }
    );

    const result = await response.json();

    console.log('\nAccount endpoint HTTP status:', response.status);
    console.log(JSON.stringify(result, null, 2));

    if (!response.ok) {
      throw new Error('Supabase account GET test failed.');
    }

    console.log('\nSUPABASE ACCOUNT GET TEST PASSED.');
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
