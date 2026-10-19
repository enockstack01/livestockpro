import { AGRICODERS_LOGO, LIVESTOCKPRO_LOGO } from './brandLogos.js';

/* Branded AI reports, shared by the web app (Download PDF, Print) and the
   mobile app (expo-print to a PDF file). One self-contained HTML page in the
   Agricoders report template: Pine header band carrying the LivestockPro app
   icon and the Agricoders mark in a white disc, Forest headings, Leaf
   section numbers, solid pills (White on Forest, Ink on Amber, White on
   Alert Red), Calibri, no gradients or edge stripes, and the
   "LivestockPro · by Agricoders" footer. Logos are embedded, so the report
   needs no network.

   mode 'print' adds page margin footers for the browser's or phone's own
   print engine; mode 'pdf' leaves them out because the web PDF writer
   stamps the footer and page numbers on each page itself. */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PILL = {
  emergency: 'red', urgent: 'red', soon: 'amber', routine: 'green',
  high: 'red', medium: 'amber', low: 'green', none: 'green',
  critical: 'red', immediate: 'red', this_week: 'amber', monitor: 'slate',
  today: 'red', this_month: 'slate', yes: 'red', no: 'green'
};
const pill = (value, label) => `<span class="pill pill-${PILL[value] || 'slate'}"><span class="pt">${esc(label)}</span></span>`;
const list = (items, cls = '') => (items && items.length ? `<div class="list ${cls}">${items.map((i) => `<div class="li"><span class="mk">•</span><span class="tx">${esc(i)}</span></div>`).join('')}</div>` : '');
const ordered = (items) => (items && items.length ? `<div class="list steps">${items.map((i, n) => `<div class="li"><span class="mk">${n + 1}.</span><span class="tx">${esc(i)}</span></div>`).join('')}</div>` : '');
const para = (text) => (text ? `<p>${esc(text)}</p>` : '');

/* Numbered sections: only the ones with content get a number. */
function sections(parts) {
  let n = 0;
  return parts.filter((p) => p && p.body).map((p) => {
    n += 1;
    return `<section class="sec${p.keep ? ' avoid' : ''}"><h2><span class="num"><span class="pt">${n}</span></span>${esc(p.title)}</h2>${p.body}</section>`;
  }).join('');
}

function glance(boxes) {
  return `<div class="glance avoid">${boxes.map((b) => `<div class="g"><div class="g-label">${esc(b.label)}</div><div class="g-value">${b.value}</div></div>`).join('')}</div>`;
}

function caseDetails(c, t) {
  if (!c) return '';
  const f = (k) => t(`ai.pdf.fields.${k}`);
  const rows = [
    ['farm', c.farm_name], ['location', c.location], ['tag', c.tag_id], ['name', c.name],
    ['species', c.species && t(`enums.species.${c.species}`, { defaultValue: c.species })], ['breed', c.breed],
    ['sex', c.sex && t(`enums.sex.${c.sex}`, { defaultValue: c.sex })], ['age', c.age],
    ['healthStatus', c.health_status && t(`enums.animalHealthStatus.${c.health_status}`, { defaultValue: c.health_status })],
    ['recordStatus', c.record_status && t(`enums.healthRecordStatus.${c.record_status}`, { defaultValue: c.record_status })],
    ['checkDate', c.check_date], ['vet', c.vet_name]
  ].filter(([, v]) => v);
  const cells = rows.map(([k, v]) => `<div class="kv"><span>${esc(f(k))}</span><strong>${esc(v)}</strong></div>`).join('');
  const wide = [['reportedSigns', c.reported_signs], ['currentTreatment', c.current_treatment]].filter(([, v]) => v)
    .map(([k, v]) => `<div class="kv kv-wide"><span>${esc(f(k))}</span><strong>${esc(v)}</strong></div>`).join('');
  if (!cells && !wide) return '';
  return `<div class="case avoid"><h3>${esc(t('ai.pdf.caseDetails'))}</h3><div class="kv-grid">${cells}${wide}</div></div>`;
}

