const express = require('express');
const { requireAuth, primaryEmail, clerkClient, getRole } = require('../authMiddleware');
const { forgetApproval } = require('../lib/accounts');
const {
  ORG_TYPES, MEMBER_ROLES, FARMER_COLLECTIONS, OrgError, sendOrgError, getSettings, audit, notify, notifyOrgAdmins,
  newToken, hashToken, linkState, activeMembership, farmerLink, hasFarmData, requireOrgRole, endFarmerLink, col, nowIso, uuid
} = require('../lib/orgs');
const { computeDashboard, farmerList } = require('../lib/orgDashboard');

/* /api/organizations: organization registration and everything an
   organization's admins and field officers do. Every route checks the
   caller's organization role on the server (lib/orgs.js requireOrgRole);
   a suspended organization is read only. */
const router = express.Router();
router.use(requireAuth);

const APP_URL = (process.env.APP_URL || 'https://livestockpro.agricoders.com').replace(/\/$/, '');
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const nameKey = (name) => text(name).toLowerCase().replace(/\s+/g, ' ');

/* Logos are small images kept on the organization (no file store): a PNG,
   JPEG or WebP data URL up to about 150 KB. */
function cleanLogo(v) {
  if (v === null) return null;
  if (typeof v !== 'string' || !v) return undefined;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new OrgError(400, 'BAD_LOGO', 'The logo must be a PNG, JPEG or WebP image.');
  if (v.length > 210000) throw new OrgError(400, 'BAD_LOGO', 'The logo is too large. Please use an image under 150 KB.');
  return v;
}

function orgFields(body, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (!partial || body[k] !== undefined) out[k] = v; };
  set('name', text(body.name, 120));
  set('type', ORG_TYPES.includes(body.type) ? body.type : 'other');
  set('country', text(body.country, 80) || 'Rwanda');
  set('district', text(body.district, 80));
  set('sector', text(body.sector, 80));
  set('contact_email', text(body.contact_email, 160).toLowerCase());
  set('contact_phone', text(body.contact_phone, 40));
  set('description', text(body.description, 600));
  const logo = cleanLogo(body.logo);
  if (logo !== undefined) out.logo = logo;
  if (out.name !== undefined) {
    if (out.name.length < 2) throw new OrgError(400, 'NAME_REQUIRED', 'Please enter the organization name.');
    out.name_key = nameKey(out.name);
  }
  if (!partial && (!out.contact_email || !out.contact_phone)) throw new OrgError(400, 'CONTACT_REQUIRED', 'A contact email and phone number are required.');
  return out;
}

/* The organization as its members see it. */
function orgOut(org) {
  if (!org) return null;
  const { _id, name_key: _k, ...rest } = org;
  return { id: _id, ...rest, usage: { used: org.active_farmers || 0, limit: org.max_farmers || 0, pct: org.max_farmers ? Math.round(((org.active_farmers || 0) / org.max_farmers) * 100) : 0 } };
}

const linkUrl = (token) => `${APP_URL}/join/${token}`;

function linkOut(link, org, creators = new Map()) {
  return {
    id: link._id,
    status: linkState(link, org) === 'org_full' ? 'active' : linkState(link, org),
    created_at: link.created_at,
    expires_at: link.expires_at,
    max_uses: link.max_uses,
    use_count: link.use_count,
    revoked_at: link.revoked_at,
    created_by: link.created_by,
    created_by_name: creators.get(link.created_by) || ''
  };
}

/* ---------- Registration ---------- */

/* POST /api/organizations/register: the signed-in user registers an
   organization and becomes its first Organization Admin. It starts pending
   until a Logistack system admin approves it. Organization members are
   separate accounts, so a farmer with herd records cannot register. */
