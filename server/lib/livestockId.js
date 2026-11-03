const crypto = require('crypto');
const { getDb } = require('../db');

/* Livestock IDs: a short public ID for every user, the word "Livestock"
   followed by 10 digits (for example Livestock4829173650), safe to read out
   on the phone or print on a report instead of the long sign-in ID.

   The digits are an encrypted form of the user's sign-in ID: an HMAC-SHA256
   of the ID under a server-side secret (LIVESTOCK_ID_SECRET, else the
   server's Clerk secret key), the first 8 bytes read as a number, folded
   into 1000000000 to 9999999999 (so the number never starts with 0).
   Without the secret nobody can work out a Livestock ID from a sign-in ID,
   or the other way round. Each ID is saved in livestock_ids (and on the
   user's account) the first time, and the saved one is always used after
   that, so an ID never changes.
   If two users ever landed on the same number, the second tries the hash of
   "<id>:1", then "<id>:2", and so on; the unique key on livestock_ids makes
   sure no two users can hold one ID, even when they sign up at the same
   moment. */

const PREFIX = 'Livestock';
const SPAN = 9000000000n;
const FLOOR = 1000000000n;
const ID_RE = /^Livestock\d{10}$/;

const secret = () => process.env.LIVESTOCK_ID_SECRET || process.env.CLERK_SECRET_KEY || '';

function candidate(userId, attempt = 0) {
  const input = attempt ? `${userId}:${attempt}` : String(userId);
  const key = secret();
  const hash = key ? crypto.createHmac('sha256', key).update(input).digest() : crypto.createHash('sha256').update(input).digest();
  const n = hash.readBigUInt64BE(0) % SPAN + FLOOR;
  return `${PREFIX}${n.toString()}`;
}

const ids = () => getDb().collection('livestock_ids');

const cache = new Map();

/* The user's Livestock ID, created the first time it is asked for. */
async function ensureLivestockId(userId) {
  if (!userId) return null;
  if (cache.has(userId)) return cache.get(userId);
  const found = await ids().findOne({ user_id: userId });
  if (found) { cache.set(userId, found._id); return found._id; }
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = candidate(userId, attempt);
    try {
      await ids().insertOne({ _id: id, user_id: userId, created_at: new Date().toISOString() });
      await getDb().collection('accounts').updateOne({ _id: userId }, { $set: { livestock_id: id } }).catch(() => {});
      cache.set(userId, id);
      return id;
    } catch (err) {
      if (err.code !== 11000) throw err;
      /* Taken: by this same user (a parallel request won), or by someone else. */
      const mine = await ids().findOne({ user_id: userId });
      if (mine) { cache.set(userId, mine._id); return mine._id; }
    }
  }
  throw new Error('Could not create a Livestock ID.');
}

/* Livestock IDs for many users at once (admin lists), creating missing ones. */
async function livestockIdsFor(userIds) {
  const list = [...new Set(userIds.filter(Boolean))];
  const rows = await ids().find({ user_id: { $in: list } }).toArray();
  const out = Object.fromEntries(rows.map((r) => [r.user_id, r._id]));
  for (const id of list) if (!out[id]) out[id] = await ensureLivestockId(id);
  return out;
}

async function userForLivestockId(id) {
  if (!ID_RE.test(String(id))) return null;
  const row = await ids().findOne({ _id: String(id) });
  return row ? row.user_id : null;
}

/* Audit rows for the screens: people appear by their Livestock ID (and the
   email on their account when the row has none), never by sign-in ID. */
async function publicAuditRows(rows) {
  const people = rows.flatMap((r) => [r.actor_id, ['farmer', 'member', 'user', 'account'].includes(r.target_type) ? r.target_id : null]).filter(Boolean);
  const [idMap, accounts] = await Promise.all([
    livestockIdsFor(people),
    getDb().collection('accounts').find({ _id: { $in: [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] } }, { projection: { email: 1 } }).toArray()
  ]);
  const emails = new Map(accounts.map((a) => [a._id, a.email]));
  return rows.map((r) => ({
    ...r,
    actor_email: r.actor_email || emails.get(r.actor_id) || null,
    actor_id: r.actor_id ? idMap[r.actor_id] || null : null,
    target_id: r.target_id && idMap[r.target_id] ? idMap[r.target_id] : r.target_id
  }));
}

module.exports = { PREFIX, ID_RE, candidate, ensureLivestockId, livestockIdsFor, userForLivestockId, publicAuditRows };
