/* "Download all my data" (Settings, web and phone): everything a user has
   recorded, in one document built from the same pieces as the record page
   exports (shared/recordExport.js), so PDF, Excel and CSV look the same.
   JSON is the complete copy: every stored field of every record, nothing
   left out, for backups and for moving to another program. */

import { SCHEMAS } from './schemas.js';
import { exportMeta, recordSection } from './recordExport.js';

/* Order of the sheets. Profile is the farm profile, kept apart. */
export const DATA_TABLES = ['animals', 'health_records', 'feeding_records', 'breeding_records', 'production_records', 'finance_records', 'tasks'];

const SYNC_ONLY = new Set(['sync_state', 'deleted_at', 'user_id']);

/* A record as the user entered it: its stored fields and timestamps, without
   the phone's sync bookkeeping. */
export function cleanRecord(table, row) {
  const keys = ['id', ...(SCHEMAS[table] || []), 'created_at', 'updated_at'];
  const out = {};
  keys.forEach((k) => { if (row[k] !== undefined && row[k] !== null && !SYNC_ONLY.has(k)) out[k] = row[k]; });
  return out;
}

/* data: { profiles: [...], animals: [...], ... }. Only tables with rows
   become sections. */
export function buildAllDataExport(data, t, { farmName, livestockId, account } = {}) {
  const sections = DATA_TABLES
    .filter((table) => (data[table] || []).length)
    .map((table) => recordSection(table, data[table], t, { keepEmptyColumns: false }));
  const profile = (data.profiles || [])[0] || {};
  const profileRows = [
    ['settings.farmName', profile.farm_name], ['settings.location', profile.location], ['settings.phoneNumber', profile.phone],
    ['org.fields.district', profile.district], ['org.fields.sector', profile.sector], ['org.fields.cell', profile.cell]
  ].filter(([, v]) => v).map(([k, v]) => ({ label: t(k), value: String(v) }));
  const total = DATA_TABLES.reduce((n, table) => n + (data[table] || []).length, 0);
  const title = t('exports.allDataTitle');
  return {
    title,
    subtitle: t('exports.recordsCount', { count: total }),
    meta: exportMeta(t, { farmName: farmName || profile.farm_name, livestockId }),
    profile: profileRows,
    summary: sections.map((s) => ({ label: s.title, value: String(s.rows.length) })),
    sections,
    /* The complete JSON copy (format "json"). */
    raw: buildBackup(data, { livestockId, account })
  };
}

export function buildBackup(data, { livestockId, account } = {}) {
  const backup = {
    app: 'LivestockPro',
    exported_at: new Date().toISOString(),
    livestock_id: livestockId || (account && account.livestockId) || null,
    profile: data.profiles && data.profiles[0] ? Object.fromEntries(Object.entries(data.profiles[0]).filter(([k, v]) => v !== null && !SYNC_ONLY.has(k) && k !== 'sync_state')) : null
  };
  DATA_TABLES.forEach((table) => { backup[table] = (data[table] || []).map((r) => cleanRecord(table, r)); });
  return backup;
}
