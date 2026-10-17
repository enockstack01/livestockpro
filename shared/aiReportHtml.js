/* Printable AI reports, shared by the web app (window.print, "Save as PDF")
   and the mobile app (expo-print). One self-contained HTML page in the
   Agricoders report template: Calibri, Forest headings, Leaf section rules,
   white on Forest pills, "LivestockPro · by Agricoders" footer, no gradients
   or accent stripes. */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const list = (items) => (items && items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
const section = (title, body) => (body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '');
const para = (text) => (text ? `<p>${esc(text)}</p>` : '');

const PILL = {
  emergency: 'pill-red', urgent: 'pill-red', soon: 'pill-amber', routine: 'pill-green',
  high: 'pill-red', medium: 'pill-amber', low: 'pill-green', none: 'pill-green',
  critical: 'pill-red', immediate: 'pill-red', this_week: 'pill-amber', monitor: 'pill-slate',
  today: 'pill-red', this_month: 'pill-slate'
};
const pill = (value, label) => `<span class="pill ${PILL[value] || 'pill-slate'}">${esc(label)}</span>`;

function diagnosisBody(r, t) {
  const tr = (k, o) => t(`ai.report.${k}`, o);
  const conditions = (r.likely_conditions || []).map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${pill(c.likelihood, tr(`likelihood.${c.likelihood}`))}</td><td>${esc(c.why)}</td></tr>`).join('');
  const meds = (r.medications || []).map((m) => `
    <div class="med">
      <div class="med-head"><strong>${esc(m.name)}</strong>${m.prescription_only ? ` ${pill('medium', tr('prescription'))}` : ''}</div>
      <table class="kv">
        <tr><th>${esc(tr('purpose'))}</th><td>${esc(m.purpose)}</td></tr>
        <tr><th>${esc(tr('howToGive'))}</th><td>${esc(m.how_to_give)}</td></tr>
        <tr><th>${esc(tr('dose'))}</th><td>${esc(m.dose_guidance)}</td></tr>
        <tr><th>${esc(tr('withdrawal'))}</th><td>${esc(m.withdrawal_period)}</td></tr>
      </table>
    </div>`).join('');
  const z = r.zoonotic || {};
  return [
    `<div class="badges">${pill(r.urgency, `${tr('urgency')}: ${tr(`urgencyLevels.${r.urgency}`)}`)} ${r.see_vet ? pill('urgent', tr('seeVet')) : pill('routine', tr('seeVetNo'))}</div>`,
    para(r.summary),
    r.see_vet_reason ? `<p class="note">${esc(r.see_vet_reason)}</p>` : '',
    section(tr('likely'), conditions ? `<table class="grid">${conditions}</table>` : ''),
    section(tr('cause'), para(r.cause)),
    section(tr('treatment'), r.treatment_steps && r.treatment_steps.length ? `<ol>${r.treatment_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''),
    section(tr('medications'), meds),
    section(tr('care'), list(r.supportive_care)),
    section(tr('isolation'), para(r.isolation_advice)),
    section(tr('zoonotic'), `<p>${pill(z.risk, tr(`zoonoticLevels.${z.risk || 'none'}`))} ${esc(z.precautions)}</p>${r.notifiable ? `<p class="note">${esc(tr('notifiable'))}</p>` : ''}`),
    section(tr('warning'), list(r.warning_signs)),
    section(tr('prevention'), list(r.prevention)),
    section(tr('questions'), list(r.questions_for_vet)),
    section(tr('gaps'), list(r.data_gaps))
  ].join('');
}

function advisorBody(r, t) {
  const ta = (k, o) => t(`ai.advisor.${k}`, o);
  const figures = (r.figures || []).map((f) => `<tr><th>${esc(f.label)}</th><td><strong>${esc(f.value)}</strong></td><td>${esc(f.comment)}</td></tr>`).join('');
  return [
    para(r.summary),
    section(ta('priorities'), (r.priorities || []).map((p) => `<div class="item"><div>${pill(p.when, ta(`when.${p.when}`))} <strong>${esc(p.title)}</strong></div><p>${esc(p.detail)}</p></div>`).join('')),
    section(ta('figures'), figures ? `<table class="grid">${figures}</table>` : ''),
    section(ta('strengths'), list(r.strengths)),
    section(ta('risks'), (r.risks || []).map((k) => `<div class="item"><div>${pill(k.severity, t(`ai.report.likelihood.${k.severity}`))} <strong>${esc(k.title)}</strong></div><p>${esc(k.detail)}</p></div>`).join(''))
  ].join('');
}

