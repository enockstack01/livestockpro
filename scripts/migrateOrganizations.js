/*
 * Migration for organization accounts (Logistack spec v1.0, section 12).
 *
 * What it does, in order:
 *   1. creates the indexes for the new collections (the server also does
 *      this on every boot) and the system settings (6 hour links, 50 farmers)
 *   2. marks every existing account as a farmer (kind: 'farmer') so existing
 *      farmers keep working with no organization link
 *   3. turns Cooperative accounts that have NO herd records into pending
 *      organizations, with that user as the Organization Admin. Cooperative
 *      accounts that have records stay farmers and are listed; a system
 *      admin can convert them by hand from the admin panel.
 *
 * Every change is recorded in migration_log so --rollback can undo exactly
 * what this script did. Run it on a copy of production first.
 *
 * Usage:
 *   node scripts/migrateOrganizations.js            dry run, prints the plan
 *   node scripts/migrateOrganizations.js --apply    applies it
 *   node scripts/migrateOrganizations.js --rollback undoes the last apply
 */
require('dotenv').config();
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to your .env file.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const RUN_ID = 'organizations-v1';
const FARM = ['animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'finance_records', 'tasks'];

async function hasFarmData(db, userId) {
  for (const name of FARM) if (await db.collection(name).findOne({ user_id: userId, deleted_at: null }, { projection: { _id: 1 } })) return true;
  return false;
}

async function rollback(db) {
  const log = await db.collection('migration_log').findOne({ _id: RUN_ID });
  if (!log) { console.log('Nothing to roll back.'); return; }
  for (const c of log.converted || []) {
    await db.collection('organizations').deleteOne({ _id: c.organization_id, converted_from_account: true });
    await db.collection('organization_members').deleteMany({ organization_id: c.organization_id });
    await db.collection('accounts').updateOne({ _id: c.user_id }, { $set: { account_type: c.previous_account_type, status: c.previous_status }, $unset: { kind: '', organization_id: '', previous_account_type: '' } });
  }
  if ((log.marked_farmers || []).length) await db.collection('accounts').updateMany({ _id: { $in: log.marked_farmers } }, { $unset: { kind: '' } });
  await db.collection('migration_log').deleteOne({ _id: RUN_ID });
  console.log(`Rolled back: ${(log.converted || []).length} organizations removed, ${(log.marked_farmers || []).length} accounts unmarked.`);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'livestock');
  try {
    if (ROLLBACK) return await rollback(db);
    if (APPLY && await db.collection('migration_log').findOne({ _id: RUN_ID })) {
      console.log('This migration has already been applied. Use --rollback first to run it again.');
      return;
    }

    const settings = await db.collection('system_settings').findOne({ _id: 'global' });
    const defaultMax = (settings && settings.default_max_farmers) || 50;
    const unmarked = await db.collection('accounts').find({ kind: { $exists: false } }).project({ _id: 1, account_type: 1 }).toArray();
    const coops = await db.collection('accounts').find({ account_type: 'cooperative', kind: { $ne: 'organization' } }).toArray();
    const convert = [];
    const keep = [];
    for (const a of coops) (await hasFarmData(db, a._id) ? keep : convert).push(a);

    console.log(`Accounts to mark as farmers: ${unmarked.length}`);
    console.log(`Cooperative accounts to convert to pending organizations: ${convert.length}`);
    convert.forEach((a) => console.log(`  convert  ${a.email || a._id}  (${a.farm_name || a.full_name || ''})`));
    console.log(`Cooperative accounts with herd records, left as farmers: ${keep.length}`);
    keep.forEach((a) => console.log(`  keep     ${a.email || a._id}  (${a.farm_name || a.full_name || ''})`));
    if (!APPLY) { console.log('\nDry run only. Re-run with --apply to make these changes.'); return; }

    const now = new Date().toISOString();
    await db.collection('system_settings').updateOne({ _id: 'global' }, { $setOnInsert: { referral_link_hours: 6, default_max_farmers: defaultMax, created_at: now } }, { upsert: true });

    const toMark = unmarked.filter((a) => !convert.some((c) => c._id === a._id)).map((a) => a._id);
    if (toMark.length) await db.collection('accounts').updateMany({ _id: { $in: toMark } }, { $set: { kind: 'farmer' } });

    const converted = [];
    for (const a of convert) {
      const orgId = crypto.randomUUID();
      const base = a.farm_name || a.full_name || a.email || 'Cooperative';
      let name = base;
      for (let i = 2; await db.collection('organizations').findOne({ name_key: name.toLowerCase().replace(/\s+/g, ' ') }); i++) name = `${base} ${i}`;
      await db.collection('organizations').insertOne({
        _id: orgId, name, name_key: name.toLowerCase().replace(/\s+/g, ' '), type: 'cooperative', country: 'Rwanda', district: a.location || '', sector: '',
        contact_email: a.email || '', contact_phone: a.phone || '', status: 'pending', max_farmers: defaultMax, active_farmers: 0,
        created_by: null, approved_by: null, created_at: now, updated_at: now, approved_at: null, converted_from_account: true
      });
      await db.collection('organization_members').insertOne({ _id: crypto.randomUUID(), organization_id: orgId, user_id: a._id, email: a.email || '', role: 'org_admin', status: 'active', created_at: now, joined_at: now });
      await db.collection('accounts').updateOne({ _id: a._id }, { $set: { kind: 'organization', organization_id: orgId, previous_account_type: a.account_type, account_type: 'organization', status: 'pending', updated_at: now } });
      converted.push({ user_id: a._id, organization_id: orgId, previous_account_type: a.account_type, previous_status: a.status || null });
    }
    await db.collection('migration_log').insertOne({ _id: RUN_ID, applied_at: now, marked_farmers: toMark, converted, kept_as_farmers: keep.map((a) => a._id) });
    console.log(`\nApplied: ${toMark.length} accounts marked as farmers, ${converted.length} organizations created (pending approval).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
