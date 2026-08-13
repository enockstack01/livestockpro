const { getAuth, clerkClient } = require('@clerk/express');

/* clerkMiddleware() (mounted in index.js) must run before this on every request. */
function requireAuth(req, res, next) {
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    return res.status(401).json({ error: { message: 'Not authenticated.' } });
  }
  req.user = { id: auth.userId };
  next();
}

/* Optional resilient bootstrap: emails listed here are always treated as
   super_admin even before any publicMetadata.role has been set on their
   Clerk account. Lets a fresh deployment (e.g. a new Render env) get its
   first super admin without a manual script. */
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function primaryEmail(user) {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return ((primary || user.emailAddresses[0] || {}).emailAddress || '').toLowerCase();
}

async function getRole(userId) {
  const user = await clerkClient.users.getUser(userId);
  const metaRole = user.publicMetadata && user.publicMetadata.role;
  if (metaRole === 'super_admin' || SUPER_ADMIN_EMAILS.includes(primaryEmail(user))) return 'super_admin';
  if (metaRole === 'admin') return 'admin';
  return 'user';
}

const ROLE_RANK = { user: 0, admin: 1, super_admin: 2 };

/* Middleware factory: requireRole('admin') passes for admin or super_admin,
   requireRole('super_admin') passes for super_admin only. Populates
   req.user.role with the caller's actual (not minimum) role. */
function requireRole(minRole) {
  return async (req, res, next) => {
    try {
      const role = await getRole(req.user.id);
      req.user.role = role;
      if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: { message: 'Forbidden: insufficient privileges.' } });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: { message: 'Failed to verify role: ' + err.message } });
    }
  };
}

module.exports = { requireAuth, requireRole, getRole, primaryEmail, clerkClient };
