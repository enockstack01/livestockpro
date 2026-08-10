const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Add it to your .env file.');
}

const client = new MongoClient(uri);
let db = null;

async function connect() {
  if (db) return db;
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'livestock');
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected yet.');
  return db;
}

module.exports = { connect, getDb };
