import { SCHEMAS, SYNCED_TABLES } from '../lib/shared';

export const DB_NAME = 'livestockpro.db';
const DATABASE_VERSION = 1;

/* Fields known to hold numbers, so their SQLite column gets NUMERIC affinity
   (matters for correct ORDER BY / range comparisons — SQLite is otherwise
   dynamically typed and wouldn't enforce this on its own). Everything else,
   including dates (kept as the same ISO strings the server/web app use), is TEXT. */
const NUMERIC_FIELDS = new Set(['latitude', 'longitude', 'amount', 'quantity', 'cost', 'newborn_count']);

function columnDef(field) {
  return `${field} ${NUMERIC_FIELDS.has(field) ? 'NUMERIC' : 'TEXT'}`;
}

function createTableSql(table) {
  const fields = SCHEMAS[table];
  const columns = [
    'id TEXT PRIMARY KEY',
    'user_id TEXT NOT NULL',
    ...fields.map(columnDef),
    'created_at TEXT',
    'updated_at TEXT',
    'deleted_at TEXT',
    "sync_state TEXT NOT NULL DEFAULT 'synced'",
  ];
  return `CREATE TABLE IF NOT EXISTS ${table} (${columns.join(', ')});`;
}

/* Passed as SQLiteProvider's onInit — runs once per app start, cheap no-op
   once the schema is at DATABASE_VERSION. */
export async function migrateDbIfNeeded(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  let version = (row && row.user_version) || 0;
  if (version >= DATABASE_VERSION) return;

  await db.execAsync('PRAGMA journal_mode = WAL;');

  for (const table of SYNCED_TABLES) {
    await db.execAsync(createTableSql(table));
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_${table}_user_updated ON ${table} (user_id, updated_at);`);
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      base_updated_at TEXT,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      table_name TEXT PRIMARY KEY,
      last_synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS scheduled_notifications (
      record_key TEXT PRIMARY KEY,
      expo_notification_id TEXT,
      trigger_at TEXT
    );
  `);

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
}

/* Lets a sign-out flow check whether anything is still waiting to reach the
   server before it wipes local data — without this, an offline edit made
   just before signing out is silently destroyed with no way to recover it. */
export async function getPendingSyncCount(db) {
  const row = await db.getFirstAsync('SELECT COUNT(*) as c FROM sync_queue');
  return row ? row.c : 0;
}

/* Sign-out safety: wipes every row (not the tables themselves) so a second
   account signing in on the same device never sees the previous account's
   cached data. Leaves schema/version intact, so no re-migration is needed. */
export async function wipeLocalData(db) {
  for (const table of SYNCED_TABLES) {
    await db.runAsync(`DELETE FROM ${table};`);
  }
  await db.execAsync('DELETE FROM sync_queue; DELETE FROM sync_meta; DELETE FROM scheduled_notifications;');
}
