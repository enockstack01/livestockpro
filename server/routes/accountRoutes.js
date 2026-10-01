const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth, getRole, primaryEmail, clerkClient } = require('../authMiddleware');
const { ACCOUNT_TYPES, CURRENCY_RE, DEFAULT_CURRENCY, accounts, getAccount, forgetApproval } = require('../lib/accounts');

const router = express.Router();
router.use(requireAuth);

const REQUEST_FIELDS = ['full_name', 'farm_name', 'location', 'phone', 'herd_size', 'livestock_types', 'notes'];

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/* What the clients need to decide which screen to show. Admins are always
   let in, whatever their own request says. */
function toClient(account, role) {
  const status = role !== 'user' ? 'approved' : ((account && account.status) || 'none');
  const request = {};
  if (account) REQUEST_FIELDS.forEach((k) => { request[k] = account[k] || ''; });
  return {
    status,
    role,
    accountType: (account && account.account_type) || (role === 'user' ? 'farmer' : null),
    currency: (account && account.currency) || DEFAULT_CURRENCY,
    reviewNote: (account && account.review_note) || '',
    submittedAt: (account && account.submitted_at) || null,
    reviewedAt: (account && account.reviewed_at) || null,
    request
  };
}

/* GET /api/account — the caller's own account status. */
router.get('/', async (req, res) => {
  try {
    const [account, role] = await Promise.all([getAccount(req.user.id), getRole(req.user.id)]);
    res.json({ data: toClient(account, role), error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* POST /api/account/request — submit (or, after a rejection, resubmit) the
   account request form. Also seeds the farm profile from it so the user
   doesn't have to type the same details again in Settings. */
router.post('/request', async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const accountType = ACCOUNT_TYPES.includes(body.account_type) ? body.account_type : null;
    if (!accountType) return res.status(400).json({ error: { message: 'Please choose an account type.' } });
    const fields = {};
    REQUEST_FIELDS.forEach((k) => { fields[k] = clean(body[k], k === 'notes' ? 1000 : 200); });
    if (!fields.full_name || !fields.location || !fields.phone) {
      return res.status(400).json({ error: { message: 'Name, location and phone number are required.' } });
    }

    const existing = await getAccount(userId);
    if (existing && (existing.status === 'approved' || existing.status === 'on_hold')) {
      return res.status(409).json({ error: { message: 'Your account has already been reviewed.' } });
    }

    const user = await clerkClient.users.getUser(userId);
    const now = new Date().toISOString();
    await accounts().updateOne(
      { _id: userId },
      {
        $set: { ...fields, account_type: accountType, email: primaryEmail(user), status: 'pending', submitted_at: now, updated_at: now, review_note: '' },
        $setOnInsert: { user_id: userId, currency: DEFAULT_CURRENCY, created_at: now }
      },
      { upsert: true }
    );

    const profiles = getDb().collection('profiles');
    if (!(await profiles.findOne({ user_id: userId, deleted_at: null }))) {
      await profiles.insertOne({
        _id: crypto.randomUUID(), user_id: userId, farm_name: fields.farm_name, location: fields.location,
        phone: fields.phone, created_at: now, updated_at: now
      });
    }

    const [account, role] = await Promise.all([accounts().findOne({ _id: userId }), getRole(userId)]);
    res.json({ data: toClient(account, role), error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* PATCH /api/account/preferences { currency } — the currency every money
   figure is shown in, on both the web and mobile app. */
router.patch('/preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const currency = String((req.body && req.body.currency) || '').toUpperCase();
    if (!CURRENCY_RE.test(currency)) return res.status(400).json({ error: { message: 'Invalid currency.' } });
    await getAccount(userId); // grandfathers a legacy user in before the upsert below creates their doc
    const now = new Date().toISOString();
    await accounts().updateOne(
      { _id: userId },
      { $set: { currency, updated_at: now }, $setOnInsert: { user_id: userId, created_at: now } },
      { upsert: true }
    );
    forgetApproval(userId);
    const [account, role] = await Promise.all([getAccount(userId), getRole(userId)]);
    res.json({ data: toClient(account, role), error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

module.exports = router;
