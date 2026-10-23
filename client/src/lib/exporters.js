import { AGRICODERS_LOGO, LIVESTOCKPRO_LOGO } from '../../../shared/brandLogos.js';
import { docIsLandscape, docNeedsUnicodeFont, docToCsv, docToHtml, docToSheets, exportFileName } from '../../../shared/recordExport.js';

/* Saves an export document (shared/recordExport.js) as CSV, Excel or PDF.
   The PDF is drawn as real text and tables (jsPDF + autoTable): each column
   gets room by how much text it holds, long values wrap instead of being cut,
   the column headings repeat on every page, and wide tables go landscape.
   Text the built-in PDF fonts cannot draw (Arabic, Chinese, Hindi) is
   printed through the branded HTML layout instead, so nothing is lost. */

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportCsv(doc) {
  download(new Blob([docToCsv(doc)], { type: 'text/csv;charset=utf-8' }), exportFileName(doc.title, 'csv'));
}

export async function exportXlsx(doc) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const clean = (cell) => {
    if (!cell) return null;
    const out = {};
    for (const [k, v] of Object.entries(cell)) if (v !== undefined) out[k] = v;
    return out;
  };
  const sheets = docToSheets(doc).map((s) => ({
    data: s.data.map((row) => row.map(clean)),
    sheet: s.name,
    columns: s.columns,
    stickyRowsCount: s.summary ? 0 : 1
  }));
  const blob = await writeExcelFile(sheets).toBlob();
  download(blob, exportFileName(doc.title, 'xlsx'));
}

const FOREST = [27, 94, 32];
const PINE = [20, 83, 45];
const INK = [28, 43, 30];
const SLATE = [91, 107, 93];
const LINE = [223, 226, 223];
const ZEBRA = [245, 246, 245];

