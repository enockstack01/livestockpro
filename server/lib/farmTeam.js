const crypto = require('crypto');
const { getDb } = require('../db');
const { isOrgAccount, inviteByEmail } = require('./orgs');

/* Farm teams: a farm manager (any approved farmer account) invites data
   collectors by email. A collector's records are saved into the manager's
   farm (user_id stays the manager's) and tagged with `recorded_by`, so the
   manager sees everything and who entered it. Collections:
     farm_members   one active row per collector (_id = the collector's user id)
     farm_invites   collectors invited by email until they first sign in
   A collector cannot keep a farm of their own, cannot belong to an
   organization and sees no money, reports or AI screens. */

const col = (name) => getDb().collection(name);
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const MAX_COLLECTORS = 20;
const INVITE_DAYS = 30;
const TABLES = ['animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'tasks'];

class TeamError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendTeamError(res, err) {
  if (err instanceof TeamError) return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  console.error('Team error:', err);
  res.status(500).json({ error: { message: err.message } });
}

/* ---------- Who is this user on a farm? ---------- */

const cache = new Map();
const CACHE_MS = 30 * 1000;
function forgetTeamRole(userId) { cache.delete(userId); }

/* The farm a user records into: { ownerId, role: 'manager' | 'collector' }. */
async function farmScope(userId) {
  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.value;
  const m = await col('farm_members').findOne({ _id: userId, status: 'active' }, { projection: { owner_id: 1 } });
  const value = m ? { ownerId: m.owner_id, role: 'collector' } : { ownerId: userId, role: 'manager' };
  cache.set(userId, { value, until: Date.now() + CACHE_MS });
  return value;
}

async function collectorMembership(userId) {
  return col('farm_members').findOne({ _id: userId, status: 'active' });
}

/* ---------- Inviting ---------- */

const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function ownerName(ownerId) {
  const [p, a] = await Promise.all([
    col('profiles').findOne({ user_id: ownerId, deleted_at: null }, { projection: { farm_name: 1 } }),
    col('accounts').findOne({ _id: ownerId }, { projection: { full_name: 1 } })
  ]);
  return (p && p.farm_name) || (a && a.full_name) || '';
}

async function inviteCollector({ ownerId, details, clerkClient }) {
  const email = clean(details.email, 200).toLowerCase();
  const fullName = clean(details.full_name);
  if (!fullName) throw new TeamError(400, 'NAME_REQUIRED', 'Enter the collector\'s name.');
  if (!emailOk(email)) throw new TeamError(400, 'EMAIL_INVALID', 'Enter a valid email address.');

  const [members, invites] = await Promise.all([
    col('farm_members').countDocuments({ owner_id: ownerId, status: 'active' }),
    col('farm_invites').countDocuments({ owner_id: ownerId, status: 'invited' })
  ]);
  if (members + invites >= MAX_COLLECTORS) throw new TeamError(409, 'TEAM_FULL', `A farm can have up to ${MAX_COLLECTORS} data collectors.`);
  if (await col('farm_invites').findOne({ email, status: 'invited' })) throw new TeamError(409, 'ALREADY_INVITED', 'This person already has an invitation waiting.');

  /* Only a new person can be invited: the invitation turns into their
     account on their first sign in, so anyone who already has an account
     (their own farm, an organization, or a team) cannot become a collector. */
  try {
    const found = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
    const existing = found.data && found.data[0];
    if (existing) throw new TeamError(409, existing.id === ownerId ? 'SELF' : 'HAS_ACCOUNT', existing.id === ownerId ? 'You cannot invite yourself.' : 'This email already has a LivestockPro account. A data collector needs a new account, so use another email address.');
  } catch (err) {
    if (err instanceof TeamError) throw err; /* a Clerk lookup failure is treated as a new person */
  }

  const id = uuid();
  const farm = await ownerName(ownerId);
  const sent = await inviteByEmail({
    clerkClient, email, notice: 'collectorInvite', vars: { farm: farm || 'a farm' }, link: '/dashboard',
    metadata: { collector_invite_id: id }
  });
  if (sent === 'failed') throw new TeamError(502, 'INVITE_FAILED', 'The invitation email could not be sent. Check the address and try again.');
  try {
    await col('farm_invites').insertOne({
      _id: id, owner_id: ownerId, email, full_name: fullName, phone: clean(details.phone, 40), status: 'invited', created_at: nowIso()
    });
  } catch (err) {
    if (err && err.code === 11000) throw new TeamError(409, 'ALREADY_INVITED', 'This person already has an invitation waiting.');
    throw err;
  }
  return { id, delivery: sent };
}

async function hasOwnFarm(userId) {
  for (const name of [...TABLES, 'finance_records']) {
    if (await col(name).findOne({ user_id: userId, deleted_at: null }, { projection: { _id: 1 } })) return true;
  }
  return false;
}

async function revokeInvite({ ownerId, inviteId, clerkClient }) {
  const r = await col('farm_invites').findOneAndUpdate({ _id: String(inviteId), owner_id: ownerId, status: 'invited' }, { $set: { status: 'revoked', ended_at: nowIso() } });
  const before = r && (r.value !== undefined ? r.value : r);
  if (!before || !before._id) throw new TeamError(404, 'NOT_FOUND', 'That invitation is no longer waiting.');
  /* Recall the email invitation too, so the link cannot be used to sign up (best effort). */
  try {
    const pending = await clerkClient.invitations.getInvitationList({ status: 'pending', limit: 100 });
    const list = Array.isArray(pending) ? pending : pending.data || [];
    await Promise.all(list.filter((i) => String(i.emailAddress).toLowerCase() === before.email).map((i) => clerkClient.invitations.revokeInvitation(i.id)));
  } catch (err) {
    console.error('Recalling the invitation email failed:', err.message);
  }
  return true;
}

/* A first visit by someone invited as a collector turns their invitation
   into a membership (the account itself still needs a system admin's
   approval, like every account). Returns the membership or null. */
async function claimCollectorInvite(userId, email) {
  const address = String(email || '').toLowerCase();
  if (!address) return null;
  const r = await col('farm_invites').findOneAndUpdate(
    { email: address, status: 'invited' },
    { $set: { status: 'claimed', claimed_by: userId, claimed_at: nowIso() } },
    { returnDocument: 'before' }
  );
  const invite = r && (r.value !== undefined ? r.value : r);
  if (!invite || !invite._id) return null;
  if ((await isOrgAccount(userId)) || (await hasOwnFarm(userId)) || userId === invite.owner_id) {
    await col('farm_invites').updateOne({ _id: invite._id }, { $set: { status: 'unusable' } });
    return null;
  }
  const now = nowIso();
  await col('farm_members').updateOne(
    { _id: userId },
    { $set: { user_id: userId, owner_id: invite.owner_id, status: 'active', full_name: invite.full_name, email: address, phone: invite.phone, invited_at: invite.created_at, joined_at: now, removed_at: null } },
    { upsert: true }
  );
  await col('accounts').updateOne(
    { _id: userId },
    {
      $set: { status: 'pending', joined_via: 'farm_team', account_type: 'data_collector', email: address, full_name: invite.full_name, phone: invite.phone, location: '', submitted_at: now, review_note: '', updated_at: now },
      $setOnInsert: { user_id: userId, currency: 'RWF', created_at: now }
    },
    { upsert: true }
  );
  forgetTeamRole(userId);
  require('./platformAdmins').notifyAdmins('accountRequest', { name: invite.full_name || address }).catch(() => {});
  return invite;
}

async function removeCollector({ ownerId, memberId }) {
  const r = await col('farm_members').updateOne({ _id: String(memberId), owner_id: ownerId, status: 'active' }, { $set: { status: 'removed', removed_at: nowIso() } });
  if (!r.matchedCount) throw new TeamError(404, 'NOT_FOUND', 'That data collector is not on your team.');
  forgetTeamRole(String(memberId));
  return true;
}

/* ---------- What the team has recorded ---------- */

const dayStart = (n) => new Date(Date.now() - n * 86400000).toISOString();

/* Team overview for the manager: each collector with entries in the last
   7 and 30 days and when they last recorded something, the waiting
   invitations, and entries per day for the last 14 days. */
async function teamOverview(ownerId) {
  const [members, invites] = await Promise.all([
    col('farm_members').find({ owner_id: ownerId, status: 'active' }).sort({ joined_at: 1 }).toArray(),
    col('farm_invites').find({ owner_id: ownerId, status: 'invited' }).sort({ created_at: -1 }).toArray()
  ]);
  const ids = members.map((m) => m._id);
  const since14 = dayStart(14);
  const rows = [];
  if (ids.length) {
    await Promise.all(TABLES.map(async (table) => {
      const docs = await col(table).find({ user_id: ownerId, recorded_by: { $in: ids }, created_at: { $gte: since14 }, deleted_at: null }, { projection: { recorded_by: 1, created_at: 1 } }).toArray();
      docs.forEach((d) => rows.push({ table, by: d.recorded_by, at: d.created_at }));
    }));
  }
  const since7 = dayStart(7);
  const stats = {};
  ids.forEach((id) => { stats[id] = { week: 0, fortnight: 0, last: null, byTable: {} }; });
  const perDay = {};
  for (let i = 13; i >= 0; i--) perDay[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
  rows.forEach((r) => {
    const s = stats[r.by];
    if (!s) return;
    s.fortnight += 1;
    if (r.at >= since7) { s.week += 1; s.byTable[r.table] = (s.byTable[r.table] || 0) + 1; }
    if (!s.last || r.at > s.last) s.last = r.at;
    const d = String(r.at).slice(0, 10);
    if (d in perDay) perDay[d] += 1;
  });
  return {
    limit: MAX_COLLECTORS,
    members: members.map((m) => ({ id: m._id, name: m.full_name, email: m.email, phone: m.phone || '', joined_at: m.joined_at, ...stats[m._id] })),
    invites: invites.map((i) => ({ id: i._id, name: i.full_name, email: i.email, phone: i.phone || '', invited_at: i.created_at })),
    perDay: Object.entries(perDay).map(([date, count]) => ({ date, count }))
  };
}

/* The latest entries collectors made, newest first. */
async function teamActivity(ownerId, limit = 30) {
  const members = await col('farm_members').find({ owner_id: ownerId }).toArray();
  const names = Object.fromEntries(members.map((m) => [m._id, m.full_name || m.email]));
  const ids = members.map((m) => m._id);
  if (!ids.length) return [];
  const all = [];
  await Promise.all(TABLES.map(async (table) => {
    const docs = await col(table).find({ user_id: ownerId, recorded_by: { $in: ids }, deleted_at: null }, { projection: { recorded_by: 1, created_at: 1, tag_id: 1, name: 1, title: 1, disease: 1, feed_type: 1, production_type: 1 } }).sort({ created_at: -1 }).limit(limit).toArray();
    docs.forEach((d) => all.push({ id: d._id, table, by: names[d.recorded_by] || '', at: d.created_at, label: d.tag_id || d.name || d.title || d.disease || d.feed_type || d.production_type || '' }));
  }));
  return all.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

module.exports = {
  TeamError, sendTeamError, TABLES, MAX_COLLECTORS,
  farmScope, forgetTeamRole, collectorMembership, inviteCollector, revokeInvite, claimCollectorInvite, removeCollector,
  teamOverview, teamActivity, ownerName
};