function briefBody(r, t) {
  const tb = (k, o) => t(`ai.brief.${k}`, o);
  return [
    para(r.situation),
    section(tb('actions'), (r.priority_actions || []).map((a) => `<div class="item"><div>${pill(a.urgency, tb(`urgency.${a.urgency}`))} <strong>${esc(a.action)}</strong></div><p>${esc(tb('who'))}: ${esc(a.who)} · ${esc(tb('why'))}: ${esc(a.why)}</p></div>`).join('')),
    section(tb('hotspots'), (r.hotspots || []).map((h) => `<div class="item"><div>${pill(h.severity, t(`ai.report.likelihood.${h.severity === 'critical' ? 'high' : h.severity}`))} <strong>${esc(h.district)}</strong></div><p>${esc(h.concern)}</p></div>`).join('')),
    section(tb('zoonotic'), para(r.zoonotic_notes)),
    section(tb('farmerMessage'), r.farmer_message ? `<p class="note">${esc(r.farmer_message)}</p>` : '')
  ].join('');
}

const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; color: #1C2B1E; font-size: 11.5pt; line-height: 1.45; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2E7D32; padding-bottom: 10px; margin-bottom: 16px; }
  .product { font-size: 18pt; font-weight: 700; color: #1B5E20; }
  .meta { color: #5B6B5D; font-size: 10pt; text-align: right; }
  h1 { color: #1B5E20; font-size: 17pt; margin: 0 0 8px; }
  h2 { color: #1B5E20; font-size: 12.5pt; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #DFE2DF; }
  p { margin: 4px 0 8px; }
  ul, ol { margin: 4px 0 8px; padding-left: 20px; }
  li { margin: 2px 0; }
  .pill { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 9.5pt; font-weight: 700; }
  .pill-green { background: #1B5E20; color: #FFFFFF; }
  .pill-amber { background: #F9A825; color: #1C2B1E; }
  .pill-red { background: #C62828; color: #FFFFFF; }
  .pill-slate { background: #5B6B5D; color: #FFFFFF; }
  .badges { margin: 4px 0 10px; }
  .note { background: #F5F6F5; border: 1px solid #DFE2DF; border-radius: 6px; padding: 8px 10px; }
  table { border-collapse: collapse; width: 100%; }
  table.grid td, table.grid th { border-bottom: 1px solid #DFE2DF; padding: 6px 6px; vertical-align: top; text-align: left; }
  table.kv th { width: 30%; color: #5B6B5D; font-weight: 400; text-align: left; padding: 3px 6px 3px 0; vertical-align: top; }
  table.kv td { padding: 3px 0; }
  .med { border: 1px solid #DFE2DF; border-radius: 6px; padding: 8px 10px; margin: 6px 0; page-break-inside: avoid; }
  .med-head { margin-bottom: 4px; }
  .item { margin: 6px 0 10px; page-break-inside: avoid; }
  .disclaimer { margin-top: 22px; border: 1px solid #C62828; border-radius: 6px; padding: 8px 10px; font-size: 10pt; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #DFE2DF; color: #5B6B5D; font-size: 9.5pt; display: flex; justify-content: space-between; }
`;

/**
 * @param {{ kind: 'diagnosis'|'advisor'|'onehealth', report: object, title?: string,
 *   subtitle?: string, createdAt?: string, t: Function, lang?: string }} opts
 */
export function aiReportHtml({ kind, report, title, subtitle, createdAt, t, lang = 'en' }) {
  const r = report || {};
  const body = kind === 'diagnosis' ? diagnosisBody(r, t) : kind === 'advisor' ? advisorBody(r, t) : briefBody(r, t);
  const heading = title || r.title || r.headline || t(`ai.reports.kinds.${kind}`);
  const date = createdAt ? new Date(createdAt).toLocaleString(lang) : new Date().toLocaleString(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(heading)}</title><style>${CSS}</style></head><body>
<header><div class="product">LivestockPro</div><div class="meta">${esc(t(`ai.reports.kinds.${kind}`))}<br>${esc(t('ai.report.generated', { date }))}</div></header>
<h1>${esc(heading)}</h1>
${subtitle ? `<p class="meta" style="text-align:left">${esc(subtitle)}</p>` : ''}
${body}
${kind === 'diagnosis' ? `<div class="disclaimer">${esc(t('ai.vetNotice'))}</div>` : ''}
<footer><span>${esc(t('brand.byline'))}</span><span>livestockpro.agricoders.com</span></footer>
</body></html>`;
}