export async function exportPdf(doc, t, lang) {
  if (docNeedsUnicodeFont(doc)) return exportPdfFromHtml(doc, t, lang);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const landscape = docIsLandscape(doc);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const inner = W - M * 2;

  /* Brand band, once, at the top of the first page. */
  pdf.setFillColor(...PINE);
  pdf.roundedRect(M, M, inner, 17, 1.5, 1.5, 'F');
  pdf.addImage(LIVESTOCKPRO_LOGO, 'PNG', M + 3, M + 3, 11, 11);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('LivestockPro', M + 17, M + 8.2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(t('brand.tagline'), M + 17, M + 12.6);
  pdf.setFillColor(255, 255, 255);
  pdf.circle(W - M - 8.5, M + 8.5, 5.5, 'F');
  pdf.addImage(AGRICODERS_LOGO, 'PNG', W - M - 12.5, M + 4.5, 8, 8);
  pdf.setFontSize(7);
  pdf.text(t('ai.pdf.by'), W - M - 16, M + 7.4, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('Agricoders', W - M - 16, M + 11.6, { align: 'right' });

  /* Title, subtitle and details. */
  let y = M + 26;
  pdf.setTextColor(...FOREST);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.splitTextToSize(doc.title, inner).forEach((line) => { pdf.text(line, M, y); y += 6.5; });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE);
  if (doc.subtitle) { pdf.text(doc.subtitle, M, y); y += 5; }
  const meta = doc.meta.map((m) => `${m.label}: ${m.value}`).join('     ');
  pdf.setFontSize(8);
  pdf.splitTextToSize(meta, inner).forEach((line) => { pdf.text(line, M, y); y += 4; });
  pdf.setDrawColor(...LINE);
  pdf.line(M, y, W - M, y);
  y += 5;

  /* Animal profile (a report filtered to one animal). */
  if (doc.profile && doc.profile.length) {
    const cols = landscape ? 4 : 3;
    const cw = inner / cols;
    const start = y;
    let col = 0;
    let rowY = y + 4;
    let rowH = 0;
    doc.profile.forEach((p) => {
      const span = p.wide ? cols : 1;
      if (col + span > cols) { col = 0; rowY += rowH + 2; rowH = 0; }
      const width = cw * span - 4;
      pdf.setFontSize(7);
      pdf.setTextColor(...SLATE);
      pdf.text(p.label, M + 3 + col * cw, rowY);
      pdf.setFontSize(9);
      pdf.setTextColor(...INK);
      pdf.setFont('helvetica', 'bold');
      const lines = pdf.splitTextToSize(String(p.value), width);
      pdf.text(lines, M + 3 + col * cw, rowY + 4);
      pdf.setFont('helvetica', 'normal');
      rowH = Math.max(rowH, 4 + lines.length * 3.8);
      col += span;
      if (col >= cols) { col = 0; rowY += rowH + 2; rowH = 0; }
    });
    const end = rowY + rowH + (col ? 2 : -1);
    pdf.setDrawColor(...LINE);
    pdf.roundedRect(M, start, inner, end - start, 1.5, 1.5, 'S');
    y = end + 5;
  }

  /* Summary figures in boxes. */
  if (doc.summary.length) {
    const per = landscape ? 6 : 4;
    const bw = (inner - (per - 1) * 3) / per;
    doc.summary.forEach((s, i) => {
      const cx = M + (i % per) * (bw + 3);
      const cy = y + Math.floor(i / per) * 15;
      pdf.setDrawColor(...LINE);
      pdf.roundedRect(cx, cy, bw, 12.5, 1.2, 1.2, 'S');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...SLATE);
      pdf.text(pdf.splitTextToSize(String(s.label).toUpperCase(), bw - 4)[0], cx + 2.5, cy + 4.5);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...FOREST);
      pdf.text(pdf.splitTextToSize(String(s.value), bw - 4)[0], cx + 2.5, cy + 10);
      pdf.setFont('helvetica', 'normal');
    });
    y += Math.ceil(doc.summary.length / per) * 15 + 3;
  }

  /* One table per section. */
  doc.sections.forEach((sec) => {
    if (y > H - 40) { pdf.addPage(); y = M + 4; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.setTextColor(...FOREST);
    pdf.text(`${sec.title} (${sec.rows.length})`, M, y);
    y += 2.5;
    const total = sec.columns.reduce((a, c) => a + (c.weight || 1), 0);
    const columnStyles = {};
    sec.columns.forEach((c, i) => {
      columnStyles[i] = { cellWidth: (inner * (c.weight || 1)) / total, halign: c.type === 'number' || c.type === 'money' ? 'right' : 'left' };
    });
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M, top: M + 4, bottom: 16 },
      head: [sec.columns.map((c) => c.label)],
      body: sec.rows.map((r) => r.map((cell) => cell.text)),
      theme: 'plain',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      tableWidth: inner,
      styles: { font: 'helvetica', fontSize: 8, textColor: INK, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, overflow: 'linebreak', valign: 'top', lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, valign: 'bottom' },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles,
      /* Number headings line up with their right-aligned values. */
      didParseCell: (d) => { if (d.section === 'head' && columnStyles[d.column.index].halign === 'right') d.cell.styles.halign = 'right'; }
    });
    y = pdf.lastAutoTable.finalY + 8;
  });

  /* Footer with page numbers on every page. */
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...LINE);
    pdf.line(M, H - 10, W - M, H - 10);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    pdf.setFont('helvetica', 'normal');
    pdf.text(doc.title, M, H - 6);
    pdf.text(t('exports.page', { page: i, pages }), W - M, H - 6, { align: 'right' });
  }
  pdf.save(exportFileName(doc.title, 'pdf'));
  return true;
}

/* Arabic, Chinese, Hindi and other scripts: the branded HTML layout drawn
   to PDF by the browser's own text engine. */
async function exportPdfFromHtml(doc, t, lang) {
  const { default: html2pdf } = await import('html2pdf.js');
  const landscape = docIsLandscape(doc);
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${landscape ? 273 : 186}mm;background:#FFFFFF;`;
  const html = docToHtml(doc, t, { lang });
  holder.innerHTML = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8) + html.slice(html.indexOf('<div class="doc">'), html.lastIndexOf('</body>'));
  document.body.appendChild(holder);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const worker = html2pdf().set({
      margin: [12, 12, 16, 12],
      filename: exportFileName(doc.title, 'pdf'),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#FFFFFF', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2', '.summary', '.profile', '.sec.keep', '.foot'] }
    }).from(holder.querySelector('.doc')).toPdf();
    const pdf = await worker.get('pdf');
    const pages = pdf.internal.getNumberOfPages();
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(...SLATE);
      pdf.text(`${i} / ${pages}`, W - 12, H - 6, { align: 'right' });
    }
    await worker.save();
  } finally {
    holder.remove();
  }
  return true;
}

/* Opens the branded layout in a window for printing. */
export function printDoc(doc, t, lang) {
  const win = window.open('', '_blank', 'width=1000,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(docToHtml(doc, t, { lang }));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}

export async function exportDoc(doc, format, t, lang) {
  if (format === 'csv') return exportCsv(doc);
  if (format === 'xlsx') return exportXlsx(doc);
  return exportPdf(doc, t, lang);
}
