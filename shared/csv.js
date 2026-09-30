/* CSV reading shared by the web Animals page and the mobile Animals screen
   (both offer "Import CSV"). */

/* Splits one CSV line respecting double-quoted fields, so a quoted value
   containing a comma (e.g. an export's `"Pasture A, north side"`) round-trips
   instead of being split mid-field; `""` inside quotes is a literal quote. */
export function parseCsvLine(line) {
  const values = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      values.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  values.push(cur);
  return values;
}

/* Header row + data rows -> array of objects keyed by the (trimmed) header.
   Blank lines are skipped; a leading UTF-8 BOM (Excel adds one) is dropped. */
export function parseCSV(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  });
}

/* The animal-import rules both clients apply: tag_id and species are
   required (same as the manual Add Animal form); everything else defaults. */
export function animalsFromCsv(text) {
  const rows = parseCSV(text);
  const valid = rows.filter((row) => row.tag_id && row.species);
  const records = valid.map((row) => ({
    tag_id: row.tag_id, name: row.name || '', species: row.species, breed: row.breed || '',
    sex: row.sex || '', date_of_birth: row.date_of_birth || null, location: row.location || '',
    health_status: row.health_status || 'Healthy', notes: row.notes || ''
  }));
  return { total: rows.length, records, skipped: rows.length - valid.length };
}
