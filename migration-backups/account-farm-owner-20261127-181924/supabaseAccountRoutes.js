const express = require('express');
const { requireAuth } = require('../supabaseAuthMiddleware');
const { ensureSupabaseLivestockId } = require('../lib/supabaseLivestockId');

const {
  DEFAULT_CURRENCY,
  getAccount,
  getProfile,
  getLivestockPublicId,
  toClient,
  parseLivestockTypes,
  parseHerdSize,
  clean
} = require('../lib/supabaseAccounts');

const router = express.Router();

router.use(requireAuth);

// GET /api/supabase/account
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    const [account, profile, livestockId] = await Promise.all([
      getAccount(supabase, userId),
      getProfile(supabase, userId),
      ensureSupabaseLivestockId(userId)
    ]);

    return res.json({
      data: toClient(account, profile, req.user.role, livestockId),
      error: null
    });
  } catch (error) {
    console.error('Supabase account fetch failed:', error.message);

    return res.status(500).json({
      data: null,
      error: { message: 'Unable to load your account.' }
    });
  }
});


// POST /api/supabase/account/request
router.post('/request', async (req, res) => {
  try {
    const body = req.body || {};

    const fullName = clean(body.full_name, 200);
    const accountType = clean(body.account_type, 50);
    const phone = clean(body.phone, 80);
    const location = clean(body.location, 200);
    const farmName = clean(body.farm_name, 200);
    const notes = clean(body.notes, 2000);

    if (!fullName || !accountType || !phone || !location) {
      return res.status(400).json({
        data: null,
        error: {
          message: 'Full name, account type, phone and location are required.'
        }
      });
    }

    let herdSize;
    let livestockTypes;

    try {
      herdSize = parseHerdSize(body.herd_size);
      livestockTypes = parseLivestockTypes(body.livestock_types);
    } catch (error) {
      return res.status(400).json({
        data: null,
        error: { message: error.message }
      });
    }

    const { data: result, error } = await req.supabase.rpc(
      'submit_account_request',
      {
        p_full_name: fullName,
        p_account_type: accountType,
        p_phone: phone,
        p_location: location,
        p_farm_name: farmName,
        p_herd_size: herdSize,
        p_livestock_types: livestockTypes,
        p_notes: notes
      }
    );

    if (error) {
      console.error('Supabase account request rejected:', error.message);

      const message = error.message || '';

      if (
        message.includes('Invalid account type') ||
        message.includes('required') ||
        message.includes('cannot submit') ||
        message.includes('Herd size') ||
        message.includes('Livestock types')
      ) {
        return res.status(400).json({
          data: null,
          error: { message }
        });
      }

      return res.status(500).json({
        data: null,
        error: { message: 'Unable to submit your account request.' }
      });
    }

    const account = result?.account || null;
    const profile = result?.profile || null;

    return res.status(200).json({
      data: toClient(account, profile, req.user.role),
      error: null
    });
  } catch (error) {
    console.error('Supabase account request failed:', error.message);

    return res.status(500).json({
      data: null,
      error: { message: 'Unable to submit your account request.' }
    });
  }
});


// PATCH /api/supabase/account/preferences
router.patch('/preferences', async (req, res) => {
  try {
    const currency = clean(req.body?.currency, 3);

    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({
        data: null,
        error: {
          message: 'Currency must be a three-letter uppercase code.'
        }
      });
    }

    const { data: account, error } = await req.supabase.rpc(
      'set_account_currency',
      { p_currency: currency }
    );

    if (error) {
      console.error('Supabase currency update failed:', error.message);

      return res.status(500).json({
        data: null,
        error: { message: 'Unable to update account preferences.' }
      });
    }

    const profile = await getProfile(req.supabase, req.user.id);

    return res.json({
      data: toClient(account, profile, req.user.role),
      error: null
    });
  } catch (error) {
    console.error('Supabase preferences update failed:', error.message);

    return res.status(500).json({
      data: null,
      error: { message: 'Unable to update account preferences.' }
    });
  }
});

module.exports = router;


