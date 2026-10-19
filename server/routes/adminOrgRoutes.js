const express = require('express');
const { requireAuth, requireRole, primaryEmail, clerkClient } = require('../authMiddleware');
const { forgetApproval } = require('../lib/accounts');
const {
  ORG_STATUSES, OrgError, sendOrgError, getSettings, updateSettings, audit, notify, notifyOrgAdmins,
  activeMembership, farmerLink, hasFarmData, refreshFarmerStats, col, nowIso, uuid
} = require('../lib/orgs');
const { farmerList } = require('../lib/orgDashboard');
const orgRoutes = require('./orgRoutes');

const { orgOut, linkOut, orgFields } = orgRoutes.helpers;

/* System admin (Logistack) controls for organizations: admins and super
   admins are both System Admins; only super admins change system settings
   and delete organizations. Mounted at /api/admin. */
const router = express.Router();
router.use(requireAuth, requireRole('admin'));
const superOnly = requireRole('super_admin');

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* GET /api/admin/organizations?status=pending */
router.get('/organizations', async (req, res) => {
  try {
    const filter = {};
    if (ORG_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const orgs = await col('organizations').find(filter, { projection: { logo: 0 } }).sort({ created_at: -1 }).limit(1000).toArray();
    const admins = await col('organization_members').find({ organization_id: { $in: orgs.map((o) => o._id) }, role: 'org_admin', status: { $in: ['active', 'invited'] } }).toArray();
    res.json({
      data: orgs.map((o) => ({ ...orgOut(o), admins: admins.filter((a) => a.organization_id === o._id).map((a) => ({ email: a.email, status: a.status })) })),
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /api/admin/organizations: create an organization directly, active
   straight away, with an invitation for its first admin. */
router.post('/organizations', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = orgFields(body);
    const adminEmail = text(body.admin_email, 160).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) throw new OrgError(400, 'BAD_EMAIL', 'Please enter the email address of the organization admin.');
    if (await col('organizations').findOne({ name_key: fields.name_key })) throw new OrgError(409, 'NAME_TAKEN', 'An organization with this name already exists.');
    const settings = await getSettings();
    const max = body.max_farmers === undefined || body.max_farmers === '' ? settings.default_max_farmers : Number(body.max_farmers);
    if (!Number.isInteger(max) || max < 0) throw new OrgError(400, 'BAD_LIMIT', 'The farmer limit must be a whole number.');
    const now = nowIso();
    const orgId = uuid();
    await col('organizations').insertOne({ _id: orgId, ...fields, status: 'active', max_farmers: max, active_farmers: 0, created_by: req.user.id, approved_by: req.user.id, created_at: now, updated_at: now, approved_at: now });
    await col('organization_members').insertOne({ _id: uuid(), organization_id: orgId, user_id: null, email: adminEmail, role: 'org_admin', status: 'invited', invited_by: req.user.id, created_at: now });
    await audit(req, 'organization.create', { targetType: 'organization', targetId: orgId, organizationId: orgId, details: { name: fields.name, max_farmers: max, admin_email: adminEmail } });
    res.status(201).json({ data: orgOut(await col('organizations').findOne({ _id: orgId })), error: null });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: { message: 'An organization with this name already exists.', code: 'NAME_TAKEN' } });
    sendOrgError(res, err);
  }
});

/* GET /api/admin/organizations/:id: detail with members, links and farmers. */
router.get('/organizations/:id', async (req, res) => {
  try {
    const org = await col('organizations').findOne({ _id: String(req.params.id) });
    if (!org) throw new OrgError(404, 'NOT_FOUND', 'Organization not found.');
    const [members, links, farmers, audits] = await Promise.all([
      col('organization_members').find({ organization_id: org._id, status: { $in: ['active', 'invited'] } }).toArray(),
      col('referral_links').find({ organization_id: org._id }).sort({ created_at: -1 }).limit(100).toArray(),
      farmerList(org),
      col('audit_logs').find({ organization_id: org._id }).sort({ at: -1 }).limit(50).toArray()
    ]);
    res.json({
      data: {
        ...orgOut(org),
        members: members.map((m) => ({ id: m._id, email: m.email, role: m.role, status: m.status, created_at: m.created_at })),
        links: links.map((l) => linkOut(l, org)),
        farmers,
        audit: audits.map(({ _id, ...a }) => ({ id: _id, ...a }))
      },
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* PATCH /api/admin/organizations/:id
   { action: 'approve' | 'suspend' | 'reactivate', max_farmers, reason, ...profile }
   Approving activates the organization and its pending admin accounts.
   Suspending stops every referral link at once and makes the organization
   read only; its farmers are never disabled. Lowering the limit below the
   current count keeps existing farmers but blocks new joins. */
router.patch('/organizations/:id', async (req, res) => {
  try {
    const org = await col('organizations').findOne({ _id: String(req.params.id) });
    if (!org) throw new OrgError(404, 'NOT_FOUND', 'Organization not found.');
    const body = req.body || {};
    const now = nowIso();
    const set = { updated_at: now };
    const reason = text(body.reason, 500);
    const events = [];

    if (body.action) {
      const to = { approve: 'active', reactivate: 'active', suspend: 'suspended' }[body.action];
      if (!to) throw new OrgError(400, 'BAD_ACTION', 'Unknown action.');
      if (body.action === 'approve' && org.status !== 'pending') throw new OrgError(409, 'NOT_PENDING', 'This organization is not waiting for approval.');
      set.status = to;
      if (body.action === 'approve') { set.approved_by = req.user.id; set.approved_at = now; }
      if (body.action === 'suspend') { set.suspended_at = now; set.suspended_reason = reason; }
      events.push({ action: `organization.${body.action}`, details: { from: org.status, to, reason } });
    }
    if (body.max_farmers !== undefined) {
      const max = Number(body.max_farmers);
      if (!Number.isInteger(max) || max < 0 || max > 1000000) throw new OrgError(400, 'BAD_LIMIT', 'The farmer limit must be a whole number.');
      if (!reason) throw new OrgError(400, 'REASON_REQUIRED', 'Please enter a reason for changing the farmer limit.');
      if (max !== org.max_farmers) {
        set.max_farmers = max;
        events.push({ action: 'organization.limit', details: { from: org.max_farmers, to: max, reason } });
      }
    }
    const profile = orgFields(body, { partial: true });
    Object.assign(set, profile);

    await col('organizations').updateOne({ _id: org._id }, { $set: set });
    const fresh = await col('organizations').findOne({ _id: org._id });

    /* Organization accounts follow the organization's approval. */
    if (set.status === 'active' && org.status === 'pending') {
      const members = await col('organization_members').find({ organization_id: org._id, status: 'active' }).toArray();
      for (const m of members) {
        await col('accounts').updateOne({ _id: m.user_id }, { $set: { status: 'approved', reviewed_at: now, reviewed_by: req.user.id, updated_at: now } });
        forgetApproval(m.user_id);
      }
    }
    for (const e of events) await audit(req, e.action, { targetType: 'organization', targetId: org._id, organizationId: org._id, details: e.details });
    if (body.action === 'approve') await notifyOrgAdmins(org._id, 'orgApproved', { name: org.name }, '/organization');
    if (body.action === 'suspend') await notifyOrgAdmins(org._id, 'orgSuspended', { name: org.name }, '/organization');
    if (body.action === 'reactivate') await notifyOrgAdmins(org._id, 'orgReactivated', { name: org.name }, '/organization');
    if (set.max_farmers !== undefined) await notifyOrgAdmins(org._id, 'orgLimitChanged', { name: org.name, limit: set.max_farmers }, '/organization');
    res.json({ data: orgOut(fresh), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* DELETE /api/admin/organizations/:id (super admin): ends every farmer link
   (farmers keep their accounts and data), removes staff and links. */
router.delete('/organizations/:id', superOnly, async (req, res) => {
  try {
    const org = await col('organizations').findOne({ _id: String(req.params.id) });
    if (!org) throw new OrgError(404, 'NOT_FOUND', 'Organization not found.');
    const now = nowIso();
    await col('farmer_organization').updateMany({ organization_id: org._id, status: { $in: ['active', 'pending_consent'] } }, { $set: { status: 'removed', ended_at: now, ended_by: req.user.id } });
    const members = await col('organization_members').find({ organization_id: org._id, status: 'active' }).toArray();
    await col('organization_members').updateMany({ organization_id: org._id, status: { $in: ['active', 'invited'] } }, { $set: { status: 'removed', removed_at: now } });
    for (const m of members) {
      await col('accounts').updateOne({ _id: m.user_id }, { $set: { kind: 'removed_member', status: 'pending', updated_at: now }, $unset: { organization_id: '' } });
      forgetApproval(m.user_id);
    }
    await col('referral_links').updateMany({ organization_id: org._id, revoked_at: null }, { $set: { revoked_at: now } });
    await col('organizations').deleteOne({ _id: org._id });
    await audit(req, 'organization.delete', { targetType: 'organization', targetId: org._id, organizationId: org._id, details: { name: org.name, farmers: org.active_farmers } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /api/admin/organizations/:id/import  { rows: [{ email }] }
   Attach existing farmers in bulk (CSV import). Each farmer takes a place in
   the limit straight away but nothing is shared until they accept in the
   app; declining frees the place. Returns one result per row. */
router.post('/organizations/:id/import', async (req, res) => {
  try {
    const org = await col('organizations').findOne({ _id: String(req.params.id) });
    if (!org) throw new OrgError(404, 'NOT_FOUND', 'Organization not found.');
    if (org.status !== 'active') throw new OrgError(409, 'ORG_NOT_ACTIVE', 'Only an active organization can receive farmers.');
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows.slice(0, 2000) : [];
    if (!rows.length) throw new OrgError(400, 'NO_ROWS', 'The file has no rows.');
    const results = [];
    for (const row of rows) {
      const email = text(row && row.email, 160).toLowerCase();
      const out = { email, result: '' };
      results.push(out);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.result = 'invalid_email'; continue; }
      const account = await col('accounts').findOne({ email });
      let userId = account && account._id;
      if (!userId) {
        try {
          const found = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
          userId = found.data && found.data[0] && found.data[0].id;
        } catch { /* not found */ }
      }
      if (!userId) { out.result = 'no_account'; continue; }
      if (await activeMembership(userId)) { out.result = 'organization_account'; continue; }
      const current = await farmerLink(userId);
      if (current) { out.result = current.org._id === org._id ? 'already_member' : 'other_organization'; continue; }
      const reserved = await col('organizations').updateOne(
        { _id: org._id, status: 'active', $expr: { $lt: ['$active_farmers', '$max_farmers'] } },
        { $inc: { active_farmers: 1 } }
      );
      if (!reserved.modifiedCount) { out.result = 'limit_reached'; continue; }
      const now = nowIso();
      try {
        await col('farmer_organization').insertOne({ _id: uuid(), farmer_id: userId, organization_id: org._id, referral_link_id: null, status: 'pending_consent', consent_given_at: null, consent_source: 'bulk_import', imported_by: req.user.id, detail_access: false, joined_at: now, ended_at: null });
      } catch {
        await col('organizations').updateOne({ _id: org._id }, { $inc: { active_farmers: -1 } });
        out.result = 'other_organization';
        continue;
      }
      await notify(userId, 'orgInvite', { name: org.name }, '/settings');
      refreshFarmerStats(userId).catch(() => {});
      out.result = 'pending_consent';
    }
    await audit(req, 'organization.import', { targetType: 'organization', targetId: org._id, organizationId: org._id, details: { rows: rows.length, added: results.filter((r) => r.result === 'pending_consent').length } });
    res.json({ data: results, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* GET /api/admin/audit?action=&organization_id=&q=&from=&to=&page= */
router.get('/audit', async (req, res) => {
  try {
    const filter = {};
    if (req.query.action) filter.action = { $regex: `^${String(req.query.action).replace(/[^\w.]/g, '')}` };
    if (req.query.organization_id) filter.organization_id = String(req.query.organization_id);
    if (req.query.from || req.query.to) {
      filter.at = {};
      if (req.query.from) filter.at.$gte = String(req.query.from);
      if (req.query.to) filter.at.$lte = `${String(req.query.to)}T23:59:59Z`;
    }
    if (req.query.q) {
      const re = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80), 'i');
      filter.$or = [{ actor_email: re }, { target_id: re }, { 'details.name': re }, { 'details.email': re }];
    }
    const page = Math.max(0, Number(req.query.page) || 0);
    const [list, total] = await Promise.all([
      col('audit_logs').find(filter).sort({ at: -1 }).skip(page * 100).limit(100).toArray(),
      col('audit_logs').countDocuments(filter)
    ]);
    const orgs = await col('organizations').find({ _id: { $in: [...new Set(list.map((l) => l.organization_id).filter(Boolean))] } }, { projection: { name: 1 } }).toArray();
    const names = new Map(orgs.map((o) => [o._id, o.name]));
    res.json({ data: { total, page, rows: list.map(({ _id, ...a }) => ({ id: _id, ...a, organization_name: names.get(a.organization_id) || (a.details && a.details.name) || '' })) }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* System settings: read by every admin, changed by super admins only. */
router.get('/settings', async (req, res) => {
  try { res.json({ data: await getSettings(), error: null }); } catch (err) { sendOrgError(res, err); }
});
router.patch('/settings', superOnly, async (req, res) => {
  try {
    const before = await getSettings();
    const after = await updateSettings(req.body || {}, req.user.id);
    await audit(req, 'settings.update', { targetType: 'settings', targetId: 'global', details: { before, after } });
    res.json({ data: after, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* GET /api/admin/platform: organizations and farmers across the platform. */
router.get('/platform', async (req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const [byStatus, linked, joins30, farmerAccounts] = await Promise.all([
      col('organizations').aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, farmers: { $sum: '$active_farmers' }, limit: { $sum: '$max_farmers' } } }]).toArray(),
      col('farmer_organization').countDocuments({ status: 'active' }),
      col('farmer_organization').countDocuments({ status: 'active', joined_at: { $gte: since30 } }),
      col('accounts').countDocuments({ status: 'approved', kind: { $ne: 'organization' } })
    ]);
    const s = Object.fromEntries(byStatus.map((x) => [x._id, x]));
    res.json({
      data: {
        organizations: { pending: (s.pending && s.pending.n) || 0, active: (s.active && s.active.n) || 0, suspended: (s.suspended && s.suspended.n) || 0 },
        farmers_in_organizations: linked,
        independent_farmers: Math.max(0, farmerAccounts - linked),
        joins_30d: joins30,
        capacity: byStatus.reduce((n, x) => n + (x.limit || 0), 0)
      },
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* GET /api/admin/conversion-candidates: Cooperative accounts that still have
   herd records, so the migration left them as farmers. */
router.get('/conversion-candidates', async (req, res) => {
  try {
    const coops = await col('accounts').find({ account_type: 'cooperative', kind: { $ne: 'organization' } }).toArray();
    const out = [];
    for (const a of coops) {
      out.push({ user_id: a._id, email: a.email || '', name: a.full_name || a.farm_name || '', has_records: await hasFarmData(a._id), farm_name: a.farm_name || '' });
    }
    res.json({ data: out, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /api/admin/conversion-candidates/:userId  { name }: turn an account
   into a pending organization with that user as its admin. Herd records the
   account already has are kept but no longer shown to it. */
router.post('/conversion-candidates/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    if (await activeMembership(userId)) throw new OrgError(409, 'ALREADY_MEMBER', 'This account already belongs to an organization.');
    if (await farmerLink(userId)) throw new OrgError(409, 'FARMER_LINKED', 'This account is linked to an organization as a farmer.');
    const account = await col('accounts').findOne({ _id: userId });
    if (!account) throw new OrgError(404, 'NOT_FOUND', 'Account not found.');
    const result = await convertAccountToOrganization(account, req.user.id, text(req.body && req.body.name, 120));
    await audit(req, 'organization.convert', { targetType: 'organization', targetId: result._id, organizationId: result._id, details: { user_id: userId, name: result.name, had_records: await hasFarmData(userId) } });
    res.status(201).json({ data: orgOut(result), error: null });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: { message: 'An organization with this name already exists.', code: 'NAME_TAKEN' } });
    sendOrgError(res, err);
  }
});

async function convertAccountToOrganization(account, byUserId, nameOverride) {
  const settings = await getSettings();
  let email = account.email || '';
  if (!email) {
    try { email = primaryEmail(await clerkClient.users.getUser(account._id)); } catch { /* keep blank */ }
  }
  const baseName = nameOverride || account.farm_name || account.full_name || email || 'Organization';
  const now = nowIso();
  const orgId = uuid();
  let name = baseName;
  for (let i = 2; await col('organizations').findOne({ name_key: name.toLowerCase().replace(/\s+/g, ' ') }); i++) name = `${baseName} ${i}`;
  await col('organizations').insertOne({
    _id: orgId, name, name_key: name.toLowerCase().replace(/\s+/g, ' '), type: 'cooperative', country: 'Rwanda', district: account.location || '', sector: '',
    contact_email: email, contact_phone: account.phone || '', status: 'pending', max_farmers: settings.default_max_farmers, active_farmers: 0,
    created_by: byUserId, approved_by: null, created_at: now, updated_at: now, approved_at: null, converted_from_account: true
  });
  await col('organization_members').insertOne({ _id: uuid(), organization_id: orgId, user_id: account._id, email, role: 'org_admin', status: 'active', created_at: now, joined_at: now });
  await col('accounts').updateOne({ _id: account._id }, { $set: { kind: 'organization', organization_id: orgId, previous_account_type: account.account_type, account_type: 'organization', status: 'pending', updated_at: now } });
  forgetApproval(account._id);
  return col('organizations').findOne({ _id: orgId });
}

router.convertAccountToOrganization = convertAccountToOrganization;
module.exports = router;
