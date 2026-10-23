/* Exports for every records page and the farm report, shared by the web app
   and the mobile app so a file looks the same wherever it was made.

   A document is { title, subtitle, meta: [{ label, value }], summary:
   [{ label, value }], sections: [{ key, title, columns, rows }] }, where a
   column is { key, label, type, weight } and a row is a list of cells
   { v (raw: number or ISO date or text), text (what people read) }.
   From one document: CSV (docToCsv), Excel sheets (docToSheets), branded
   HTML for print and phone PDFs (docToHtml), and the web's vector PDF
   (client/src/lib/exporters.js). Every value is written in full; nothing
   is shortened. */

import { AGRICODERS_LOGO, LIVESTOCKPRO_LOGO } from './brandLogos.js';
import { fmtDate } from './format.js';
import { recordCurrency } from './currency.js';

/* type: text | date | number | money | enum. weight: relative column width
   in the PDF (long text gets more room). */
export const EXPORT_COLUMNS = {
  animals: [
    { key: 'tag_id', weight: 1 }, { key: 'name', weight: 1.1 }, { key: 'species', type: 'enum', group: 'species', weight: 1 },
    { key: 'breed', weight: 1.1 }, { key: 'sex', type: 'enum', group: 'sex', weight: 0.8 }, { key: 'date_of_birth', type: 'date', weight: 1 },
    { key: 'location', weight: 1.2 }, { key: 'district', weight: 1 }, { key: 'health_status', type: 'enum', group: 'animalHealthStatus', weight: 1.1 },
    { key: 'last_check_date', type: 'date', weight: 1 }, { key: 'notes', weight: 2.2 }
  ],
  health_records: [
    { key: 'tag_id', weight: 0.9 }, { key: 'disease', weight: 1.4 }, { key: 'treatment', weight: 1.6 }, { key: 'medicine', weight: 1.3 },
    { key: 'vet_name', weight: 1 }, { key: 'check_date', type: 'date', weight: 1 }, { key: 'next_check_date', type: 'date', weight: 1 },
    { key: 'status', type: 'enum', group: 'healthRecordStatus', weight: 1 }, { key: 'district', weight: 0.9 }, { key: 'notes', weight: 2 }
  ],
  feeding_records: [
    { key: 'feeding_date', type: 'date', weight: 1 }, { key: 'feed_type', weight: 1.3 }, { key: 'animal_group', weight: 1.2 },
    { key: 'quantity', type: 'number', weight: 0.8 }, { key: 'unit', type: 'enum', group: 'feedingUnit', weight: 0.8 },
    { key: 'cost', type: 'number', weight: 0.9 }, { key: 'currency', weight: 0.7 }, { key: 'district', weight: 0.9 }, { key: 'notes', weight: 2 }
  ],
  breeding_records: [
    { key: 'tag_id', weight: 0.9 }, { key: 'breeding_date', type: 'date', weight: 1 }, { key: 'pregnancy_status', type: 'enum', group: 'pregnancyStatus', weight: 1 },
    { key: 'expected_birth_date', type: 'date', weight: 1 }, { key: 'birth_date', type: 'date', weight: 1 }, { key: 'newborn_count', type: 'number', weight: 0.8 },
    { key: 'newborn_details', weight: 1.8 }, { key: 'district', weight: 0.9 }, { key: 'notes', weight: 1.8 }
  ],
  production_records: [
    { key: 'production_date', type: 'date', weight: 1 }, { key: 'production_type', type: 'enum', group: 'productionType', weight: 1 },
    { key: 'tag_id', weight: 0.9 }, { key: 'quantity', type: 'number', weight: 0.8 }, { key: 'unit', type: 'enum', group: 'productionUnit', weight: 0.8 },
    { key: 'district', weight: 0.9 }, { key: 'notes', weight: 2.2 }
  ],
  finance_records: [
    { key: 'date', type: 'date', weight: 1 }, { key: 'type', type: 'enum', group: 'financeType', weight: 0.9 },
    { key: 'category', type: 'enum', group: 'financeCategory', weight: 1.2 }, { key: 'tag_id', weight: 0.9 },
    { key: 'amount', type: 'money', weight: 1.1 }, { key: 'currency', weight: 0.7 }, { key: 'district', weight: 0.9 }, { key: 'description', weight: 2.4 }
  ],
  tasks: [
    { key: 'title', weight: 1.6 }, { key: 'description', weight: 2.4 }, { key: 'due_date', type: 'date', weight: 1 },
    { key: 'priority', type: 'enum', group: 'taskPriority', weight: 0.9 }, { key: 'status', type: 'enum', group: 'taskStatus', weight: 1 },
    { key: 'district', weight: 0.9 }
  ]
};

