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

module.exports = { requireAuth, clerkClient };
