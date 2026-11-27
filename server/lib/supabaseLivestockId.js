const crypto = require('crypto');
const { createServiceClient } = require('../supabase');

const PREFIX = 'Livestock';
const SPAN = 9000000000n;
const FLOOR = 1000000000n;
const ID_RE = /^Livestock[1-9]\d{9}$/;

function candidate(userId, attempt = 0) {
  const secret = process.env.LIVESTOCK_ID_SECRET;

  if (!secret) {
    throw new Error('LIVESTOCK_ID_SECRET is not configured.');
  }

  const input = attempt ? `${userId}:${attempt}` : String(userId);

  const hash = crypto
    .createHmac('sha256', secret)
    .update(input)
    .digest();

  const number = hash.readBigUInt64BE(0) % SPAN + FLOOR;

  return number.toString();
}

async function ensureSupabaseLivestockId(userId) {
  if (!userId) {
    throw new Error('A user ID is required to create a Livestock ID.');
  }

  const supabase = createServiceClient();

  // Return the existing ID if this user already has one.
  const { data: existing, error: lookupError } = await supabase
    .from('livestock_ids')
    .select('public_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing?.public_id) {
    return `${PREFIX}${existing.public_id}`;
  }

  // A unique constraint protects against collisions and concurrent requests.
  for (let attempt = 0; attempt < 50; attempt++) {
    const publicId = candidate(userId, attempt);

    const { error: insertError } = await supabase
      .from('livestock_ids')
      .insert({
        user_id: userId,
        public_id: publicId
      });

    if (!insertError) {
      return `${PREFIX}${publicId}`;
    }

    if (insertError.code !== '23505') {
      throw insertError;
    }

    // A concurrent request for this same user may have won the insert.
    const { data: mine, error: retryLookupError } = await supabase
      .from('livestock_ids')
      .select('public_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (retryLookupError) throw retryLookupError;

    if (mine?.public_id) {
      return `${PREFIX}${mine.public_id}`;
    }

    // Otherwise another user owns this candidate; try the next HMAC input.
  }

  throw new Error('Could not create a unique Livestock ID after 50 attempts.');
}

module.exports = {
  PREFIX,
  ID_RE,
  candidate,
  ensureSupabaseLivestockId
};
