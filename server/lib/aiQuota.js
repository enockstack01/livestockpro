const { getDb } = require('../db');
const { getRole } = require('../authMiddleware');

/* Per-user AI quotas. Every AI request costs money, so each user gets a
   daily allowance per feature plus an overall daily cap, counted in MongoDB
   (one document per user per UTC day in `ai_usage`) so the limits hold across
   server restarts and multiple instances. A request reserves its slot before
   the model is called and gives it back if the call fails, so users are not
   charged for errors.

   Defaults can be changed without a code change:
     AI_DAILY_LIMIT (overall), AI_DAILY_DIAGNOSE, AI_DAILY_ADVISOR,
     AI_DAILY_CHAT, AI_DAILY_BRIEF, AI_ADMIN_MULTIPLIER
   and an admin can give one account its own overall limit
   (accounts.ai_daily_limit, PATCH /api/admin/users/:id/ai-limit). */

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

const KINDS = ['diagnose', 'advisor', 'chat', 'brief'];

function baseLimits() {
  return {
    total: num(process.env.AI_DAILY_LIMIT, 50),
    diagnose: num(process.env.AI_DAILY_DIAGNOSE, 10),
    advisor: num(process.env.AI_DAILY_ADVISOR, 5),
    chat: num(process.env.AI_DAILY_CHAT, 40),
    brief: num(process.env.AI_DAILY_BRIEF, 10)
  };
}

const roleCache = new Map(); // userId -> { role, until }
async function roleOf(userId) {
  const hit = roleCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.role;
  let role = 'user';
  try { role = await getRole(userId); } catch { /* keep the user limits */ }
  roleCache.set(userId, { role, until: Date.now() + 5 * 60 * 1000 });
  return role;
}

async function limitsFor(userId) {
  const limits = baseLimits();
  const role = await roleOf(userId);
  if (role !== 'user') {
    const m = num(process.env.AI_ADMIN_MULTIPLIER, 3);
    for (const k of Object.keys(limits)) limits[k] = Math.round(limits[k] * m);
  }
  const account = await getDb().collection('accounts').findOne({ _id: userId }, { projection: { ai_daily_limit: 1 } });
  if (account && Number.isFinite(account.ai_daily_limit)) limits.total = Math.max(0, account.ai_daily_limit);
  return limits;
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
function resetAt() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

function usage() {
  return getDb().collection('ai_usage');
}

/* How much of today's allowance this user has used. */
async function getUsage(userId) {
  const [limits, doc] = await Promise.all([limitsFor(userId), usage().findOne({ _id: `${userId}:${dayKey()}` })]);
  const kinds = {};
  for (const k of KINDS) {
    const used = (doc && doc.kinds && doc.kinds[k]) || 0;
    kinds[k] = { used, limit: limits[k], remaining: Math.max(0, limits[k] - used) };
  }
  const used = (doc && doc.total) || 0;
  return { day: dayKey(), used, limit: limits.total, remaining: Math.max(0, limits.total - used), kinds, resetAt: resetAt() };
}

class QuotaError extends Error {
  constructor(kind, usageNow) {
    super(kind === 'total' ? 'You have used all your AI requests for today.' : 'You have used all your AI requests of this kind for today.');
    this.status = 429;
    this.code = 'AI_QUOTA';
    this.kind = kind;
    this.usage = usageNow;
  }
}

/* Takes one slot of `kind` for today, or throws QuotaError (429). Returns a
   release function that gives the slot back if the AI call then fails. */
async function reserve(userId, kind) {
  const limits = await limitsFor(userId);
  const id = `${userId}:${dayKey()}`;
  const field = `kinds.${kind}`;
  const now = new Date().toISOString();
  await usage().updateOne({ _id: id }, { $setOnInsert: { _id: id, user_id: userId, day: dayKey(), total: 0, kinds: {}, created_at: now } }, { upsert: true });
  const res = await usage().updateOne(
    { _id: id, total: { $lt: limits.total }, [field]: { $not: { $gte: limits[kind] } } },
    { $inc: { total: 1, [field]: 1 }, $set: { updated_at: now } }
  );
  if (!res.modifiedCount) {
    const u = await getUsage(userId);
    throw new QuotaError(u.remaining <= 0 ? 'total' : kind, u);
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await usage().updateOne({ _id: id, total: { $gt: 0 } }, { $inc: { total: -1, [field]: -1 } }).catch(() => {});
  };
}

module.exports = { KINDS, reserve, getUsage, QuotaError, baseLimits };
