const { createClient } = require('@supabase/supabase-js');

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;

  if (!url) {
    throw new Error('SUPABASE_URL is not configured.');
  }

  return url;
}

function getPublicKey() {
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is not configured.'
    );
  }

  return key;
}

// Create a separate client for each authenticated request.
// Never reuse a client containing another user's access token.
function createUserClient(accessToken) {
  if (!accessToken) {
    throw new Error('An access token is required.');
  }

  return createClient(getSupabaseUrl(), getPublicKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

// Server-only client. Never expose its key to web or mobile apps.
function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  return createClient(getSupabaseUrl(), serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

// Validate a Supabase access token with the Auth server.
async function verifyAccessToken(accessToken) {
  const client = createUserClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return {
      user: null,
      error: error || new Error('Invalid access token.')
    };
  }

  return {
    user: data.user,
    error: null
  };
}

module.exports = {
  createUserClient,
  createServiceClient,
  verifyAccessToken
};
