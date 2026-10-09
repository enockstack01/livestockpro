import { Platform } from 'react-native';
import * as Print from 'expo-print';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Printable version of the Reports screen — the phone counterpart of the
   web's window.print() on the report. Same content and look as the web's
   print output (light theme, green title rule, summary cards, one table per
   section), laid out for A4/Letter paper. The OS print dialog also offers
   "Save as PDF" on both iOS and Android. */
export function buildReportHtml({ title, subtitle, cardRows, sections, recordsLabel, emptyLabel }) {
  const cards = cardRows.map((row) => `
    <div class="cards">${row.map((c) => `
      <div class="card"><h4>${esc(c.label)}</h4><div class="amount" style="color:${c.color}">${esc(c.value)}</div></div>`).join('')}
    </div>`).join('');

  const tables = sections.map((s) => `
    <section>
      <div class="section-head"><h3>${esc(s.title)}</h3><span class="badge">${esc(recordsLabel(s.rows.length))}</span></div>
      ${s.rows.length === 0 ? `<p class="empty">${esc(emptyLabel(s.title))}</p>` : `
      <table>
        <thead><tr>${s.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map((r) => `<tr>${s.columns.map((c, i) => `<td${i === 0 ? ' class="strong"' : ''}>${esc(c.render ? c.render(r) : (r[c.key] ?? '—'))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`}
    </section>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #263238; margin: 0; font-size: 12px; }
  header { border-bottom: 2px solid #1B5E20; padding-bottom: 12px; margin-bottom: 18px; }
  header h1 { font-size: 20px; font-weight: 800; color: #1B5E20; margin: 0 0 4px; }
  header p { color: #546E7A; margin: 0; font-size: 11px; }
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .card { flex: 1 1 22%; border: 1px solid #E0E0E0; /* 4 per row on paper: 8 cards → 4 + 4 */ border-radius: 8px; padding: 10px; text-align: center; }
  .card h4 { font-size: 9px; color: #546E7A; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 4px; }
  .card .amount { font-size: 17px; font-weight: 800; }
  section { margin-top: 18px; break-inside: auto; }
  .section-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E0E0E0; padding-bottom: 6px; margin-bottom: 6px; }
  .section-head h3 { font-size: 14px; margin: 0; }
  .badge { background: #EDF1ED; color: #1B5E20; border-radius: 20px; padding: 2px 9px; font-size: 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; } /* repeat the header row on every printed page */
  th { background: #F5F7FA; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #546E7A; padding: 6px; border-bottom: 1.5px solid #E0E0E0; }
  td { padding: 6px; border-bottom: 1px solid #E0E0E0; font-size: 11px; vertical-align: top; }
  tr { break-inside: avoid; }
  td.strong { font-weight: 600; }
  .empty { color: #546E7A; font-style: italic; }
</style></head>
<body><header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header>${cards}${tables}</body></html>`;
}

/* Opens the system print dialog for `html`. On the web target expo-print
   would print the whole app page, so there the report goes to its own
   window and prints from that. */
export async function printHtml(html) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) throw new Error('Pop-up blocked');
    win.document.write(html);
    win.document.close();
    win.focus();
    // onload doesn't reliably fire for document.write — print once, whichever comes first.
    let printed = false;
    const go = () => { if (!printed) { printed = true; win.print(); } };
    win.onload = go;
    setTimeout(go, 400);
    return;
  }
  await Print.printAsync({ html });
}
