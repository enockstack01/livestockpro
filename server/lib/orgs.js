const crypto = require('crypto');
const { getDb, getClient } = require('../db');
const { getRole } = require('../authMiddleware');
const { sendPushToUser } = require('./pushNotify');

/* Organization accounts and farmer referral links (Logistack spec
   "Organization Accounts and Farmer Referral Architecture" v1.0), livestock
   only. Collections:
     organizations         one per organization; active_farmers is the live
                           count checked against max_farmers atomically
     organization_members  staff of an organization (org_admin, org_staff)
     referral_links        6 hour join links; only the token hash is stored
     farmer_organization   which organization a farmer belongs to, with history
     audit_logs            every important action
     notifications         in-app notifications (bell), also sent as push
     farmer_stats          per farmer summaries the dashboards read, refreshed
                           hourly and whenever a farmer joins
     system_settings       referral validity hours, default farmer limit
   Organization members and farmers are separate accounts: a member cannot
   keep herd records and cannot join an organization as a farmer. */

const ORG_TYPES = ['cooperative', 'ngo', 'company', 'government', 'other'];
const ORG_STATUSES = ['pending', 'active', 'suspended'];
const MEMBER_ROLES = ['org_admin', 'org_staff'];
const FARMER_COLLECTIONS = ['animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'finance_records', 'tasks'];

const col = (name) => getDb().collection(name);
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

class OrgError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendOrgError(res, err) {
  if (err instanceof OrgError) return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  console.error('Organization error:', err);
  res.status(500).json({ error: { message: err.message } });
}

/* ---------- System settings ---------- */

const DEFAULT_SETTINGS = { referral_link_hours: 6, default_max_farmers: 50 };
let settingsCache = null;

async function getSettings() {
  if (settingsCache && settingsCache.until > Date.now()) return settingsCache.value;
  const doc = await col('system_settings').findOne({ _id: 'global' });
  const value = { ...DEFAULT_SETTINGS, ...(doc || {}) };
  delete value._id;
  settingsCache = { value, until: Date.now() + 60 * 1000 };
  return value;
}

async function updateSettings(patch, userId) {
  const clean = {};
  if (patch.referral_link_hours !== undefined) {
    const h = Number(patch.referral_link_hours);
    if (!Number.isFinite(h) || h < 0.25 || h > 720) throw new OrgError(400, 'BAD_SETTING', 'Referral link validity must be between 0.25 and 720 hours.');
    clean.referral_link_hours = h;
  }
  if (patch.default_max_farmers !== undefined) {
    const n = Number(patch.default_max_farmers);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new OrgError(400, 'BAD_SETTING', 'The default farmer limit must be a whole number.');
    clean.default_max_farmers = n;
  }
  await col('system_settings').updateOne({ _id: 'global' }, { $set: { ...clean, updated_at: nowIso(), updated_by: userId } }, { upsert: true });
  settingsCache = null;
  return getSettings();
}

/* ---------- Audit log ---------- */

async function audit(req, action, { targetType, targetId, organizationId, details } = {}) {
  try {
    await col('audit_logs').insertOne({
      _id: uuid(),
      at: nowIso(),
      actor_id: req && req.user ? req.user.id : null,
      actor_email: req && req.user ? req.user.email || null : null,
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      organization_id: organizationId || null,
      details: details || null,
      ip: req ? req.ip : null,
      user_agent: req && req.get ? (req.get('user-agent') || '').slice(0, 300) : null
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

/* ---------- Notifications (bell + push) ----------
   Stored as a translation key plus values so each app shows them in the
   user's language; the push uses the English text. */
const PUSH_TEXT = {
  orgApproved: ['Organization approved', '{{name}} is active. You can now invite farmers.'],
  orgSuspended: ['Organization suspended', '{{name}} has been suspended. Referral links are paused.'],
  orgReactivated: ['Organization reactivated', '{{name}} is active again.'],
  orgLimitChanged: ['Farmer limit changed', '{{name}} can now have up to {{limit}} farmers.'],
  orgUsage80: ['Farmer limit almost reached', '{{name}} has {{count}} of {{limit}} farmers.'],
  orgUsage100: ['Farmer limit reached', '{{name}} has reached its limit of {{limit}} farmers.'],
  farmerJoined: ['New farmer joined', '{{farmer}} joined {{name}}.'],
  farmerLeft: ['Farmer left', '{{farmer}} left {{name}}.'],
  farmerRemoved: ['Removed from organization', 'You are no longer linked to {{name}}.'],
  orgInvite: ['Join your organization', 'You have been added to {{name}}. Please confirm sharing your farm summary.'],
  staffInvite: ['Organization invitation', 'You have been invited to {{name}} as {{role}}.']
};
const fill = (s, vars) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));

async function notify(userId, key, vars = {}, link = null) {
  try {
    await col('notifications').insertOne({ _id: uuid(), user_id: userId, key, vars, link, read_at: null, created_at: nowIso() });
    const text = PUSH_TEXT[key];
    if (text) sendPushToUser(userId, { title: fill(text[0], vars), body: fill(text[1], vars), data: { link } }).catch(() => {});
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

async function notifyOrgAdmins(orgId, key, vars, link) {
  const admins = await col('organization_members').find({ organization_id: orgId, role: 'org_admin', status: 'active' }).toArray();
  await Promise.all(admins.map((m) => notify(m.user_id, key, vars, link)));
}

/* ---------- Referral tokens ---------- */

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/* Why a link can or cannot be used right now, always on server time. */
function linkState(link, org, now = Date.now()) {
  if (!link) return 'invalid';
  if (link.revoked_at) return 'revoked';
  if (new Date(link.expires_at).getTime() <= now) return 'expired';
  if (!org || org.status === 'suspended') return 'suspended';
  if (org.status !== 'active') return 'invalid';
  if (link.max_uses != null && link.use_count >= link.max_uses) return 'full';
  if (org.active_farmers >= org.max_farmers) return 'org_full';
  return 'active';
}

const JOIN_ERRORS = {
  invalid: [404, 'LINK_INVALID', 'This invitation link is no longer valid. Please contact your organization.'],
  revoked: [410, 'LINK_INVALID', 'This invitation link is no longer valid. Please contact your organization.'],
  expired: [410, 'LINK_EXPIRED', 'This invitation link has expired. Please ask your organization for a new link.'],
  full: [409, 'LINK_FULL', 'This invitation link has been used the maximum number of times. Please ask your organization for a new link.'],
  org_full: [409, 'ORG_FULL', 'This organization cannot accept more farmers at the moment. Please contact your organization.'],
  suspended: [409, 'ORG_SUSPENDED', 'This organization is not accepting new farmers at the moment.']
};
function joinError(state) {
  const [status, code, message] = JOIN_ERRORS[state] || JOIN_ERRORS.invalid;
  return new OrgError(status, code, message);
}

async function findLink(token) {
  if (!token || String(token).length < 20 || String(token).length > 200) return { link: null, org: null };
  const link = await col('referral_links').findOne({ token_hash: hashToken(token) });
  const org = link ? await col('organizations').findOne({ _id: link.organization_id }) : null;
  return { link, org };
}

/* ---------- Who is who ---------- */

async function activeMembership(userId) {
  const member = await col('organization_members').findOne({ user_id: userId, status: 'active' });
  if (!member) return null;
  const org = await col('organizations').findOne({ _id: member.organization_id });
  return org ? { member, org } : null;
}

async function farmerLink(userId) {
  const link = await col('farmer_organization').findOne({ farmer_id: userId, status: { $in: ['active', 'pending_consent'] } });
  if (!link) return null;
  const org = await col('organizations').findOne({ _id: link.organization_id });
  return org ? { link, org } : null;
}

async function hasFarmData(userId) {
  for (const name of FARMER_COLLECTIONS) {
    if (await col(name).findOne({ user_id: userId, deleted_at: null }, { projection: { _id: 1 } })) return true;
  }
  return false;
}

/* Organization members are not farmers: the farm data API refuses them. */
async function isOrgAccount(userId) {
  return Boolean(await col('organization_members').findOne({ user_id: userId, status: 'active' }, { projection: { _id: 1 } }));
}

/* Express guard for /api/organizations/:id/... routes. `roles` lists the
   organization roles allowed; system admins pass for reading. With
   write: true the organization must be active (suspended means read only). */
function requireOrgRole(roles, { write = false } = {}) {
  return async (req, res, next) => {
    try {
      const orgId = String(req.params.id || '');
      const m = await activeMembership(req.user.id);
      if (m && m.org._id === orgId && roles.includes(m.member.role)) {
        if (write && m.org.status !== 'active') {
          return res.status(403).json({ error: { message: 'This organization is not active, so it is read only.', code: 'ORG_READ_ONLY' } });
        }
        req.org = m.org;
        req.member = m.member;
        return next();
      }
      if (!write && (await getRole(req.user.id)) !== 'user') {
        const org = await col('organizations').findOne({ _id: orgId });
        if (!org) return res.status(404).json({ error: { message: 'Organization not found.' } });
        req.org = org;
        req.member = { role: 'system_admin' };
        return next();
      }
      res.status(403).json({ error: { message: 'You do not have access to this organization.', code: 'ORG_FORBIDDEN' } });
    } catch (err) {
      sendOrgError(res, err);
    }
  };
}

/* ---------- Joining and leaving ---------- */

/* A farmer joins through a referral link. Everything happens in one
   transaction: the link and the organization are checked again on server
   time, the organization's active_farmers counter is raised only if it is
   below max_farmers (so concurrent joins can never pass the limit), the
   link's use_count is raised only if below max_uses, and the membership row
   is created (the partial unique index keeps one organization per farmer).
   The farmer's account is approved, because the organization vouches. */
async function joinOrganization({ userId, token, consent, detailAccess = false, profile = null }) {
  if (!consent) throw new OrgError(400, 'CONSENT_REQUIRED', 'Please agree to share your farm summary with the organization.');
  if (await isOrgAccount(userId)) throw new OrgError(409, 'ORG_ACCOUNT', 'Organization accounts cannot join as farmers. Please sign in with a farmer account.');
  const { link, org } = await findLink(token);
  const existing = await farmerLink(userId);
  if (existing) {
    if (org && existing.org._id === org._id) throw new OrgError(409, 'ALREADY_MEMBER', 'You are already a member of this organization.');
    throw new OrgError(409, 'OTHER_ORG', 'You are currently linked to another organization. Leave it first or contact support.');
  }
  const state = linkState(link, org);
  if (state !== 'active') throw joinError(state);

  const session = getClient().startSession();
  const now = nowIso();
  const rowId = uuid();
  try {
    await session.withTransaction(async () => {
      const orgUpdate = await col('organizations').updateOne(
        { _id: org._id, status: 'active', $expr: { $lt: ['$active_farmers', '$max_farmers'] } },
        { $inc: { active_farmers: 1 }, $set: { updated_at: now } },
        { session }
      );
      if (!orgUpdate.modifiedCount) {
        const fresh = await col('organizations').findOne({ _id: org._id }, { session });
        throw joinError(fresh && fresh.status !== 'active' ? 'suspended' : 'org_full');
      }
      const linkFilter = { _id: link._id, revoked_at: null, expires_at: { $gt: new Date().toISOString() } };
      if (link.max_uses != null) linkFilter.use_count = { $lt: link.max_uses };
      const linkUpdate = await col('referral_links').updateOne(linkFilter, { $inc: { use_count: 1 } }, { session });
      if (!linkUpdate.modifiedCount) {
        const fresh = await col('referral_links').findOne({ _id: link._id }, { session });
        throw joinError(linkState(fresh, { ...org, active_farmers: 0 }));
      }
      await col('farmer_organization').insertOne({
        _id: rowId, farmer_id: userId, organization_id: org._id, referral_link_id: link._id, status: 'active',
        consent_given_at: now, consent_source: 'referral_link', detail_access: Boolean(detailAccess),
        detail_access_at: detailAccess ? now : null, joined_at: now, ended_at: null
      }, { session });
      await col('accounts').updateOne(
        { _id: userId },
        {
          $set: { status: 'approved', approved_via: 'referral', reviewed_at: now, updated_at: now, account_type: 'farmer', ...(profile || {}) },
          $setOnInsert: { user_id: userId, currency: 'RWF', created_at: now }
        },
        { upsert: true, session }
      );
    });
  } catch (err) {
    if (err && err.code === 11000) throw new OrgError(409, 'OTHER_ORG', 'You are currently linked to another organization. Leave it first or contact support.');
    throw err;
  } finally {
    await session.endSession();
  }

  const fresh = await col('organizations').findOne({ _id: org._id });
  refreshFarmerStats(userId).catch(() => {});
  usageNotices(fresh, org.active_farmers).catch(() => {});
  return { org: fresh, membershipId: rowId };
}

/* Notifications at 80 percent and 100 percent of the limit. */
async function usageNotices(org, before) {
  if (!org || !org.max_farmers) return;
  const vars = { name: org.name, count: org.active_farmers, limit: org.max_farmers };
  const crossed = (p) => before < Math.ceil(org.max_farmers * p) && org.active_farmers >= Math.ceil(org.max_farmers * p);
  if (crossed(1)) await notifyOrgAdmins(org._id, 'orgUsage100', vars, '/organization');
  else if (crossed(0.8)) await notifyOrgAdmins(org._id, 'orgUsage80', vars, '/organization');
}

/* Ends a farmer's link (left by the farmer, or removed by the organization)
   and frees their place in the organization's limit. */
async function endFarmerLink(farmerId, organizationId, status, by) {
  const now = nowIso();
  const row = await col('farmer_organization').findOneAndUpdate(
    { farmer_id: farmerId, organization_id: organizationId, status: { $in: ['active', 'pending_consent'] } },
    { $set: { status, ended_at: now, ended_by: by } },
    { returnDocument: 'before' }
  );
  const before = row && (row.value !== undefined ? row.value : row);
  if (!before || !before._id) return null;
  await col('organizations').updateOne({ _id: organizationId, active_farmers: { $gt: 0 } }, { $inc: { active_farmers: -1 }, $set: { updated_at: now } });
  return before;
}

/* ---------- Farmer summaries for the dashboards ---------- */

const ym = (s) => (s ? String(s).slice(0, 7) : '');
const VACCINE_RE = /vaccin|vacin|chanjo|inkingo|impf|疫苗|टीका|لقاح/i;

async function farmerName(userId) {
  const [account, profile] = await Promise.all([
    col('accounts').findOne({ _id: userId }, { projection: { full_name: 1, email: 1 } }),
    col('profiles').findOne({ user_id: userId, deleted_at: null })
  ]);
  return {
    name: (account && account.full_name) || (profile && profile.farm_name) || (account && account.email) || 'Farmer',
    email: (account && account.email) || '',
    profile
  };
}

async function refreshFarmerStats(farmerId) {
  const q = { user_id: farmerId, deleted_at: null };
  const [who, animals, health, breeding, production, tasks, feeding, finance] = await Promise.all([
    farmerName(farmerId),
    col('animals').find(q).toArray(),
    col('health_records').find(q).toArray(),
    col('breeding_records').find(q).toArray(),
    col('production_records').find(q).toArray(),
    col('tasks').find(q).toArray(),
    col('feeding_records').find(q, { projection: { updated_at: 1, created_at: 1, feeding_date: 1 } }).toArray(),
    col('finance_records').find(q, { projection: { updated_at: 1, created_at: 1, date: 1 } }).toArray()
  ]);
  const p = who.profile || {};
  const living = animals.filter((a) => a.health_status !== 'Deceased');
  const bySpecies = {};
  const byStatus = { Healthy: 0, 'Under Treatment': 0, Critical: 0 };
  living.forEach((a) => {
    const s = a.species || 'Other';
    bySpecies[s] = (bySpecies[s] || 0) + 1;
    const st = a.health_status || 'Healthy';
    if (byStatus[st] !== undefined) byStatus[st]++;
  });
  const months = {};
  const bump = (key, field, n = 1) => {
    if (!key) return;
    months[key] = months[key] || {};
    months[key][field] = Math.round(((months[key][field] || 0) + n) * 100) / 100;
  };
  health.forEach((h) => {
    const k = ym(h.check_date || h.created_at);
    bump(k, 'health_events');
    if (h.status === 'Critical') bump(k, 'critical');
    if (h.status === 'Recovered') bump(k, 'recovered');
    if (VACCINE_RE.test(`${h.disease || ''} ${h.treatment || ''} ${h.medicine || ''} ${h.notes || ''}`)) bump(k, 'vaccinations');
  });
  breeding.forEach((b) => {
    if (b.birth_date) { bump(ym(b.birth_date), 'births'); bump(ym(b.birth_date), 'newborns', Number(b.newborn_count) || 1); }
    if (b.breeding_date) bump(ym(b.breeding_date), 'breedings');
  });
  production.forEach((r) => {
    const t = (r.production_type || '').toLowerCase();
    const field = t === 'milk' ? 'milk' : t === 'eggs' ? 'eggs' : t === 'meat' ? 'meat' : null;
    if (field) bump(ym(r.production_date), field, Number(r.quantity) || 0);
  });
  animals.forEach((a) => bump(ym(a.created_at), 'animals_added'));
  const all = [...animals, ...health, ...breeding, ...production, ...tasks, ...feeding, ...finance];
  all.forEach((r) => bump(ym(r.created_at), 'records'));
  const lastActivity = all.reduce((m, r) => {
    const t = r.updated_at || r.created_at || '';
    return t > m ? t : m;
  }, '');
  const today = nowIso().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const diseases = {};
  health.filter((h) => (h.check_date || '') >= since30 && h.disease).forEach((h) => {
    const d = String(h.disease).trim().slice(0, 60);
    diseases[d] = (diseases[d] || 0) + 1;
  });
  const located = animals.find((a) => Number.isFinite(Number(a.latitude)) && a.latitude !== null && a.latitude !== '');

  const doc = {
    farmer_id: farmerId,
    updated_at: nowIso(),
    name: who.name,
    email: who.email,
    farm_name: p.farm_name || '',
    phone: p.phone || '',
    location: p.location || '',
    district: p.district || (living.find((a) => a.district) || {}).district || '',
    sector: p.sector || '',
    cell: p.cell || '',
    lat: located ? Number(located.latitude) : null,
    lng: located ? Number(located.longitude) : null,
    herd: { total: living.length, deceased: animals.length - living.length, by_species: bySpecies, by_status: byStatus },
    pregnant: breeding.filter((b) => b.pregnancy_status === 'Pregnant' && !b.birth_date).length,
    open_cases: health.filter((h) => h.status && h.status !== 'Recovered').length,
    critical_now: byStatus.Critical,
    overdue_tasks: tasks.filter((tk) => tk.status !== 'Completed' && tk.due_date && tk.due_date < today).length,
    diseases_30d: diseases,
    months,
    last_activity: lastActivity || null
  };
  await col('farmer_stats').updateOne({ farmer_id: farmerId }, { $set: doc }, { upsert: true });
  return doc;
}

let refreshing = false;
async function refreshAllFarmerStats() {
  if (refreshing) return;
  refreshing = true;
  try {
    const ids = await col('farmer_organization').distinct('farmer_id', { status: { $in: ['active', 'pending_consent'] } });
    for (const id of ids) {
      try { await refreshFarmerStats(id); } catch (err) { console.error('Farmer stats failed:', id, err.message); }
    }
  } finally {
    refreshing = false;
  }
}

/* Hourly refresh of the dashboard summaries, plus one shortly after boot. */
function startStatsJob() {
  setTimeout(() => refreshAllFarmerStats().catch(() => {}), 30 * 1000);
  setInterval(() => refreshAllFarmerStats().catch(() => {}), 60 * 60 * 1000).unref();
}

module.exports = {
  ORG_TYPES, ORG_STATUSES, MEMBER_ROLES, FARMER_COLLECTIONS, OrgError, sendOrgError,
  getSettings, updateSettings, audit, notify, notifyOrgAdmins,
  newToken, hashToken, linkState, joinError, findLink,
  activeMembership, farmerLink, hasFarmData, isOrgAccount, requireOrgRole,
  joinOrganization, endFarmerLink, usageNotices, refreshFarmerStats, refreshAllFarmerStats, startStatsJob, farmerName,
  col, nowIso, uuid
};
