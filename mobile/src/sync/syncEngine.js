import { SCHEMAS, SYNCED_TABLES } from '../lib/shared';

/* The core offline-sync logic: push first (drain locally-queued mutations),
   then pull (fetch everything changed server-side since the last sync).
   Push-before-pull so a device never overwrites its own unsynced edits with
   a stale pull. Both phases stop early (not error) on a genuine network
   failure, leaving unfinished work for the next trigger; a per-row 4xx
   failure is recorded and skipped so one bad record can't block the rest. */
export async function runSync(db, api) {
  const push = await pushChanges(db, api);
  const pull = await pullChanges(db, api);
  return { push, pull };
}

async function applyServerDoc(db, table, doc, syncState) {
  const schemaFields = SCHEMAS[table];
  const columns = ['id', 'user_id', ...schemaFields, 'created_at', 'updated_at', 'deleted_at', 'sync_state'];
  const values = [
    doc.id,
    doc.user_id,
    ...schemaFields.map((f) => (doc[f] !== undefined ? doc[f] : null)),
    doc.created_at || null,
    doc.updated_at || null,
    doc.deleted_at || null,
    syncState,
  ];
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, ...values);
}

async function pushChanges(db, api) {
  const rows = await db.getAllAsync('SELECT * FROM sync_queue ORDER BY queue_id ASC');
  let flushed = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = JSON.parse(row.payload);
    let result;
    if (row.op === 'insert') {
      result = await api.insert(row.table_name, [payload]);
    } else if (row.op === 'update') {
      result = await api.update(row.table_name, row.record_id, payload);
    } else {
      result = await api.remove(row.table_name, row.record_id);
    }

    if (result.error && result.error.networkError) {
      break; // offline mid-push — stop here, everything left in the queue retries next trigger
    }

    if (result.error) {
      failed += 1;
      await db.runAsync(
        'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE queue_id = ?',
        result.error.message, row.queue_id
      );
      continue; // don't let one bad record block the rest of the queue
    }

    await db.runAsync('DELETE FROM sync_queue WHERE queue_id = ?', row.queue_id);
    if (row.op === 'delete') {
      await db.runAsync(`DELETE FROM ${row.table_name} WHERE id = ?`, row.record_id);
    } else {
      const serverDoc = Array.isArray(result.data) ? result.data[0] : result.data;
      if (serverDoc) await applyServerDoc(db, row.table_name, serverDoc, 'synced');
    }
    flushed += 1;
  }

  return { flushed, failed };
}

async function pullChanges(db, api) {
  let pulled = 0;

  for (const table of SYNCED_TABLES) {
    const metaRow = await db.getFirstAsync('SELECT last_synced_at FROM sync_meta WHERE table_name = ?', table);
    const since = metaRow ? metaRow.last_synced_at : null;

    const result = await api.listSince(table, since, { includeDeleted: true });
    if (result.error) {
      if (result.error.networkError) break; // offline — stop pulling entirely, retry next trigger
      continue; // this table's pull failed server-side; don't let it block the others
    }

    let maxUpdatedAt = since;
    for (const doc of result.data || []) {
      if (doc.deleted_at) {
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, doc.id);
        // The record is gone server-side (another device deleted it); a
        // locally-queued mutation for it — e.g. an update that raced that
        // delete — can never succeed and would otherwise retry forever.
        await db.runAsync('DELETE FROM sync_queue WHERE table_name = ? AND record_id = ?', table, doc.id);
      } else {
        // A record with a still-queued local edit shouldn't be clobbered by a
        // stale pull (can happen after a partial push failure above).
        const pending = await db.getFirstAsync(
          'SELECT COUNT(*) as c FROM sync_queue WHERE table_name = ? AND record_id = ?', table, doc.id
        );
        if (pending && pending.c > 0) continue;
        await applyServerDoc(db, table, doc, 'synced');
      }
      if (doc.updated_at && (!maxUpdatedAt || doc.updated_at > maxUpdatedAt)) maxUpdatedAt = doc.updated_at;
      pulled += 1;
    }

    if (maxUpdatedAt && maxUpdatedAt !== since) {
      await db.runAsync(
        `INSERT INTO sync_meta (table_name, last_synced_at) VALUES (?, ?)
         ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
        table, maxUpdatedAt
      );
    }
  }

  return { pulled };
}
