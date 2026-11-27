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
  const hasRecorder = table !== 'profiles';
  const columns = [
    'id',
    'user_id',
    ...(hasRecorder ? ['recorded_by'] : []),
    ...schemaFields,
    'created_at',
    'updated_at',
    'deleted_at',
    'sync_state',
  ];
  const values = [
    doc.id,
    doc.user_id,
    ...(hasRecorder ? [doc.recorded_by || doc.user_id || null] : []),
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
  const rows = await db.getAllAsync(
    'SELECT * FROM sync_queue ORDER BY queue_id ASC'
  );

  let flushed = 0;
  let failed = 0;

  // A conflict blocks later operations for that same record during this run.
  const blockedRecords = new Set();

  // After a successful write, later queued operations use the new server version.
  const latestUpdatedAt = new Map();

  for (const row of rows) {
    const recordKey = `${row.table_name}:${row.record_id}`;

    if (blockedRecords.has(recordKey)) {
      continue;
    }

    const baseUpdatedAt = latestUpdatedAt.has(recordKey)
      ? latestUpdatedAt.get(recordKey)
      : row.base_updated_at;

    let result;

    if (row.op === 'insert') {
      result = await api.insert(row.table_name, [JSON.parse(row.payload)]);
    } else if (row.op === 'update') {
      result = await api.update(
        row.table_name,
        row.record_id,
        JSON.parse(row.payload),
        baseUpdatedAt
      );
    } else {
      result = await api.remove(
        row.table_name,
        row.record_id,
        baseUpdatedAt
      );
    }

    if (result.error && result.error.networkError) {
      break;
    }

    if (result.error) {
      failed += 1;
      blockedRecords.add(recordKey);

      await db.runAsync(
        'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE queue_id = ?',
        result.error.message,
        row.queue_id
      );

      continue;
    }

    await db.runAsync(
      'DELETE FROM sync_queue WHERE queue_id = ?',
      row.queue_id
    );

    if (row.op === 'delete') {
      // A successful delete makes all later queued edits obsolete.
      await db.runAsync(
        'DELETE FROM sync_queue WHERE table_name = ? AND record_id = ?',
        row.table_name,
        row.record_id
      );

      await db.runAsync(
        `DELETE FROM ${row.table_name} WHERE id = ?`,
        row.record_id
      );

      latestUpdatedAt.delete(recordKey);
    } else {
      const serverDoc = Array.isArray(result.data)
        ? result.data[0]
        : result.data;

      if (serverDoc?.updated_at) {
        latestUpdatedAt.set(recordKey, serverDoc.updated_at);

        // Rebase all remaining queued operations for this record.
        await db.runAsync(
          `UPDATE sync_queue
           SET base_updated_at = ?
           WHERE table_name = ?
             AND record_id = ?
             AND queue_id > ?`,
          serverDoc.updated_at,
          row.table_name,
          row.record_id,
          row.queue_id
        );
      }

      const hasLaterOperation = rows.some(
        (candidate) =>
          candidate.queue_id > row.queue_id &&
          candidate.table_name === row.table_name &&
          candidate.record_id === row.record_id
      );

      // Keep the optimistic local version while later edits remain queued.
      if (serverDoc && !hasLaterOperation) {
        await applyServerDoc(
          db,
          row.table_name,
          serverDoc,
          'synced'
        );
      }
    }

    flushed += 1;
  }

  return { flushed, failed };
}
async function pullChanges(db, api) {
  let pulled = 0;
  const pageSize = 500;

  for (const table of SYNCED_TABLES) {
    const metaRow = await db.getFirstAsync(
      'SELECT last_synced_at FROM sync_meta WHERE table_name = ?',
      table
    );
    const since = metaRow ? metaRow.last_synced_at : null;

    let offset = 0;
    let maxUpdatedAt = since;
    let tableFailed = false;

    while (true) {
      const result = await api.listSince(table, since, {
        includeDeleted: true,
        limit: pageSize,
        offset
      });

      if (result.error) {
        if (result.error.networkError) return { pulled, interrupted: true };
        tableFailed = true;
        break;
      }

      const docs = result.data || [];

      for (const doc of docs) {
        if (doc.deleted_at) {
          const pendingRows = await db.getAllAsync(
            'SELECT op FROM sync_queue WHERE table_name = ? AND record_id = ?',
            table,
            doc.id
          );

          const hasPendingNonDelete = pendingRows.some(
            (pendingRow) => pendingRow.op !== 'delete'
          );

          if (!hasPendingNonDelete) {
            // No unsynced edits remain, or the local record was also deleted.
            await db.runAsync(
              `DELETE FROM ${table} WHERE id = ?`,
              doc.id
            );

            await db.runAsync(
              'DELETE FROM sync_queue WHERE table_name = ? AND record_id = ?',
              table,
              doc.id
            );
          }
          // Preserve local data and queued edits if an insert/update is pending.
          // The next push will detect the server-side deletion as a conflict.
        } else {
          const pending = await db.getFirstAsync(
            'SELECT COUNT(*) as c FROM sync_queue WHERE table_name = ? AND record_id = ?',
            table,
            doc.id
          );

          if (!(pending && pending.c > 0)) {
            await applyServerDoc(db, table, doc, 'synced');
          }
        }

        if (
          doc.updated_at &&
          (!maxUpdatedAt || doc.updated_at > maxUpdatedAt)
        ) {
          maxUpdatedAt = doc.updated_at;
        }

        pulled += 1;
      }

      if (docs.length < pageSize) break;
      offset += pageSize;
    }

    // Never advance this table's checkpoint after a failed page.
    if (!tableFailed && maxUpdatedAt && maxUpdatedAt !== since) {
      await db.runAsync(
        `INSERT INTO sync_meta (table_name, last_synced_at) VALUES (?, ?)
         ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
        table,
        maxUpdatedAt
      );
    }
  }

  return { pulled };
}
