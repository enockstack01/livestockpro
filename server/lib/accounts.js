const { getDb } = require('../db');
const { getRole } = require('../authMiddleware');

/* Account approval. A new sign-up can't use the platform until they've
   submitted an account request and an admin has approved it. One document
   per user in `accounts` (_id = the Clerk user id, user_id duplicated so the
   per-user deleteMany() calls in the delete paths sweep it up too). */
const ACCOUNT_STATUSES = ['pending', 'approved', 'rejected', 'on_hold'];
const ACCOUNT_TYPES = ['farmer', 'veterinarian', 'extension_officer', 'cooperative', 'researcher', 'student', 'other'];
const CURRENCY_RE = /^[A-Z]{3}$/;
const DEFAULT_CURRENCY = 'USD';

const DATA_COLLECTIONS = ['profiles', 'animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'finance_records', 'tasks'];

function accounts() {
  return getDb().collection('accounts');
}

/* Users who were already farming on the platform before approval existed
   (they have a profile or any records) are grandfathered in as approved,
   once, so the rollout doesn't lock anyone out of their own data. */
async function hasExistingData(userId) {
  const db = getDb();
  for (const name of DATA_COLLECTIONS) {
    if (await db.collection(name).findOne({ user_id: userId }, { projection: { _id: 1 } })) return true;
  }
  return false;
}

async function getAccount(userId) {
  const existing = await accounts().findOne({ _id: userId });
  if (existing) return existing;
  if (!(await hasExistingData(userId))) return null;
  const now = new Date().toISOString();
  const doc = { _id: userId, user_id: userId, status: 'approved', legacy: true, account_type: 'farmer', currency: DEFAULT_CURRENCY, created_at: now, updated_at: now, reviewed_at: now };
  await accounts().updateOne({ _id: userId }, { $setOnInsert: doc }, { upsert: true });
  return accounts().findOne({ _id: userId });
}

/* Short-lived memo of approved users so requireApproved doesn't cost a Mongo
   (and Clerk) round-trip on every data call; cleared the moment an admin
   changes someone's status. */
const approvedCache = new Map();
const CACHE_MS = 30 * 1000;

function forgetApproval(userId) {
  approvedCache.delete(userId);
}

async function isApproved(userId) {
  const hit = approvedCache.get(userId);
  if (hit && hit > Date.now()) return true;
  const account = await getAccount(userId);
  let ok = !!account && account.status === 'approved';
  if (!ok) ok = (await getRole(userId)) !== 'user';
  if (ok) approvedCache.set(userId, Date.now() + CACHE_MS);
  return ok;
}

/* Mounted after requireAuth on the farm-data API. Admins always pass. */
async function requireApproved(req, res, next) {
  try {
    if (await isApproved(req.user.id)) return next();
    res.status(403).json({ error: { message: 'Your account is awaiting approval.', code: 'ACCOUNT_NOT_APPROVED' } });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to verify account: ' + err.message } });
  }
}

module.exports = {
  ACCOUNT_STATUSES, ACCOUNT_TYPES, CURRENCY_RE, DEFAULT_CURRENCY,
  accounts, getAccount, requireApproved, forgetApproval
};
