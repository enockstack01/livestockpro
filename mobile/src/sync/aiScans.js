import * as Crypto from 'expo-crypto';
import { tidyDeep } from '../../../shared/tidyText';

/* Photos checked on the phone with the embedded detector (src/ml): the
   detection findings and small previews of the photos, kept on this phone
   only so the farmer can open an earlier check again. They are findings,
   not online reports: nothing here is sent to the server. With the offline
   AI (src/ml/gemma) a check also keeps the offline diagnosis it wrote. The
   table is ai_scans (src/db/schema.js); `preliminary` holds { vision,
   thumbs, report }. */

const KEEP = 30;

export async function saveScan(db, userId, { vision, thumbs, summary, report }) {
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO ai_scans (id, user_id, created_at, status, preliminary, summary) VALUES (?, ?, ?, ?, ?, ?)',
    id, userId, new Date().toISOString(), 'done', JSON.stringify({ vision, thumbs, report: report || null }), summary || null
  );
  // Only the latest checks are kept, so old photos do not fill the phone.
  await db.runAsync('DELETE FROM ai_scans WHERE user_id = ? AND id NOT IN (SELECT id FROM ai_scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)', userId, userId, KEEP);
  changed();
  return id;
}

/* Newest first: [{ id, created_at, summary, vision, thumbs, report }]. Rows saved
   by the earlier queueing build kept only the detections. */
export async function listScans(db, userId, limit = 10) {
  const rows = await db.getAllAsync('SELECT id, created_at, preliminary, summary FROM ai_scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit);
  return rows.map((r) => {
    const p = JSON.parse(r.preliminary);
    return { id: r.id, created_at: r.created_at, summary: r.summary, vision: p.vision || p, thumbs: p.thumbs || [], report: p.report ? tidyDeep(p.report) : null };
  });
}

const listeners = new Set();
export async function deleteScan(db, id) {
  await db.runAsync('DELETE FROM ai_scans WHERE id = ?', id);
  changed();
}

export function subscribeScans(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed() {
  listeners.forEach((fn) => fn());
}
