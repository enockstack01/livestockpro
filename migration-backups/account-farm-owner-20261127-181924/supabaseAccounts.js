const DEFAULT_CURRENCY = 'USD';

const REQUEST_FIELDS = [
  'full_name',
  'farm_name',
  'location',
  'phone',
  'herd_size',
  'livestock_types',
  'notes'
];

async function getAccount(supabase, userId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLivestockPublicId(supabase, userId) {
  const { data, error } = await supabase
    .from('livestock_ids')
    .select('public_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.public_id || null;
}

function toClient(account, profile, role, livestockId = null) {
  const status =
    role !== 'user'
      ? 'approved'
      : account?.status || 'none';

  const livestockTypes = Array.isArray(account?.livestock_types)
    ? account.livestock_types.join(', ')
    : '';

  const request = {
    full_name: account?.full_name || '',
    farm_name: profile?.farm_name || '',
    location: account?.location || profile?.location || '',
    phone: account?.phone || profile?.phone || '',
    herd_size:
      account?.herd_size === null || account?.herd_size === undefined
        ? ''
        : String(account.herd_size),
    livestock_types: livestockTypes,
    notes: account?.notes || ''
  };

  return {
    status,
    role,
    accountType: account?.account_type || 'farmer',
    currency: account?.currency || DEFAULT_CURRENCY,
    reviewNote: account?.review_note || '',
    submittedAt: account?.submitted_at || null,
    reviewedAt: account?.reviewed_at || null,
    kind: account?.account_type || 'farmer',

    // Team and organization summaries will be connected
    // when those modules are migrated to Supabase.
    farmRole: 'manager',
    farm: null,
    livestockId,
    organization: null,
    request
  };
}

function parseLivestockTypes(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string' || !value.trim()) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHerdSize(value) {
  if (value === '' || value === null || value === undefined) return null;

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error('Herd size must be a non-negative whole number.');
  }

  return number;
}

function clean(value, maxLength = 2000) {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : '';
}

async function isApproved(supabase, userId, role = 'user') {
  if (role !== 'user') return true;

  const account = await getAccount(supabase, userId);
  return account?.status === 'approved';
}

function requireApproved(req, res, next) {
  isApproved(req.supabase, req.user.id, req.user.role)
    .then((approved) => {
      if (!approved) {
        return res.status(403).json({
          error: {
            message: 'Your account must be approved to use this feature.',
            code: 'ACCOUNT_NOT_APPROVED'
          }
        });
      }

      next();
    })
    .catch((error) => {
      console.error('Supabase account approval check failed:', error.message);
      res.status(500).json({
        error: { message: 'Unable to verify account approval.' }
      });
    });
}

module.exports = {
  DEFAULT_CURRENCY,
  REQUEST_FIELDS,
  getAccount,
  getProfile,
  getLivestockPublicId,
  toClient,
  parseLivestockTypes,
  parseHerdSize,
  clean,
  isApproved,
  requireApproved
};