export const EXPORT_TITLE_KEYS = {
  animals: 'tables.animals.label', health_records: 'healthPage.title', feeding_records: 'tables.feeding_records.label',
  breeding_records: 'tables.breeding_records.label', production_records: 'tables.production_records.label',
  finance_records: 'tables.finance_records.label', tasks: 'tables.tasks.label'
};

/* Labels: the table's own field name, else the shared export labels. */
export function columnLabel(table, key, t) {
  const own = t(`tables.${table}.fields.${key}`, { defaultValue: '' });
  return own || t(`exports.fields.${key}`, { defaultValue: key });
}

const blank = (v) => v === null || v === undefined || v === '';

export function cellOf(col, value, record, t) {
  if (blank(value)) return { v: '', text: '' };
  switch (col.type) {
    case 'date': return { v: String(value).slice(0, 10), text: fmtDate(value) };
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? { v: n, text: n.toLocaleString() } : { v: String(value), text: String(value) };
    }
    case 'money': {
      const n = Number(value);
      return Number.isFinite(n) ? { v: n, text: n.toLocaleString(undefined, { maximumFractionDigits: 2 }) } : { v: String(value), text: String(value) };
    }
    case 'enum': return { v: String(value), text: t(`enums.${col.group}.${value}`, { defaultValue: String(value) }) };
    default: return { v: String(value), text: String(value) };
  }
}

/* One section of records. Columns that are empty in every row are left out,
   so the page is spent on information. */
export function recordSection(table, rows, t, { title, keepEmptyColumns = false } = {}) {
  let cols = EXPORT_COLUMNS[table].map((c) => ({ ...c, label: columnLabel(table, c.key, t) }));
  const valueOf = (r, c) => (c.key === 'currency' ? (r.currency || (table === 'finance_records' ? recordCurrency(r) : '')) : r[c.key]);
  if (!keepEmptyColumns) cols = cols.filter((c) => rows.some((r) => !blank(valueOf(r, c))));
  return {
    key: table,
    title: title || t(EXPORT_TITLE_KEYS[table]),
    columns: cols,
    rows: rows.map((r) => cols.map((c) => cellOf(c, valueOf(r, c), r, t)))
  };
}

/* A records page export: the rows the page currently shows. */
export function buildRecordExport(table, rows, t, { filtersText, farmName, livestockId } = {}) {
  const section = recordSection(table, rows, t);
  return {
    title: section.title,
    subtitle: t('exports.recordsCount', { count: rows.length }),
    meta: exportMeta(t, { farmName, livestockId, filtersText }),
    summary: [],
    sections: [section]
  };
}

export function exportMeta(t, { farmName, livestockId, filtersText, generatedAt = new Date() } = {}) {
  return [
    farmName ? { label: t('exports.farm'), value: farmName } : null,
    livestockId ? { label: t('settings.livestockId'), value: livestockId } : null,
    { label: t('exports.generated'), value: generatedAt.toLocaleString() },
    filtersText ? { label: t('exports.filters'), value: filtersText } : null
  ].filter(Boolean);
}

