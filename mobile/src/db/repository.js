import * as Crypto from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { SCHEMAS } from '../lib/shared';

/* Local-first read/write layer every screen uses instead of calling the API
   directly. Every write lands in SQLite immediately (optimistic UI, no
   network wait) and appends a row to sync_queue for src/sync/syncEngine.js
   to flush later. */

function nowIso() {
  return new Date().toISOString();
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

async function queueMutation(db, table, recordId, op, payload, baseUpdatedAt) {
  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, op, payload, base_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    table, recordId, op, JSON.stringify(payload), baseUpdatedAt || null, nowIso()
  );
}

async function listRecords(db, table, { where = {}, order = 'created_at DESC' } = {}) {
  let sql = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = [];
  for (const [k, v] of Object.entries(where)) {
    sql += ` AND ${k} = ?`;
    params.push(v);
  }
  sql += ` ORDER BY ${order}`;
  return db.getAllAsync(sql, ...params);
}

async function getRecordById(db, table, id) {
  return db.getFirstAsync(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id);
}

async function insertRecord(db, table, userId, fields) {
  const id = Crypto.randomUUID();
  const now = nowIso();
  const schemaFields = SCHEMAS[table];
  const columns = ['id', 'user_id', ...schemaFields, 'created_at', 'updated_at', 'sync_state'];
  const values = [id, userId, ...schemaFields.map((f) => (fields[f] !== undefined ? fields[f] : null)), now, now, 'pending'];
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, ...values);
  await queueMutation(db, table, id, 'insert', { id, ...pick(fields, schemaFields) });
  return getRecordById(db, table, id);
}

async function updateRecord(db, table, id, patch) {
  const schemaFields = SCHEMAS[table];
  const keys = Object.keys(patch).filter((k) => schemaFields.includes(k));
  if (keys.length === 0) return getRecordById(db, table, id);

  const before = await getRecordById(db, table, id);
  const now = nowIso();
  const setSql = keys.map((k) => `${k} = ?`).join(', ') + ", updated_at = ?, sync_state = 'pending'";
  await db.runAsync(`UPDATE ${table} SET ${setSql} WHERE id = ?`, ...keys.map((k) => patch[k]), now, id);
  await queueMutation(db, table, id, 'update', pick(patch, schemaFields), before ? before.updated_at : null);
  return getRecordById(db, table, id);
}

async function removeRecord(db, table, id) {
  const before = await getRecordById(db, table, id);
  const now = nowIso();
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`, now, now, id);
  await queueMutation(db, table, id, 'delete', {}, before ? before.updated_at : null);
}

export function useRepository() {
  const db = useSQLiteContext();
  const { userId } = useAuth();

  return useMemo(() => ({
    list: (table, opts) => listRecords(db, table, opts),
    getById: (table, id) => getRecordById(db, table, id),
    insert: (table, fields) => insertRecord(db, table, userId, fields),
    update: (table, id, patch) => updateRecord(db, table, id, patch),
    remove: (table, id) => removeRecord(db, table, id),
  }), [db, userId]);
}

export { listRecords, getRecordById, insertRecord, updateRecord, removeRecord };
