const { createUserClient, verifyAccessToken } = require('./supabase');

const ROLE_RANK = {
  user: 0,
  admin: 1,
  super_admin: 2
};

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function getRole(userId, supabaseClient) {
  if (!supabaseClient) {
    throw new Error('A user-scoped Supabase client is required to check roles.');
  }

  const { data, error } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const role = data?.role || 'user';

  if (!Object.prototype.hasOwnProperty.call(ROLE_RANK, role)) {
    throw new Error(`Unrecognized platform role: ${role}`);
  }

  return role;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: { message: 'Missing authentication token.' }
      });
    }

    const { user, error } = await verifyAccessToken(token);

    if (error || !user) {
      return res.status(401).json({
        error: { message: 'Invalid or expired authentication token.' }
      });
    }

    const supabase = createUserClient(token);
    const role = await getRole(user.id, supabase);

    req.supabase = supabase;
    req.user = {
      id: user.id,
      email: user.email || null,
      role
    };

    next();
  } catch (error) {
    console.error('Supabase authentication error:', error.message);

    return res.status(500).json({
      error: { message: 'Unable to verify authentication.' }
    });
  }
}

function requireRole(minRole) {
  if (!Object.prototype.hasOwnProperty.call(ROLE_RANK, minRole)) {
    throw new Error(`Invalid required role: ${minRole}`);
  }

  return (req, res, next) => {
    const actualRole = req.user?.role || 'user';

    if (ROLE_RANK[actualRole] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: { message: 'Forbidden: insufficient privileges.' }
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  getRole
};
