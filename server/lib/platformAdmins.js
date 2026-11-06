const { clerkClient, roleOf } = require('../authMiddleware');

/* Every Clerk account, read page by page (no 500 account ceiling) and kept
   for 30 seconds so the admin dashboard and the admin notifications do not
   list them on every request. forgetUsers() after a change to a Clerk user
   (role, ban, delete). */
const CACHE_MS = 30 * 1000;
const PAGE = 500;
let cache = null;

async function allClerkUsers() {
  if (cache && cache.until > Date.now()) return cache.users;
  const users = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await clerkClient.users.getUserList({ limit: PAGE, offset, orderBy: '-created_at' });
    users.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  cache = { users, until: Date.now() + CACHE_MS };
  return users;
}

function forgetUsers() {
  cache = null;
}

/* The ids of every platform administrator (admin and super admin). */
async function adminIds() {
  return (await allClerkUsers()).filter((u) => roleOf(u) !== 'user').map((u) => u.id);
}

/* A bell notification (and push) for every platform administrator, such as
   a new account request waiting for approval. Never fails the request. */
async function notifyAdmins(key, vars, link = '/admin') {
  try {
    const { notify } = require('./orgs');
    await Promise.all((await adminIds()).map((id) => notify(id, key, vars, link)));
  } catch (err) {
    console.error('Admin notification failed:', err.message);
  }
}

module.exports = { allClerkUsers, forgetUsers, adminIds, notifyAdmins };
