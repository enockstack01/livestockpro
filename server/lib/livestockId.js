const crypto = require('crypto');
const { getDb } = require('../db');

/* Livestock IDs: a short public ID for every user, the word "Livestock"
   followed by 10 digits (for example Livestock4829173650), safe to read out
   on the phone or print on a report instead of the long sign-in ID.

   The digits come from the user's sign-in ID: SHA-256 of the ID, the first
   8 bytes read as a number, folded into 1000000000 to 9999999999 (so the
   number never starts with 0). The same user always gets the same number.
   If two users ever landed on the same number, the second tries the hash of
   "<id>:1", then "<id>:2", and so on; the unique key on livestock_ids makes
   sure no two users can hold one ID, even when they sign up at the same
   moment. */

const PREFIX = 'Livestock';
const SPAN = 9000000000n;
const FLOOR = 1000000000n;
const ID_RE = /^Livestock\d{10}$/;

function candidate(userId, attempt = 0) {
  const hash = crypto.createHash('sha256').update(attempt ? `${userId}:${attempt}` : String(userId)).digest();
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

module.exports = { PREFIX, ID_RE, candidate, ensureLivestockId, livestockIdsFor, userForLivestockId };
