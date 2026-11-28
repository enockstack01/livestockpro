require('dotenv').config();

const { createServiceClient } = require('./supabase');

async function main() {
  const userId = '0707847d-7c88-4441-9731-603e99fd131c';
  const supabase = createServiceClient();

  const tables = ['accounts', 'profiles', 'user_roles'];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`\n${table}: ERROR`, error.message);
      continue;
    }

    if (!data) {
      console.log(`\n${table}: MISSING`);
      continue;
    }

    if (table === 'accounts') {
      console.log('\naccounts:', {
        exists: true,
        status: data.status,
        account_type: data.account_type
      });
    } else if (table === 'profiles') {
      console.log('\nprofiles:', {
        exists: true,
        farm_name: data.farm_name || null
      });
    } else {
      console.log('\nuser_roles:', {
        exists: true,
        role: data.role
      });
    }
  }
}

main().catch(error => {
  console.error('Verification failed:', error.message);
  process.exitCode = 1;
});