router.post('/register', async (req, res) => {
  try {
    const userId = req.user.id;
    if (await activeMembership(userId)) throw new OrgError(409, 'ALREADY_MEMBER', 'You already belong to an organization.');
    if (await farmerLink(userId)) throw new OrgError(409, 'FARMER_ACCOUNT', 'This account is linked to an organization as a farmer. Please use a different account for the organization.');
    if (await hasFarmData(userId)) throw new OrgError(409, 'FARMER_ACCOUNT', 'This account already has farm records. Please register the organization with a different account.');
    const body = req.body || {};
    const fields = orgFields(body);
    if (await col('organizations').findOne({ name_key: fields.name_key })) throw new OrgError(409, 'NAME_TAKEN', 'An organization with this name already exists.');
    const settings = await getSettings();
    const user = await clerkClient.users.getUser(userId);
    const now = nowIso();
    const orgId = uuid();
    await col('organizations').insertOne({
      _id: orgId, ...fields, status: 'pending', max_farmers: settings.default_max_farmers, active_farmers: 0,
      created_by: userId, approved_by: null, created_at: now, updated_at: now, approved_at: null
    });
    await col('organization_members').insertOne({ _id: uuid(), organization_id: orgId, user_id: userId, email: primaryEmail(user), role: 'org_admin', status: 'active', created_at: now, joined_at: now });
    await col('accounts').updateOne(
      { _id: userId },
      {
        $set: { kind: 'organization', organization_id: orgId, account_type: 'organization', status: 'pending', full_name: text(body.admin_name, 120) || fields.name, phone: fields.contact_phone, email: primaryEmail(user), submitted_at: now, updated_at: now },
        $setOnInsert: { user_id: userId, currency: 'RWF', created_at: now }
      },
      { upsert: true }
    );
    forgetApproval(userId);
    await audit(req, 'organization.register', { targetType: 'organization', targetId: orgId, organizationId: orgId, details: { name: fields.name } });
    res.status(201).json({ data: orgOut(await col('organizations').findOne({ _id: orgId })), error: null });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: { message: 'An organization with this name already exists.', code: 'NAME_TAKEN' } });
    sendOrgError(res, err);
  }
});

/* GET /api/organizations/mine: the caller's organization and role, and any
   staff invitation waiting for them. */
