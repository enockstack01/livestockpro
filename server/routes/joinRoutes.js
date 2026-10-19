const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAuth } = require('@clerk/express');
const { requireAuth } = require('../authMiddleware');
const { forgetApproval } = require('../lib/accounts');
const {
  OrgError, sendOrgError, audit, notifyOrgAdmins, findLink, linkState, joinError, joinOrganization,
  farmerLink, endFarmerLink, isOrgAccount, refreshFarmerStats, col, nowIso
} = require('../lib/orgs');

/* Rate limits against token guessing: per IP and per device (the apps send
   a random X-Device-Id they keep), on top of the general API limit. */
const deviceKey = (req) => `${req.ip}|${String(req.get('x-device-id') || '').slice(0, 64)}`;
const limitBody = { error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' } };
const perIp = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json(limitBody) });
const perDevice = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyGenerator: deviceKey, standardHeaders: true, legacyHeaders: false, validate: { keyGeneratorIpFallback: false }, handler: (req, res) => res.status(429).json(limitBody) });

const text = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ---------- /api/join/:token ---------- */
const join = express.Router();
join.use(perIp, perDevice);

/* GET: validate a link (public) and show the organization. Checked again on
   submit, always on server time. */
join.get('/:token', async (req, res) => {
  try {
    const { link, org } = await findLink(req.params.token);
    const state = linkState(link, org);
    if (state !== 'active') {
      const e = joinError(state);
      return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    }
    const auth = getAuth(req);
    let me = null;
    if (auth && auth.userId) {
      if (await isOrgAccount(auth.userId)) me = { state: 'org_account' };
      else {
        const current = await farmerLink(auth.userId);
        me = current ? { state: current.org._id === org._id ? 'already_member' : 'other_org', organization: current.org.name } : { state: 'can_join' };
      }
    }
    res.json({
      data: {
        organization: { id: org._id, name: org.name, type: org.type, district: org.district || '', sector: org.sector || '', logo: org.logo || null, description: org.description || '' },
        expires_at: link.expires_at,
        server_time: nowIso(),
        me
      },
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST: join (signed in). Body: { consent, detail_access, profile: { full_name, phone, district, sector, cell } } */
join.post('/:token', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const p = body.profile || {};
    const profile = {};
    if (text(p.full_name)) profile.full_name = text(p.full_name);
    if (text(p.phone, 40)) profile.phone = text(p.phone, 40);
    const { org } = await joinOrganization({ userId: req.user.id, token: req.params.token, consent: body.consent === true, detailAccess: body.detail_access === true, profile });
    forgetApproval(req.user.id);

    /* Location on the farm profile, for the organization's filters. */
    const loc = {};
    for (const k of ['district', 'sector', 'cell']) if (text(p[k], 80)) loc[k] = text(p[k], 80);
    if (Object.keys(loc).length || profile.phone) {
      const now = nowIso();
      await col('profiles').updateOne(
        { user_id: req.user.id, deleted_at: null },
        { $set: { ...loc, ...(profile.phone ? { phone: profile.phone } : {}), updated_at: now }, $setOnInsert: { _id: require('crypto').randomUUID(), user_id: req.user.id, farm_name: profile.full_name || '', created_at: now } },
        { upsert: true }
      );
      refreshFarmerStats(req.user.id).catch(() => {});
    }
    const name = profile.full_name || 'A farmer';
    await notifyOrgAdmins(org._id, 'farmerJoined', { name: org.name, farmer: name }, '/organization/farmers');
    await audit(req, 'farmer.join', { targetType: 'farmer', targetId: req.user.id, organizationId: org._id, details: { via: 'referral_link', detail_access: body.detail_access === true } });
    res.status(201).json({ data: { organization: { id: org._id, name: org.name, logo: org.logo || null } }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- /api/me/organization (the farmer's side) ---------- */
const me = express.Router();
me.use(requireAuth);

me.get('/', async (req, res) => {
  try {
    const current = await farmerLink(req.user.id);
    if (!current) return res.json({ data: null, error: null });
    const { link, org } = current;
    res.json({
      data: {
        organization: { id: org._id, name: org.name, type: org.type, logo: org.logo || null, district: org.district || '', contact_email: org.contact_email || '', contact_phone: org.contact_phone || '' },
        status: link.status,
        joined_at: link.joined_at,
        consent_given_at: link.consent_given_at,
        detail_access: Boolean(link.detail_access),
        source: link.consent_source || 'referral_link'
      },
      error: null
    });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* PATCH { detail_access }: give or withdraw read only access to full records. */
me.patch('/', async (req, res) => {
  try {
    const on = req.body && req.body.detail_access === true;
    const current = await farmerLink(req.user.id);
    if (!current || current.link.status !== 'active') throw new OrgError(404, 'NO_ORGANIZATION', 'You are not linked to an organization.');
    await col('farmer_organization').updateOne({ _id: current.link._id }, { $set: { detail_access: on, detail_access_at: nowIso() } });
    await audit(req, on ? 'farmer.detail_access_on' : 'farmer.detail_access_off', { targetType: 'farmer', targetId: req.user.id, organizationId: current.org._id });
    res.json({ data: { detail_access: on }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /consent { accept }: answer a bulk import by a system admin. Until the
   farmer accepts, nothing of theirs is shared. */
me.post('/consent', async (req, res) => {
  try {
    const current = await farmerLink(req.user.id);
    if (!current || current.link.status !== 'pending_consent') throw new OrgError(404, 'NO_REQUEST', 'There is no organization request waiting for you.');
    const now = nowIso();
    if (req.body && req.body.accept === true) {
      await col('farmer_organization').updateOne({ _id: current.link._id }, { $set: { status: 'active', consent_given_at: now, joined_at: now, detail_access: req.body.detail_access === true } });
      refreshFarmerStats(req.user.id).catch(() => {});
      await notifyOrgAdmins(current.org._id, 'farmerJoined', { name: current.org.name, farmer: 'A farmer' }, '/organization/farmers');
      await audit(req, 'farmer.consent_accept', { targetType: 'farmer', targetId: req.user.id, organizationId: current.org._id });
    } else {
      await endFarmerLink(req.user.id, current.org._id, 'declined', req.user.id);
      await audit(req, 'farmer.consent_decline', { targetType: 'farmer', targetId: req.user.id, organizationId: current.org._id });
    }
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* POST /leave: the farmer leaves their organization. Their data stops
   appearing on the organization dashboard at once. */
me.post('/leave', async (req, res) => {
  try {
    const current = await farmerLink(req.user.id);
    if (!current) throw new OrgError(404, 'NO_ORGANIZATION', 'You are not linked to an organization.');
    await endFarmerLink(req.user.id, current.org._id, 'left', req.user.id);
    const account = await col('accounts').findOne({ _id: req.user.id }, { projection: { full_name: 1 } });
    await notifyOrgAdmins(current.org._id, 'farmerLeft', { name: current.org.name, farmer: (account && account.full_name) || 'A farmer' }, '/organization/farmers');
    await audit(req, 'farmer.leave', { targetType: 'farmer', targetId: req.user.id, organizationId: current.org._id, details: { reason: text(req.body && req.body.reason, 300) } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

/* ---------- /api/notifications ---------- */
const notes = express.Router();
notes.use(requireAuth);

notes.get('/', async (req, res) => {
  try {
    const list = await col('notifications').find({ user_id: req.user.id }).sort({ created_at: -1 }).limit(50).toArray();
    res.json({ data: list.map(({ _id, user_id: _u, ...n }) => ({ id: _id, ...n })), error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

notes.post('/read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String).slice(0, 200) : null;
    const filter = { user_id: req.user.id, read_at: null };
    if (ids) filter._id = { $in: ids };
    await col('notifications').updateMany(filter, { $set: { read_at: nowIso() } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    sendOrgError(res, err);
  }
});

module.exports = { join, me, notes };
