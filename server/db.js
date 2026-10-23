const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Add it to your .env file.');
}

const client = new MongoClient(uri);
let db = null;

/* {user_id,updated_at} on every collection the mobile app's delta sync
   queries (dataRoutes.js's updated_since filter) plus {user_id,device_id} on
   push_tokens (registerPushToken.js's de-dupe-by-device lookup). Additive
   and idempotent — safe to run on every boot, Mongo no-ops if already there. */
const DATA_COLLECTIONS = [
  'profiles', 'animals', 'health_records', 'feeding_records',
  'breeding_records', 'production_records', 'finance_records', 'tasks'
];

async function ensureIndexes(database) {
  await Promise.all([
    ...DATA_COLLECTIONS.map((name) => database.collection(name).createIndex({ user_id: 1, updated_at: 1 })),
    database.collection('push_tokens').createIndex({ user_id: 1, device_id: 1 }),
    database.collection('accounts').createIndex({ status: 1 }),
    database.collection('ai_reports').createIndex({ user_id: 1, kind: 1, created_at: -1 }),
    database.collection('ai_usage').createIndex({ user_id: 1, day: -1 }),
    database.collection('ai_usage').createIndex({ day: 1 }),
    // Livestock IDs (server/lib/livestockId.js): one per user
    database.collection('livestock_ids').createIndex({ user_id: 1 }, { unique: true }),
    // AI monitor events: queried by time, removed after 90 days
    database.collection('ai_events').createIndex({ at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }),
    database.collection('ai_events').createIndex({ user_id: 1, at: -1 }),
    /* Organizations and referral links (lib/orgs.js). One active organization
       per farmer is enforced by the partial unique index. */
    database.collection('organizations').createIndex({ name_key: 1 }, { unique: true }),
    database.collection('organizations').createIndex({ status: 1, created_at: -1 }),
    database.collection('organization_members').createIndex({ organization_id: 1, status: 1 }),
    database.collection('organization_members').createIndex({ user_id: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }),
    database.collection('organization_members').createIndex({ email: 1, status: 1 }),
    database.collection('referral_links').createIndex({ token_hash: 1 }, { unique: true }),
    database.collection('referral_links').createIndex({ organization_id: 1, created_at: -1 }),
    database.collection('farmer_organization').createIndex({ farmer_id: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['active', 'pending_consent'] } } }),
    database.collection('farmer_organization').createIndex({ organization_id: 1, status: 1 }),
    database.collection('audit_logs').createIndex({ at: -1 }),
    database.collection('audit_logs').createIndex({ organization_id: 1, at: -1 }),
    database.collection('notifications').createIndex({ user_id: 1, created_at: -1 }),
    database.collection('farmer_stats').createIndex({ farmer_id: 1 }, { unique: true })
  ]);
}

async function connect() {
  if (db) return db;
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'livestock');
  await ensureIndexes(db);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected yet.');
  return db;
}

/* The Mongo client, for multi-document transactions (lib/orgs.js joinOrganization). */
function getClient() {
  return client;
}

module.exports = { connect, getDb, getClient };