router.get('/mine', async (req, res) => {
  try {
    const m = await activeMembership(req.user.id);
    const user = await clerkClient.users.getUser(req.user.id);
    const invites = await col('organization_members').find({ email: primaryEmail(user), status: 'invited' }).toArray();
    const invitedOrgs = await col('organizations').find({ _id: { $in: invites.map((i) => i.organization_id) } }).toArray();
    res.json({
      data: {
        organization: m ? orgOut(m.org) : null,
        role: m ? m.member.role : null,
        invites: invites.map((i) => {
          const o = invitedOrgs.find((x) => x._id === i.organization_id);
          return { id: i._id, role: i.role, organization: o ? { id: o._id, name: o.name, logo: o.logo || null, type: o.type } : null, invited_at: i.created_at };
        }).filter((i) => i.organization)
      },
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /api/organizations/invites/:inviteId  { accept }: a staff member
   answers an invitation sent to their email address. */
router.post('/invites/:inviteId', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await clerkClient.users.getUser(userId);
    const invite = await col('organization_members').findOne({ _id: String(req.params.inviteId), email: primaryEmail(user), status: 'invited' });
    if (!invite) throw new OrgError(404, 'INVITE_NOT_FOUND', 'This invitation is no longer available.');
    const now = nowIso();
    if (!(req.body && req.body.accept)) {
      await col('organization_members').updateOne({ _id: invite._id }, { $set: { status: 'removed', declined_at: now } });
      await audit(req, 'member.decline', { targetType: 'member', targetId: invite._id, organizationId: invite.organization_id });
      return res.json({ data: { ok: true }, error: null });
    }
    if (await activeMembership(userId)) throw new OrgError(409, 'ALREADY_MEMBER', 'You already belong to an organization.');
    if (await farmerLink(userId) || await hasFarmData(userId)) throw new OrgError(409, 'FARMER_ACCOUNT', 'This account is used as a farmer account. Please accept the invitation with a different account.');
    const org = await col('organizations').findOne({ _id: invite.organization_id });
    await col('organization_members').updateOne({ _id: invite._id }, { $set: { status: 'active', user_id: userId, joined_at: now } });
    await col('accounts').updateOne(
      { _id: userId },
      {
        $set: { kind: 'organization', organization_id: invite.organization_id, account_type: 'organization', status: org && org.status !== 'pending' ? 'approved' : 'pending', email: primaryEmail(user), updated_at: now, reviewed_at: now },
        $setOnInsert: { user_id: userId, currency: 'RWF', created_at: now }
      },
      { upsert: true }
    );
    forgetApproval(userId);
    await audit(req, 'member.join', { targetType: 'member', targetId: invite._id, organizationId: invite.organization_id, details: { role: invite.role } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- Organization profile ---------- */

const ANY = ['org_admin', 'org_staff'];
const ADMIN = ['org_admin'];

router.get('/:id', requireOrgRole(ANY), async (req, res) => {
  const settings = await getSettings();
  res.json({ data: { ...orgOut(req.org), my_role: req.member.role, referral_link_hours: settings.referral_link_hours }, error: null });
});

router.patch('/:id', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const fields = orgFields(req.body || {}, { partial: true });
    if (fields.name_key && fields.name_key !== req.org.name_key && await col('organizations').findOne({ name_key: fields.name_key })) {
      throw new OrgError(409, 'NAME_TAKEN', 'An organization with this name already exists.');
    }
    await col('organizations').updateOne({ _id: req.org._id }, { $set: { ...fields, updated_at: nowIso() } });
    await audit(req, 'organization.update', { targetType: 'organization', targetId: req.org._id, organizationId: req.org._id, details: { fields: Object.keys(fields).filter((k) => k !== 'logo' && k !== 'name_key') } });
    res.json({ data: orgOut(await col('organizations').findOne({ _id: req.org._id })), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- Staff ---------- */

router.get('/:id/members', requireOrgRole(ANY), async (req, res) => {
  try {
    const list = await col('organization_members').find({ organization_id: req.org._id, status: { $in: ['active', 'invited'] } }).sort({ created_at: 1 }).toArray();
    const accounts = await col('accounts').find({ _id: { $in: list.map((m) => m.user_id).filter(Boolean) } }, { projection: { full_name: 1 } }).toArray();
    const names = new Map(accounts.map((a) => [a._id, a.full_name]));
    res.json({ data: list.map((m) => ({ id: m._id, email: m.email, name: names.get(m.user_id) || '', role: m.role, status: m.status, created_at: m.created_at, joined_at: m.joined_at || null, is_me: m.user_id === req.user.id })), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /api/organizations/:id/members  { email, role }: invite staff. The
   invitation waits for whoever signs in with that email address. */
router.post('/:id/members', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const email = text(req.body && req.body.email, 160).toLowerCase();
    const role = MEMBER_ROLES.includes(req.body && req.body.role) ? req.body.role : 'org_staff';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new OrgError(400, 'BAD_EMAIL', 'Please enter a valid email address.');
    if (await col('organization_members').findOne({ organization_id: req.org._id, email, status: { $in: ['active', 'invited'] } })) {
      throw new OrgError(409, 'ALREADY_INVITED', 'This person is already a member or has a pending invitation.');
    }
    const id = uuid();
    await col('organization_members').insertOne({ _id: id, organization_id: req.org._id, user_id: null, email, role, status: 'invited', invited_by: req.user.id, created_at: nowIso() });
    /* Tell them in the app if they already have an account. */
    try {
      const found = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
      const u = found.data && found.data[0];
      if (u) await notify(u.id, 'staffInvite', { name: req.org.name, role }, '/organization');
    } catch { /* invitation still stands */ }
    await audit(req, 'member.invite', { targetType: 'member', targetId: id, organizationId: req.org._id, details: { email, role } });
    res.status(201).json({ data: { id, email, role, status: 'invited' }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.patch('/:id/members/:memberId', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const role = MEMBER_ROLES.includes(req.body && req.body.role) ? req.body.role : null;
    if (!role) throw new OrgError(400, 'BAD_ROLE', 'Invalid role.');
    const member = await col('organization_members').findOne({ _id: String(req.params.memberId), organization_id: req.org._id, status: { $in: ['active', 'invited'] } });
    if (!member) throw new OrgError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
    if (member.user_id === req.user.id) throw new OrgError(400, 'SELF', 'You cannot change your own role.');
    await col('organization_members').updateOne({ _id: member._id }, { $set: { role } });
    await audit(req, 'member.role', { targetType: 'member', targetId: member._id, organizationId: req.org._id, details: { from: member.role, to: role } });
    res.json({ data: { id: member._id, role }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.delete('/:id/members/:memberId', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const member = await col('organization_members').findOne({ _id: String(req.params.memberId), organization_id: req.org._id, status: { $in: ['active', 'invited'] } });
    if (!member) throw new OrgError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
    if (member.user_id === req.user.id) throw new OrgError(400, 'SELF', 'You cannot remove yourself.');
    if (member.role === 'org_admin' && member.status === 'active') {
      const admins = await col('organization_members').countDocuments({ organization_id: req.org._id, role: 'org_admin', status: 'active' });
      if (admins <= 1) throw new OrgError(400, 'LAST_ADMIN', 'An organization needs at least one admin.');
    }
    const now = nowIso();
    await col('organization_members').updateOne({ _id: member._id }, { $set: { status: 'removed', removed_at: now, removed_by: req.user.id } });
    if (member.user_id) {
      await col('accounts').updateOne({ _id: member.user_id }, { $set: { kind: 'removed_member', status: 'pending', updated_at: now }, $unset: { organization_id: '' } });
      forgetApproval(member.user_id);
    }
    await audit(req, 'member.remove', { targetType: 'member', targetId: member._id, organizationId: req.org._id, details: { email: member.email, role: member.role } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- Referral links ---------- */

/* POST /api/organizations/:id/referral-links  { max_uses }: a random 32 byte
   token, only its hash stored, valid for the system setting (6 hours by
   default). The full link is returned once, here. */
router.post('/:id/referral-links', requireOrgRole(ANY, { write: true }), async (req, res) => {
  try {
    if (req.org.active_farmers >= req.org.max_farmers) throw new OrgError(409, 'ORG_FULL', 'Your organization has reached its farmer limit, so no new links can be made.');
    const raw = req.body && req.body.max_uses;
    const maxUses = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000)) throw new OrgError(400, 'BAD_MAX_USES', 'Maximum uses must be a whole number from 1 to 10000.');
    const settings = await getSettings();
    const token = newToken();
    const created = new Date();
    const link = {
      _id: uuid(), organization_id: req.org._id, token_hash: hashToken(token), created_by: req.user.id,
      created_at: created.toISOString(), expires_at: new Date(created.getTime() + settings.referral_link_hours * 3600 * 1000).toISOString(),
      max_uses: maxUses, use_count: 0, revoked_at: null
    };
    await col('referral_links').insertOne(link);
    await audit(req, 'link.create', { targetType: 'referral_link', targetId: link._id, organizationId: req.org._id, details: { expires_at: link.expires_at, max_uses: maxUses } });
    res.status(201).json({ data: { ...linkOut(link, req.org), url: linkUrl(token), token, app_url: `livestockpro://join/${token}` }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.get('/:id/referral-links', requireOrgRole(ANY), async (req, res) => {
  try {
    const links = await col('referral_links').find({ organization_id: req.org._id }).sort({ created_at: -1 }).limit(200).toArray();
    const creators = await col('accounts').find({ _id: { $in: [...new Set(links.map((l) => l.created_by))] } }, { projection: { full_name: 1, email: 1 } }).toArray();
    const names = new Map(creators.map((c) => [c._id, c.full_name || c.email || '']));
    res.json({ data: links.map((l) => linkOut(l, req.org, names)), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.delete('/:id/referral-links/:linkId', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const r = await col('referral_links').updateOne({ _id: String(req.params.linkId), organization_id: req.org._id, revoked_at: null }, { $set: { revoked_at: nowIso(), revoked_by: req.user.id } });
    if (!r.modifiedCount) throw new OrgError(404, 'LINK_NOT_FOUND', 'Link not found or already revoked.');
    await audit(req, 'link.revoke', { targetType: 'referral_link', targetId: String(req.params.linkId), organizationId: req.org._id });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- Farmers and dashboard ---------- */

function filtersFrom(q) {
  const f = {};
  for (const k of ['from', 'to', 'district', 'sector', 'cell', 'q']) if (q[k]) f[k] = String(q[k]).slice(0, 80);
  if (q.ids) f.ids = String(q.ids).split(',').slice(0, 5000);
  return f;
}

router.get('/:id/farmers', requireOrgRole(ANY), async (req, res) => {
  try {
    res.json({ data: await farmerList(req.org, filtersFrom(req.query)), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.get('/:id/dashboard', requireOrgRole(ANY), async (req, res) => {
  try {
    res.json({ data: await computeDashboard(req.org, filtersFrom(req.query)), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* GET /api/organizations/:id/farmers/:farmerId/records: read only herd
   records, only when the farmer has given the extra permission. */
router.get('/:id/farmers/:farmerId/records', requireOrgRole(ANY), async (req, res) => {
  try {
    const link = await col('farmer_organization').findOne({ farmer_id: String(req.params.farmerId), organization_id: req.org._id, status: 'active' });
    if (!link) throw new OrgError(404, 'FARMER_NOT_FOUND', 'This farmer is not linked to your organization.');
    if (!link.detail_access) throw new OrgError(403, 'NO_DETAIL_ACCESS', 'This farmer has not given permission to view their detailed records.');
    const hide = { projection: { user_id: 0, latitude: 0, longitude: 0 } };
    const q = { user_id: link.farmer_id, deleted_at: null };
    const pick = (name, sort, limit = 500) => col(name).find(q, hide).sort(sort).limit(limit).toArray();
    const [animals, health, breeding, production] = await Promise.all([
      pick('animals', { tag_id: 1 }, 2000), pick('health_records', { check_date: -1 }), pick('breeding_records', { breeding_date: -1 }), pick('production_records', { production_date: -1 })
    ]);
    const clean = (rows) => rows.map(({ _id, ...r }) => ({ id: _id, ...r }));
    await audit(req, 'farmer.view_records', { targetType: 'farmer', targetId: link.farmer_id, organizationId: req.org._id });
    res.json({ data: { animals: clean(animals), health: clean(health), breeding: clean(breeding), production: clean(production) }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

router.delete('/:id/farmers/:farmerId', requireOrgRole(ADMIN, { write: true }), async (req, res) => {
  try {
    const farmerId = String(req.params.farmerId);
    const ended = await endFarmerLink(farmerId, req.org._id, 'removed', req.user.id);
    if (!ended) throw new OrgError(404, 'FARMER_NOT_FOUND', 'This farmer is not linked to your organization.');
    await notify(farmerId, 'farmerRemoved', { name: req.org.name }, '/settings');
    await audit(req, 'farmer.remove', { targetType: 'farmer', targetId: farmerId, organizationId: req.org._id, details: { reason: text(req.body && req.body.reason, 300) } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* GET /api/organizations/:id/audit: the organization's own activity log
   (organization admins). */
router.get('/:id/audit', requireOrgRole(ADMIN), async (req, res) => {
  try {
    const list = await col('audit_logs').find({ organization_id: req.org._id }).sort({ at: -1 }).limit(200).toArray();
    res.json({ data: list.map(({ _id, ip: _ip, user_agent: _ua, ...r }) => ({ id: _id, ...r })), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* Exposed for the system admin routes. */
router.helpers = { orgOut, linkOut, orgFields, nameKey, FARMER_COLLECTIONS, getRole, notifyOrgAdmins };

module.exports = router;