function diagnosisBody(r, t, caseInfo) {
  const tr = (k, o) => t(`ai.report.${k}`, o);
  const yes = t('ai.pdf.yes');
  const no = t('ai.pdf.no');
  const z = r.zoonotic || {};
  const conditions = (r.likely_conditions || []).length ? `
    <table class="tbl">
      <thead><tr><th style="width:30%">${esc(t('ai.pdf.condition'))}</th><th style="width:14%">${esc(t('ai.pdf.likelihood'))}</th><th>${esc(t('ai.pdf.why'))}</th></tr></thead>
      <tbody>${r.likely_conditions.map((c) => `<tr class="avoid"><td><strong>${esc(c.name)}</strong></td><td>${pill(c.likelihood, tr(`likelihood.${c.likelihood}`))}</td><td>${esc(c.why)}</td></tr>`).join('')}</tbody>
    </table>` : '';
  const meds = (r.medications || []).length ? `
    <table class="tbl meds">
      <thead><tr><th style="width:21%">${esc(t('ai.pdf.medicine'))}</th><th style="width:18%">${esc(tr('purpose'))}</th><th style="width:21%">${esc(tr('howToGive'))}</th><th style="width:21%">${esc(tr('dose'))}</th><th>${esc(tr('withdrawal'))}</th></tr></thead>
      <tbody>${r.medications.map((m) => `<tr class="avoid"><td><strong>${esc(m.name)}</strong>${m.prescription_only ? `<div class="rx">${pill('medium', tr('prescription'))}</div>` : ''}</td><td>${esc(m.purpose)}</td><td>${esc(m.how_to_give)}</td><td>${esc(m.dose_guidance)}</td><td>${esc(m.withdrawal_period)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="small">${esc(t('ai.pdf.medNote'))}</p>` : '';

  return [
    glance([
      { label: tr('urgency'), value: pill(r.urgency, tr(`urgencyLevels.${r.urgency}`)) },
      { label: t('ai.pdf.vetNeeded'), value: pill(r.see_vet ? 'yes' : 'no', r.see_vet ? yes : no) },
      { label: tr('zoonotic'), value: pill(z.risk || 'none', tr(`zoonoticLevels.${z.risk || 'none'}`)) },
      { label: t('ai.pdf.notifiable'), value: pill(r.notifiable ? 'yes' : 'no', r.notifiable ? yes : no) }
    ]),
    caseDetails(caseInfo, t),
    `<div class="summary avoid"><h3>${esc(t('ai.pdf.summary'))}</h3>${para(r.summary)}${r.see_vet_reason ? `<p class="callout"><strong>${esc(tr('seeVet'))}:</strong> ${esc(r.see_vet_reason)}</p>` : ''}</div>`,
    sections([
      { title: tr('likely'), body: conditions },
      { title: tr('cause'), body: para(r.cause), keep: true },
      { title: tr('treatment'), body: ordered(r.treatment_steps) },
      { title: tr('medications'), body: meds },
      { title: tr('care'), body: list(r.supportive_care), keep: true },
      { title: tr('isolation'), body: para(r.isolation_advice), keep: true },
      { title: tr('zoonotic'), body: (z.precautions || r.notifiable) ? `${para(z.precautions)}${r.notifiable ? `<p class="callout">${esc(tr('notifiable'))}</p>` : ''}` : '', keep: true },
      { title: tr('warning'), body: list(r.warning_signs, 'warn'), keep: true },
      { title: tr('prevention'), body: list(r.prevention), keep: true },
      { title: tr('questions'), body: list(r.questions_for_vet), keep: true },
      { title: tr('gaps'), body: list(r.data_gaps), keep: true }
    ]),
    `<div class="review avoid">
      <h3>${esc(t('ai.pdf.vetReview'))}</h3>
      <p class="small">${esc(t('ai.pdf.vetReviewNote'))}</p>
      <div class="sign">
        <div><span>${esc(t('ai.pdf.reviewedBy'))}</span></div>
        <div><span>${esc(t('ai.pdf.licence'))}</span></div>
        <div><span>${esc(t('ai.pdf.signature'))}</span></div>
        <div><span>${esc(t('ai.pdf.date'))}</span></div>
      </div>
    </div>`,
    `<div class="disclaimer avoid"><strong>${esc(t('ai.pdf.important'))}</strong> ${esc(t('ai.vetNotice'))}</div>`
  ].join('');
}

function advisorBody(r, t) {
  const ta = (k, o) => t(`ai.advisor.${k}`, o);
  const figures = (r.figures || []).length
    ? `<div class="glance avoid">${r.figures.slice(0, 6).map((f) => `<div class="g"><div class="g-label">${esc(f.label)}</div><div class="g-num">${esc(f.value)}</div><div class="g-sub">${esc(f.comment)}</div></div>`).join('')}</div>`
    : '';
  return [
    figures,
    `<div class="summary avoid"><h3>${esc(t('ai.pdf.summary'))}</h3>${para(r.summary)}</div>`,
    sections([
      { title: ta('priorities'), body: (r.priorities || []).map((p) => `<div class="item avoid"><div class="item-head"><strong>${esc(p.title)}</strong>${pill(p.when, ta(`when.${p.when}`))}</div>${para(p.detail)}</div>`).join('') },
      { title: ta('strengths'), body: list(r.strengths), keep: true },
      { title: ta('risks'), body: (r.risks || []).map((k) => `<div class="item avoid"><div class="item-head"><strong>${esc(k.title)}</strong>${pill(k.severity, t(`ai.report.likelihood.${k.severity}`))}</div>${para(k.detail)}</div>`).join('') }
    ])
  ].join('');
}

const SEVERITY_KEY = { critical: 'enums.animalHealthStatus.Critical', high: 'enums.taskPriority.High', medium: 'enums.taskPriority.Medium', low: 'enums.taskPriority.Low' };

function briefBody(r, t) {
  const tb = (k, o) => t(`ai.brief.${k}`, o);
  return [
    `<div class="summary avoid"><h3>${esc(t('ai.pdf.summary'))}</h3>${para(r.situation)}</div>`,
    sections([
      { title: tb('actions'), body: (r.priority_actions || []).length ? `
        <table class="tbl"><thead><tr><th style="width:36%">${esc(t('ai.pdf.action'))}</th><th style="width:16%">${esc(tb('who'))}</th><th>${esc(tb('why'))}</th><th style="width:14%">${esc(t('ai.report.urgency'))}</th></tr></thead>
        <tbody>${r.priority_actions.map((a) => `<tr class="avoid"><td><strong>${esc(a.action)}</strong></td><td>${esc(a.who)}</td><td>${esc(a.why)}</td><td>${pill(a.urgency, tb(`urgency.${a.urgency}`))}</td></tr>`).join('')}</tbody></table>` : '' },
      { title: tb('hotspots'), body: (r.hotspots || []).map((h) => `<div class="item avoid"><div class="item-head"><strong>${esc(h.district)}</strong>${pill(h.severity, t(SEVERITY_KEY[h.severity] || SEVERITY_KEY.low))}</div>${para(h.concern)}</div>`).join('') },
      { title: tb('zoonotic'), body: para(r.zoonotic_notes), keep: true },
      { title: tb('farmerMessage'), body: r.farmer_message ? `<p class="callout">${esc(r.farmer_message)}</p>` : '', keep: true }
    ])
  ].join('');
}

const CSS = `
  @page { size: A4; margin: 14mm 14mm 18mm; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  .lp-doc, .lp-doc * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-doc { font-family: Calibri, Carlito, Arial, sans-serif; color: #1C2B1E; font-size: 10.5pt; line-height: 1.45; }
  .lp-doc p { margin: 3px 0 7px; }
  .band { background: #14532D; color: #FFFFFF; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img.app { width: 50px; height: 50px; border-radius: 12px; display: block; }
  .brand .name { font-size: 19pt; font-weight: 700; line-height: 1.25; }
  .brand .tag { font-size: 9pt; line-height: 1.3; opacity: 0.85; }
  .maker { display: flex; align-items: center; gap: 9px; text-align: right; }
  .maker .disc { width: 46px; height: 46px; border-radius: 50%; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .maker .disc img { width: 38px; height: 38px; display: block; }
  .maker .by { font-size: 8.5pt; opacity: 0.85; }
  .maker .co { font-size: 12pt; font-weight: 700; }
  .doc-type { color: #2E7D32; font-weight: 700; font-size: 10pt; margin: 16px 0 2px; letter-spacing: 0.3px; }
  h1 { color: #1B5E20; font-size: 18pt; line-height: 1.2; margin: 0 0 6px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: #5B6B5D; font-size: 9pt; padding-bottom: 10px; border-bottom: 1px solid #DFE2DF; margin-bottom: 12px; }
  .meta strong { color: #1C2B1E; font-weight: 700; }
  .glance { display: flex; gap: 8px; margin: 0 0 12px; }
  .g { flex: 1 1 0; border: 1px solid #DFE2DF; border-radius: 8px; padding: 8px 10px; min-width: 0; }
  .g-label { color: #5B6B5D; font-size: 8.5pt; line-height: 1.3; margin-bottom: 6px; }
  .g-num { font-size: 14pt; font-weight: 700; }
  .g-sub { color: #5B6B5D; font-size: 8.5pt; }
  .pill { display: inline-block; height: 17px; line-height: 17px; padding: 0 9px; border-radius: 9px; font-size: 8.5pt; font-weight: 700; white-space: nowrap; vertical-align: middle; }
  .pill-green { background: #1B5E20; color: #FFFFFF; }
  .pill-amber { background: #F9A825; color: #1C2B1E; }
  .pill-red { background: #C62828; color: #FFFFFF; }
  .pill-slate { background: #5B6B5D; color: #FFFFFF; }
  .case, .summary, .review { border: 1px solid #DFE2DF; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
  .case h3, .summary h3, .review h3 { color: #1B5E20; font-size: 11.5pt; margin: 0 0 6px; }
  .kv-grid { display: flex; flex-wrap: wrap; gap: 6px 0; }
  .kv { width: 33.33%; padding-right: 10px; }
  .kv-wide { width: 100%; }
  .kv span { display: block; color: #5B6B5D; font-size: 8.5pt; }
  .kv strong { font-weight: 700; }
  .callout { background: #F5F6F5; border-radius: 6px; padding: 7px 10px; }
  .sec { margin: 0 0 10px; }
  .sec h2 { display: flex; align-items: center; gap: 8px; color: #1B5E20; font-size: 12pt; margin: 12px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #DFE2DF; }
  .num { display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background: #2E7D32; color: #FFFFFF; font-size: 9pt; font-weight: 700; flex: none; }
  .list { margin: 3px 0 7px; }
  .li { display: flex; gap: 6px; margin: 3px 0; break-inside: avoid; page-break-inside: avoid; }
  .mk { flex: none; width: 16px; color: #2E7D32; font-weight: 700; }
  .warn .mk { color: #C62828; }
  .tx { flex: 1; min-width: 0; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .tbl th { background: #1B5E20; color: #FFFFFF; text-align: left; font-weight: 700; padding: 6px 7px; }
  .tbl td { border-bottom: 1px solid #DFE2DF; padding: 6px 7px; vertical-align: top; }
  .tbl tr:nth-child(even) td { background: #F5F6F5; }
  .rx { margin-top: 4px; }
  .small { color: #5B6B5D; font-size: 8.5pt; }
  .item { border: 1px solid #DFE2DF; border-radius: 8px; padding: 8px 10px; margin-bottom: 7px; }
  .item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .sign { display: flex; flex-wrap: wrap; gap: 14px 18px; margin-top: 8px; }
  .sign div { width: calc(50% - 9px); border-bottom: 1px solid #5B6B5D; height: 34px; position: relative; }
  .sign span { position: absolute; bottom: -15px; left: 0; color: #5B6B5D; font-size: 8pt; }
  .review { padding-bottom: 22px; }
  .disclaimer { border: 1px solid #C62828; border-radius: 8px; padding: 8px 12px; font-size: 9pt; margin-bottom: 12px; }
  .disclaimer strong { color: #C62828; }
  .end { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 2px solid #2E7D32; padding-top: 8px; margin-top: 6px; color: #5B6B5D; font-size: 8.5pt; }
  .end .mark { display: flex; align-items: center; gap: 6px; }
  .end img { width: 22px; height: 22px; display: block; }
  .avoid { page-break-inside: avoid; break-inside: avoid; }
  /* The web PDF writer draws text in small fixed-height boxes too low; lift it. */
  .lp-pdf .pt { position: relative; top: -5px; }
  .lp-pdf .pill, .lp-pdf .num { position: relative; top: 5px; }
  [dir="rtl"] .tbl th, [dir="rtl"] .tbl td { text-align: right; }
`;

/* Print engines that support page margin boxes (Chromium, so Android and
   desktop browsers) stamp the footer and page number on every page. */
const PAGE_FOOTER = `
  @page {
    @bottom-left { content: "LivestockPro · by Agricoders · livestock.agricoders.com"; font-family: Calibri, Carlito, Arial, sans-serif; font-size: 8pt; color: #5B6B5D; }
    @bottom-right { content: counter(page) " / " counter(pages); direction: ltr; font-family: Calibri, Carlito, Arial, sans-serif; font-size: 8pt; color: #5B6B5D; }
  }
`;

export const REPORT_CONTACT = 'livestock.agricoders.com · agricoders@gmail.com';

/** Suggested download name, such as "LivestockPro-diagnosis-LP-001-2026-10-17.pdf". */
export function aiReportFileName({ kind, caseInfo, createdAt }) {
  const date = (createdAt ? new Date(createdAt) : new Date()).toISOString().slice(0, 10);
  const tag = caseInfo && caseInfo.tag_id ? `-${String(caseInfo.tag_id).replace(/[^\w.]+/g, '_')}` : '';
  return `LivestockPro-${kind}${tag}-${date}.pdf`;
}

/**
 * @param {{ kind: 'diagnosis'|'advisor'|'onehealth', report: object, title?: string,
 *   caseInfo?: object, reportId?: string, createdAt?: string, t: Function,
 *   lang?: string, mode?: 'print'|'pdf' }} opts
 */
export function aiReportHtml({ kind, report, title, caseInfo, reportId, createdAt, t, lang = 'en', mode = 'print' }) {
  const r = report || {};
  const body = kind === 'diagnosis' ? diagnosisBody(r, t, caseInfo) : kind === 'advisor' ? advisorBody(r, t) : briefBody(r, t);
  const heading = title || r.title || r.headline || t(`ai.reports.kinds.${kind}`);
  const date = (createdAt ? new Date(createdAt) : new Date()).toLocaleString(lang, { dateStyle: 'long', timeStyle: 'short' });
  const number = reportId ? `LP-${String(reportId).replace(/-/g, '').slice(0, 8).toUpperCase()}` : '';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(heading)}</title><style>${CSS}${mode === 'print' ? PAGE_FOOTER : ''}</style></head><body>
<div class="lp-doc${mode === 'pdf' ? ' lp-pdf' : ''}" dir="${dir}">
  <div class="band avoid">
    <div class="brand"><img class="app" src="${LIVESTOCKPRO_LOGO}" alt="LivestockPro"><div><div class="name">LivestockPro</div><div class="tag">${esc(t('brand.tagline'))}</div></div></div>
    <div class="maker"><div><div class="by">${esc(t('ai.pdf.by'))}</div><div class="co">Agricoders</div></div><div class="disc"><img src="${AGRICODERS_LOGO}" alt="Agricoders"></div></div>
  </div>
  <div class="doc-type">${esc(t(`ai.pdf.docType.${kind}`))}</div>
  <h1>${esc(heading)}</h1>
  <div class="meta">
    ${number ? `<span>${esc(t('ai.pdf.reportNo'))}: <strong>${esc(number)}</strong></span>` : ''}
    <span>${esc(t('ai.pdf.generated'))}: <strong>${esc(date)}</strong></span>
    <span>${esc(t('ai.pdf.preparedWith'))}</span>
  </div>
  ${body}
  <div class="end avoid"><span class="mark"><img src="${AGRICODERS_LOGO}" alt=""><span>${esc(t('brand.byline'))}</span></span><span>${esc(REPORT_CONTACT)}</span></div>
</div>
</body></html>`;
}