export function exportFileName(title, ext) {
  const base = String(title || 'LivestockPro').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'LivestockPro';
  return `LivestockPro_${base}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/* ---------- CSV ---------- */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function docToCsv(doc) {
  const lines = [];
  const multi = doc.sections.length > 1 || Boolean(doc.profile && doc.profile.length) || doc.summary.length > 0;
  if (multi) {
    lines.push(csvCell(doc.title));
    doc.meta.forEach((m) => lines.push([m.label, m.value].map(csvCell).join(',')));
    if (doc.profile && doc.profile.length) { lines.push(''); doc.profile.forEach((p) => lines.push([p.label, p.value].map(csvCell).join(','))); }
    if (doc.summary.length) { lines.push(''); doc.summary.forEach((s) => lines.push([s.label, s.value].map(csvCell).join(','))); }
  }
  doc.sections.forEach((sec) => {
    if (multi) { lines.push(''); lines.push(csvCell(`${sec.title} (${sec.rows.length})`)); }
    lines.push(sec.columns.map((c) => csvCell(c.label)).join(','));
    sec.rows.forEach((row) => lines.push(row.map((cell) => csvCell(cell.v)).join(',')));
  });
  return '﻿' + lines.join('\r\n');
}

/* ---------- Excel ----------
   One sheet per section (a summary sheet first when there is one), in the
   shape write-excel-file takes: rows of { value, type, fontWeight, ... }. */

const FOREST = '#1B5E20';

export function docToSheets(doc) {
  const head = (label) => ({ value: label, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: FOREST, wrap: true });
  const sheets = [];
  if (doc.summary.length || doc.sections.length > 1 || doc.meta.length) {
    const rows = [[{ value: doc.title, fontWeight: 'bold', fontSize: 14, color: FOREST }], []];
    doc.meta.forEach((m) => rows.push([{ value: m.label, fontWeight: 'bold' }, { value: String(m.value) }]));
    if (doc.profile && doc.profile.length) {
      rows.push([]);
      doc.profile.forEach((p) => rows.push([{ value: p.label, fontWeight: 'bold' }, { value: String(p.value), wrap: true }]));
    }
    if (doc.summary.length) {
      rows.push([]);
      doc.summary.forEach((s) => rows.push([{ value: s.label, fontWeight: 'bold' }, { value: String(s.value) }]));
    }
    if (doc.sections.length > 1) {
      rows.push([]);
      doc.sections.forEach((s) => rows.push([{ value: s.title, fontWeight: 'bold' }, { value: s.rows.length, type: Number }]));
    }
    sheets.push({ name: sheetName(doc.summaryTitle || doc.title, sheets), data: rows, columns: [{ width: 28 }, { width: 48 }], summary: true });
  }
  doc.sections.forEach((sec) => {
    const data = [sec.columns.map((c) => head(c.label))];
    sec.rows.forEach((row) => data.push(row.map((cell, i) => {
      const c = sec.columns[i];
      if (cell.v === '' || cell.v === null || cell.v === undefined) return null;
      if ((c.type === 'number' || c.type === 'money') && typeof cell.v === 'number') return { value: cell.v, type: Number, format: c.type === 'money' ? '#,##0.00' : undefined };
      if (c.type === 'enum') return { value: cell.text, wrap: true };
      return { value: String(cell.v), wrap: true };
    })));
    const columns = sec.columns.map((c) => ({ width: Math.max(10, Math.min(60, Math.round(c.weight * 14))) }));
    sheets.push({ name: sheetName(sec.title, sheets), data, columns });
  });
  return sheets;
}

function sheetName(title, existing) {
  let base = String(title || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  let n = 2;
  while (existing.some((s) => s.name === name)) name = `${base.slice(0, 26)} ${n++}`;
  return name;
}

/* ---------- Branded HTML (print, phone PDF, and web PDF for scripts the
   built-in PDF fonts cannot draw) ---------- */

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Wide tables are printed in landscape. */
export const docIsLandscape = (doc) => doc.sections.some((s) => s.columns.length > 6);

/* jsPDF's built-in fonts cover Western European text only (Latin-1 plus a
   few typographic marks). The pattern is built from code points so the file
   stays plain ASCII. */
const PDF_FONT_CHARS = new RegExp(`[^\\t\\n\\r\\u0020-\\u00FF${['2013', '2014', '2018', '2019', '201C', '201D', '2022', '2026', '20AC'].map((c) => `\\u${c}`).join('')}]`);
export const docNeedsUnicodeFont = (doc) => PDF_FONT_CHARS.test(JSON.stringify([doc.title, doc.subtitle, doc.meta, doc.summary, doc.sections.map((s) => [s.title, s.columns.map((c) => c.label), s.rows.map((r) => r.map((c) => c.text))])]));

const CSS = `
  @page { size: A4 PORTRAIT_OR_LANDSCAPE; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Carlito, Arial, sans-serif; color: #1C2B1E; font-size: 9.5pt; line-height: 1.4; background: #FFFFFF; }
  .doc { max-width: 100%; padding-bottom: 6mm; }
  .band { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #14532D; color: #FFFFFF; padding: 12px 16px; border-radius: 6px; }
  .band .brand { display: flex; align-items: center; gap: 10px; }
  .band .brand img { width: 34px; height: 34px; border-radius: 8px; }
  .band .name { font-size: 15pt; font-weight: 700; line-height: 1.1; }
  .band .tag { font-size: 8.5pt; opacity: 0.9; }
  .band .maker { display: flex; align-items: center; gap: 8px; font-size: 8pt; text-align: right; }
  .band .maker strong { display: block; font-size: 10pt; }
  .band .disc { width: 30px; height: 30px; border-radius: 50%; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .band .disc img { width: 22px; height: 22px; }
  h1 { color: #1B5E20; font-size: 17pt; margin: 14px 0 2px; }
  .subtitle { color: #5B6B5D; margin: 0 0 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 8.5pt; color: #5B6B5D; padding-bottom: 8px; border-bottom: 1px solid #DFE2DF; margin-bottom: 10px; }
  .meta strong { color: #1C2B1E; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  .summary .s { border: 1px solid #DFE2DF; border-radius: 6px; padding: 6px 10px; min-width: 110px; }
  .summary .s span { display: block; font-size: 7.5pt; color: #5B6B5D; text-transform: uppercase; letter-spacing: 0.3px; }
  .summary .s strong { font-size: 11pt; color: #1B5E20; }
  .profile { border: 1px solid #DFE2DF; border-radius: 6px; padding: 8px 12px; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 4px 0; }
  .profile .kv { width: 33.33%; padding: 2px 8px 2px 0; }
  .profile .kv span { display: block; font-size: 7.5pt; color: #5B6B5D; }
  .profile .kv.wide { width: 100%; }
  h2 { color: #1B5E20; font-size: 12pt; margin: 14px 0 6px; page-break-after: avoid; }
  h2 small { color: #5B6B5D; font-weight: 400; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: #1B5E20; color: #FFFFFF; text-align: left; font-weight: 700; padding: 5px 6px; font-size: 8.5pt; vertical-align: bottom; }
  td { padding: 4px 6px; border-bottom: 1px solid #DFE2DF; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; white-space: pre-wrap; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #F5F6F5; }
  td.num { text-align: right; white-space: nowrap; }
  [dir="rtl"] th, [dir="rtl"] td { text-align: right; }
  /* Letter spacing and capitals break joined scripts such as Arabic. */
  [dir="rtl"] .summary .s span { letter-spacing: 0; text-transform: none; }
  .sec.keep { page-break-inside: avoid; }
  .foot { page-break-inside: avoid; }
  [dir="rtl"] td.num { text-align: left; }
  .foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #DFE2DF; font-size: 8pt; color: #5B6B5D; display: flex; justify-content: space-between; }
`;

export function docToHtml(doc, t, { lang = 'en', dir = lang === 'ar' ? 'rtl' : 'ltr' } = {}) {
  const css = CSS.replace('PORTRAIT_OR_LANDSCAPE', docIsLandscape(doc) ? 'landscape' : 'portrait');
  const profile = doc.profile && doc.profile.length
    ? `<div class="profile">${doc.profile.map((p) => `<div class="kv${p.wide ? ' wide' : ''}"><span>${esc(p.label)}</span><strong>${esc(p.value)}</strong></div>`).join('')}</div>`
    : '';
  const sections = doc.sections.map((s) => {
    const total = s.columns.reduce((a, c) => a + (c.weight || 1), 0);
    const cols = s.columns.map((c) => `<col style="width:${(((c.weight || 1) / total) * 100).toFixed(2)}%">`).join('');
    const head = s.columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const body = s.rows.map((r) => `<tr>${r.map((cell, i) => `<td${['number', 'money'].includes(s.columns[i].type) ? ' class="num"' : ''}>${esc(cell.text)}</td>`).join('')}</tr>`).join('');
    /* A short table moves to the next page whole instead of leaving its
       heading stranded at the bottom of a page. */
    return `<section class="sec${s.rows.length <= 12 ? ' keep' : ''}"><h2>${esc(s.title)} <small>(${s.rows.length})</small></h2><table><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(doc.title)}</title><style>${css}</style></head><body>
<div class="doc">
  <div class="band">
    <div class="brand"><img src="${LIVESTOCKPRO_LOGO}" alt=""><div><div class="name">LivestockPro</div><div class="tag">${esc(t('brand.tagline'))}</div></div></div>
    <div class="maker"><div>${esc(t('ai.pdf.by'))}<strong>Agricoders</strong></div><div class="disc"><img src="${AGRICODERS_LOGO}" alt=""></div></div>
  </div>
  <h1>${esc(doc.title)}</h1>
  ${doc.subtitle ? `<p class="subtitle">${esc(doc.subtitle)}</p>` : ''}
  <div class="meta">${doc.meta.map((m) => `<span>${esc(m.label)}: <strong>${esc(m.value)}</strong></span>`).join('')}</div>
  ${profile}
  ${doc.summary.length ? `<div class="summary">${doc.summary.map((s) => `<div class="s"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('')}</div>` : ''}
  ${sections}
  <div class="foot"><span>livestock.agricoders.com</span><span>${esc(new Date().toLocaleDateString(lang))}</span></div>
</div>
</body></html>`;
}
