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

    const confirmation = await ask(
      'This will write temporary test details to this account. Type TEST to continue: '
    );

    if (confirmation !== 'TEST') {
      console.log('Test cancelled. No account changes made.');
      return;
    }

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

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) throw authError;

    const headers = {
      Authorization: `Bearer ${authData.session.access_token}`,
      'Content-Type': 'application/json'
    };

    const baseUrl = 'http://localhost:3003/api/supabase/account';

    // 1. Submit an account request.
    console.log('\nTesting account request submission...');

    const requestResponse = await fetch(`${baseUrl}/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        full_name: 'Supabase Test User',
        account_type: 'farmer',
        phone: '+250700000000',
        location: 'Kigali',
        farm_name: 'Supabase Test Farm',
        herd_size: 5,
        livestock_types: ['cattle', 'goats'],
        notes: 'Temporary account API integration test.'
      })
    });

    const requestResult = await requestResponse.json();

    console.log('Request HTTP status:', requestResponse.status);
    console.log(JSON.stringify(requestResult, null, 2));

    if (!requestResponse.ok) {
      throw new Error('Account request submission failed.');
    }

    console.log('ACCOUNT REQUEST TEST PASSED.');

    // 2. Change currency to RWF.
    console.log('\nTesting currency preference update...');

    const currencyResponse = await fetch(`${baseUrl}/preferences`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ currency: 'RWF' })
    });

    const currencyResult = await currencyResponse.json();

    console.log('Currency HTTP status:', currencyResponse.status);
    console.log(JSON.stringify(currencyResult, null, 2));

    if (!currencyResponse.ok || currencyResult.data?.currency !== 'RWF') {
      throw new Error('Currency update to RWF failed.');
    }

    console.log('CURRENCY UPDATE TEST PASSED.');

    // 3. Restore the original USD preference.
    console.log('\nRestoring currency to USD...');

    const restoreResponse = await fetch(`${baseUrl}/preferences`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ currency: 'USD' })
    });

    const restoreResult = await restoreResponse.json();

    if (!restoreResponse.ok || restoreResult.data?.currency !== 'USD') {
      console.error('WARNING: Currency restoration failed.');
      console.error(JSON.stringify(restoreResult, null, 2));
      throw new Error('Could not restore currency to USD.');
    }

    console.log('Currency restored to USD.');

    // 4. Read the account again.
    const finalResponse = await fetch(baseUrl, { headers });
    const finalResult = await finalResponse.json();

    if (!finalResponse.ok) {
      throw new Error('Final account verification failed.');
    }

    console.log('\nFinal account state:');
    console.log(JSON.stringify(finalResult, null, 2));

    console.log('\nALL SUPABASE ACCOUNT WRITE TESTS PASSED.');
  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
