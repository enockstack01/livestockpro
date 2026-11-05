import * as Crypto from 'expo-crypto';

/* Diagnosis photos checked on the phone with no connection (src/ml): the
   preliminary result is kept with the full request, and once the phone is
   back online flushScans() sends the request to /ai/diagnose, so the online
   model checks the photos again and the AI writes the full report. After
   that the photos are dropped from the phone; the report lives on the
   server like any other. */

/* Worth trying again later: limits, busy or unreachable AI. */
const RETRY_LATER = new Set(['AI_BURST', 'AI_LIMIT', 'AI_BUSY', 'AI_QUOTA', 'AI_UNREACHABLE', 'AI_NOT_CONFIGURED', 'AI_ERROR', 'AI_TRUNCATED', 'AI_BAD_OUTPUT', 'AI_EMPTY']);

export async function queueScan(db, userId, { request, preliminary, summary }) {
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO ai_scans (id, user_id, created_at, status, request, preliminary, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, userId, new Date().toISOString(), 'pending', JSON.stringify(request), JSON.stringify(preliminary), summary || null
  );
  changed();
  return id;
}

export async function listScans(db, userId, limit = 10) {
  const rows = await db.getAllAsync('SELECT id, created_at, status, preliminary, summary, report_id, last_error FROM ai_scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit);
  return rows.map((r) => ({ ...r, preliminary: JSON.parse(r.preliminary) }));
}

const listeners = new Set();
export function subscribeScans(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

/* Sends the waiting scans, oldest first. Stops at the first network error
   or limit (the rest wait for the next sync); a request the server rejects
   outright is marked failed so it cannot block the others. */
export async function flushScans(db, api, userId) {
  if (!userId) return { sent: 0, failed: 0 };
  const rows = await db.getAllAsync("SELECT id, request FROM ai_scans WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC", userId);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const { data, error } = await api.aiDiagnose(JSON.parse(row.request));
    if (error) {
      if (error.networkError) break;
      const later = RETRY_LATER.has(error.code) || !error.status || error.status >= 500 || error.status === 429;
      await db.runAsync(
        `UPDATE ai_scans SET attempts = attempts + 1, last_error = ?${later ? '' : ", status = 'failed', request = NULL"} WHERE id = ?`,
        String(error.message || error.code || 'failed').slice(0, 300), row.id
      );
      if (later) break;
      failed += 1;
      continue;
    }
    await db.runAsync("UPDATE ai_scans SET status = 'done', report_id = ?, summary = ?, request = NULL, last_error = NULL WHERE id = ?", data.id, data.title || null, row.id);
    sent += 1;
  }
  if (rows.length) changed();
  return { sent, failed };
}
