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

/* Resilient bootstrap: emails listed here hold their role even before any
   publicMetadata.role has been set on their Clerk account, so a fresh
   deployment (e.g. a new Render env or a new Clerk instance) has its
   administrators from the first sign in. The platform owners are built in
   super admins; SUPER_ADMIN_EMAILS and ADMIN_EMAILS (comma separated) add
   more. An email only counts once Clerk has verified it. */
const emailList = (value) => (value || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const OWNER_EMAILS = ['enockstack@gmail.com', 'nshimiyimanaenock4@gmail.com'];
const SUPER_ADMIN_EMAILS = [...OWNER_EMAILS, ...emailList(process.env.SUPER_ADMIN_EMAILS)];
const ADMIN_EMAILS = emailList(process.env.ADMIN_EMAILS);

function primaryEmail(user) {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return ((primary || user.emailAddresses[0] || {}).emailAddress || '').toLowerCase();
}

function verifiedPrimaryEmail(user) {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) || user.emailAddresses[0];
  return primary && primary.verification && primary.verification.status === 'verified' ? primary.emailAddress.toLowerCase() : '';
}

/* The role of a Clerk user object: what the admin dashboard lists and what
   every permission check uses. */
function roleOf(user) {
  const metaRole = user.publicMetadata && user.publicMetadata.role;
  const email = verifiedPrimaryEmail(user);
  if (metaRole === 'super_admin' || (email && SUPER_ADMIN_EMAILS.includes(email))) return 'super_admin';
  if (metaRole === 'admin' || (email && ADMIN_EMAILS.includes(email))) return 'admin';
  return 'user';
}

/* Roles given by an email list can't be changed from the dashboard (the
   list would put them straight back). */
function roleFromEmail(user) {
  const email = verifiedPrimaryEmail(user);
  if (email && SUPER_ADMIN_EMAILS.includes(email)) return 'super_admin';
  if (email && ADMIN_EMAILS.includes(email)) return 'admin';
  return null;
}

async function getRole(userId) {
  return roleOf(await clerkClient.users.getUser(userId));
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

module.exports = { requireAuth, requireRole, getRole, roleOf, roleFromEmail, primaryEmail, clerkClient };
