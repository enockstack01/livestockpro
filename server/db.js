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
    database.collection('push_tokens').createIndex({ user_id: 1, device_id: 1 })
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

module.exports = { connect, getDb };
