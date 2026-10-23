import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { aiReportFileName, aiReportHtml } from '../../../../shared/aiReportHtml.js';
import { aiResetTime, getAiUsage, subscribeAiUsage } from '../../../../shared/aiUsage';

/* Whether the server has an Anthropic API key. null while loading. */
export function useAiStatus() {
  const api = useApi();
  const [configured, setConfigured] = useState(null);
  useEffect(() => {
    let live = true;
    api.aiStatus().then(({ data }) => { if (live) setConfigured(Boolean(data && data.configured)); });
    return () => { live = false; };
  }, [api]);
  return configured;
}

/* Today's AI allowance; loads it once and follows every AI answer. */
export function useAiUsage() {
  const api = useApi();
  const [usage, setUsage] = useState(getAiUsage());
  useEffect(() => {
    const off = subscribeAiUsage(setUsage);
    api.aiUsage();
    return off;
  }, [api]);
  return usage;
}

/* "12 of 50 AI requests left today" with a small meter. */
export function AiUsageMeter({ kind }) {
  const { t, i18n } = useTranslation();
  const usage = useAiUsage();
  if (!usage) return null;
  const part = kind && usage.kinds && usage.kinds[kind];
  const remaining = part ? Math.min(part.remaining, usage.remaining) : usage.remaining;
  const limit = part ? part.limit : usage.limit;
  const pct = limit ? Math.round((remaining / limit) * 100) : 0;
  const tone = remaining === 0 ? 'red' : pct <= 20 ? 'amber' : 'leaf';
  return (
    <div className="ai-usage" title={t('ai.usage.resets', { time: aiResetTime(usage, i18n.language) })}>
      <span className="ai-usage-text">{t(part ? 'ai.usage.leftKind' : 'ai.usage.left', { remaining, limit, kind: part ? t(`ai.usage.kinds.${kind}`) : '' })}</span>
      <span className="ai-usage-bar"><span className={tone} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

/* The message to show for a failed AI call. */
export function aiErrorText(t, error, lang) {
  if (!error) return '';
  if (error.code === 'AI_NOT_CONFIGURED') return t('ai.notConfigured');
  if (error.code === 'AI_QUOTA') {
    const time = aiResetTime(error.usage, lang);
    return error.kind && error.kind !== 'total'
      ? t('ai.errors.quotaKind', { kind: t(`ai.usage.kinds.${error.kind}`), time })
      : t('ai.errors.quota', { time });
  }
  if (error.code === 'AI_BURST') return t('ai.errors.burst');
  if (error.code === 'AI_LIMIT' || error.code === 'AI_BUSY') return t('ai.errors.busy');
  return t('ai.errors.failed', { message: error.message });
}

export function AiNotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="ai-notice"><i className="fas fa-circle-info"></i><span>{t('ai.notConfigured')}</span></div>
  );
}

export function AiWorking({ label }) {
  const { t } = useTranslation();
  return (
    <div className="ai-working"><span className="ai-spark"><i className="fas fa-wand-magic-sparkles"></i></span><span>{label || t('ai.working')}</span><i className="fas fa-spinner fa-spin"></i></div>
  );
}

/* The report options every output shares, from a saved report. */
function reportOpts(saved, t, lang) {
  const caseInfo = saved.input && (saved.input.case || saved.input.photos) ? { ...(saved.input.case || {}), photos: saved.input.photos } : undefined;
  return { kind: saved.kind, report: saved.report, title: saved.title, caseInfo, reportId: saved.id, createdAt: saved.created_at, t, lang };
}

/* Opens the branded report in its own window and the browser's print dialog. */
export function printAiReport(saved, t, lang) {
  const html = aiReportHtml(reportOpts(saved, t, lang));
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}

/* Builds the branded report as an A4 PDF file and downloads it: the page is
   drawn off screen, split into pages that keep sections and table rows
   whole, and each page gets the LivestockPro · Agricoders footer and its
   page number. */
export async function downloadAiReport(saved, t, lang) {
  const { default: html2pdf } = await import('html2pdf.js');
  const opts = reportOpts(saved, t, lang);
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-12000px;top:0;width:182mm;background:#FFFFFF;';
  holder.innerHTML = aiReportHtml({ ...opts, mode: 'pdf' });
  document.body.appendChild(holder);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const worker = html2pdf().set({
      margin: [14, 14, 18, 14],
      filename: aiReportFileName(opts),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#FFFFFF', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid', 'tr', '.li', 'p', '.kv', '.sec h2'] }
    }).from(holder.querySelector('.lp-doc')).toPdf();
    const pdf = await worker.get('pdf');
    const pages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(223, 226, 223);
      pdf.line(14, 284, 196, 284);
      pdf.setFontSize(8);
      pdf.setTextColor(91, 107, 93);
      pdf.text('LivestockPro · by Agricoders · livestock.agricoders.com', 14, 289);
      pdf.text(`${i} / ${pages}`, 196, 289, { align: 'right' });
    }
    await worker.save();
  } finally {
    holder.remove();
  }
}

const TONE = {
  emergency: 'red', urgent: 'red', soon: 'orange', routine: 'green',
  high: 'red', medium: 'orange', low: 'green', none: 'green', critical: 'red',
  immediate: 'red', this_week: 'orange', monitor: 'gray', today: 'red', this_month: 'gray'
};
function Pill({ value, children }) {
  return <span className={`badge badge-${TONE[value] || 'gray'}`}>{children}</span>;
}

function Section({ icon, title, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null;
  return (
    <section className="ai-section">
      <h4><span className="ai-section-icon"><i className={`fas fa-${icon}`}></i></span>{title}</h4>
      {children}
    </section>
  );
}

const Bullets = ({ items }) => (items && items.length ? <ul className="ai-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null);

export function DiagnosisView({ report: r, photos }) {
  const { t } = useTranslation();
  const tr = (k, o) => t(`ai.report.${k}`, o);
  const z = r.zoonotic || {};
  return (
    <div className="ai-report">
      {(photos && photos.length) || r.photo_findings ? (
        <div className="ai-photo-findings">
          <h4><i className="fas fa-camera"></i> {t('ai.pdf.photos')}</h4>
          {photos && photos.length ? <div className="ai-photo-strip">{photos.map((src, i) => <div className="ai-photo-thumb" key={i}><img src={src} alt={t('ai.photo.alt', { n: i + 1 })} /></div>)}</div> : null}
          {r.photo_findings ? <p>{r.photo_findings}</p> : null}
        </div>
      ) : null}
      <div className="ai-badges">
        <Pill value={r.urgency}>{tr('urgency')}: {tr(`urgencyLevels.${r.urgency}`)}</Pill>
        {r.see_vet ? <Pill value="urgent"><i className="fas fa-user-doctor"></i> {tr('seeVet')}</Pill> : <Pill value="routine">{tr('seeVetNo')}</Pill>}
        {z.risk && z.risk !== 'none' ? <Pill value={z.risk}><i className="fas fa-people-arrows"></i> {tr('zoonotic')}: {tr(`zoonoticLevels.${z.risk}`)}</Pill> : null}
      </div>
      <p className="ai-summary">{r.summary}</p>
      {r.see_vet_reason ? <p className="ai-note">{r.see_vet_reason}</p> : null}

      <Section icon="list-ol" title={tr('likely')}>
        {(r.likely_conditions || []).length ? (
          <div className="ai-conditions">
            {r.likely_conditions.map((c, i) => (
              <div key={i} className="ai-condition">
                <div className="ai-condition-head"><strong>{c.name}</strong><Pill value={c.likelihood}>{tr(`likelihood.${c.likelihood}`)}</Pill></div>
                <p>{c.why}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Section>
      <Section icon="magnifying-glass" title={tr('cause')}>{r.cause ? <p>{r.cause}</p> : null}</Section>
      <Section icon="list-check" title={tr('treatment')}>
        {(r.treatment_steps || []).length ? <ol className="ai-list">{r.treatment_steps.map((s, i) => <li key={i}>{s}</li>)}</ol> : null}
      </Section>
      <Section icon="pills" title={tr('medications')}>
        {(r.medications || []).length ? r.medications.map((m, i) => (
          <div key={i} className="ai-med">
            <div className="ai-condition-head"><strong>{m.name}</strong>{m.prescription_only ? <Pill value="medium">{tr('prescription')}</Pill> : null}</div>
            <dl>
              <dt>{tr('purpose')}</dt><dd>{m.purpose}</dd>
              <dt>{tr('howToGive')}</dt><dd>{m.how_to_give}</dd>
              <dt>{tr('dose')}</dt><dd>{m.dose_guidance}</dd>
              <dt>{tr('withdrawal')}</dt><dd>{m.withdrawal_period}</dd>
            </dl>
          </div>
        )) : null}
      </Section>
      <Section icon="hand-holding-medical" title={tr('care')}><Bullets items={r.supportive_care} /></Section>
      <Section icon="house-medical-flag" title={tr('isolation')}>{r.isolation_advice ? <p>{r.isolation_advice}</p> : null}</Section>
      <Section icon="people-arrows" title={tr('zoonotic')}>
        <p><Pill value={z.risk}>{tr(`zoonoticLevels.${z.risk || 'none'}`)}</Pill> {z.precautions}</p>
        {r.notifiable ? <p className="ai-note">{tr('notifiable')}</p> : null}
      </Section>
      <Section icon="triangle-exclamation" title={tr('warning')}><Bullets items={r.warning_signs} /></Section>
      <Section icon="shield-heart" title={tr('prevention')}><Bullets items={r.prevention} /></Section>
      <Section icon="user-doctor" title={tr('questions')}><Bullets items={r.questions_for_vet} /></Section>
      <Section icon="circle-question" title={tr('gaps')}><Bullets items={r.data_gaps} /></Section>
      <p className="ai-disclaimer"><i className="fas fa-user-doctor"></i> {t('ai.vetNotice')}</p>
    </div>
  );
}

export function AdvisorView({ report: r }) {
  const { t } = useTranslation();
  const ta = (k, o) => t(`ai.advisor.${k}`, o);
  return (
    <div className="ai-report">
      <p className="ai-summary">{r.summary}</p>
      {(r.figures || []).length ? (
        <div className="ai-figures">
          {r.figures.map((f, i) => (
            <div key={i} className="ai-figure"><span>{f.label}</span><strong>{f.value}</strong><small>{f.comment}</small></div>
          ))}
        </div>
      ) : null}
      <Section icon="list-check" title={ta('priorities')}>
        {(r.priorities || []).map((p, i) => (
          <div key={i} className="ai-item"><div className="ai-condition-head"><strong>{p.title}</strong><Pill value={p.when}>{ta(`when.${p.when}`)}</Pill></div><p>{p.detail}</p></div>
        ))}
      </Section>
      <Section icon="thumbs-up" title={ta('strengths')}><Bullets items={r.strengths} /></Section>
      <Section icon="triangle-exclamation" title={ta('risks')}>
        {(r.risks || []).map((k, i) => (
          <div key={i} className="ai-item"><div className="ai-condition-head"><strong>{k.title}</strong><Pill value={k.severity}>{t(`ai.report.likelihood.${k.severity}`)}</Pill></div><p>{k.detail}</p></div>
        ))}
      </Section>
    </div>
  );
}

const SEVERITY_LABEL_KEY = { critical: 'enums.animalHealthStatus.Critical', high: 'enums.taskPriority.High', medium: 'enums.taskPriority.Medium', low: 'enums.taskPriority.Low' };

export function BriefView({ report: r }) {
  const { t } = useTranslation();
  const tb = (k, o) => t(`ai.brief.${k}`, o);
  const [copied, setCopied] = useState(false);
  return (
    <div className="ai-report">
      <p className="ai-summary">{r.situation}</p>
      <Section icon="list-check" title={tb('actions')}>
        {(r.priority_actions || []).map((a, i) => (
          <div key={i} className="ai-item"><div className="ai-condition-head"><strong>{a.action}</strong><Pill value={a.urgency}>{tb(`urgency.${a.urgency}`)}</Pill></div><p>{tb('who')}: {a.who} · {tb('why')}: {a.why}</p></div>
        ))}
      </Section>
      <Section icon="location-dot" title={tb('hotspots')}>
        {(r.hotspots || []).map((h, i) => (
          <div key={i} className="ai-item"><div className="ai-condition-head"><strong>{h.district}</strong><Pill value={h.severity}>{t(SEVERITY_LABEL_KEY[h.severity] || 'enums.taskPriority.Low')}</Pill></div><p>{h.concern}</p></div>
        ))}
      </Section>
      <Section icon="people-arrows" title={tb('zoonotic')}>{r.zoonotic_notes ? <p>{r.zoonotic_notes}</p> : null}</Section>
      <Section icon="bullhorn" title={tb('farmerMessage')}>
        {r.farmer_message ? (
          <>
            <p className="ai-note">{r.farmer_message}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(r.farmer_message); setCopied(true); }}>
              <i className={`fas fa-${copied ? 'check' : 'copy'}`}></i> {copied ? tb('copied') : tb('copy')}
            </button>
          </>
        ) : null}
      </Section>
    </div>
  );
}

/* A saved report with its title, date and actions. */
export function SavedReport({ saved, subtitle, onDelete }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try { await downloadAiReport(saved, t, i18n.language); } catch (e) { showToast(t('ai.errors.failed', { message: e.message }), 'error'); }
    setDownloading(false);
  }
  const View = saved.kind === 'diagnosis' ? DiagnosisView : saved.kind === 'advisor' ? AdvisorView : BriefView;
  return (
    <div className="ai-saved">
      <div className="ai-saved-head">
        <div>
          <h3>{saved.title}</h3>
          <p className="ai-muted">{subtitle ? `${subtitle} · ` : ''}{t('ai.report.generated', { date: new Date(saved.created_at).toLocaleString(i18n.language) })}</p>
        </div>
        <div className="ai-saved-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={download} disabled={downloading}>
            <i className={`fas fa-${downloading ? 'spinner fa-spin' : 'file-arrow-down'}`}></i> {downloading ? t('ai.report.downloading') : t('ai.report.download')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printAiReport(saved, t, i18n.language)}>
            <i className="fas fa-print"></i> {t('ai.report.print')}
          </button>
          {onDelete ? <button type="button" className="btn-icon danger" title={t('ai.report.delete')} onClick={() => onDelete(saved)}><i className="fas fa-trash"></i></button> : null}
        </div>
      </div>
      <View report={saved.report} photos={saved.input && saved.input.photos} />
    </div>
  );
}

/* One Health page: an AI situation briefing over the live alerts (admins). */
export function OneHealthBriefCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const configured = useAiStatus();
  const [saved, setSaved] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.aiReports({ kind: 'onehealth', limit: 1 }).then(({ data }) => setSaved((data && data[0]) || null));
  }, [api]);

  async function run() {
    setBusy(true);
    setError('');
    const { data, error: err } = await api.aiOneHealthBrief({ language: i18n.language });
    setBusy(false);
    if (err) { setError(aiErrorText(t, err, i18n.language)); return; }
    setSaved(data);
  }

  if (configured === false) return null;
  return (
    <div className="card mb-24">
      <div className="card-header">
        <h3><i className="fas fa-wand-magic-sparkles"></i> {t('ai.brief.title')}</h3>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          <i className={`fas fa-${busy ? 'spinner fa-spin' : 'wand-magic-sparkles'}`}></i> {saved ? t('ai.brief.refresh') : t('ai.brief.run')}
        </button>
      </div>
      <div className="card-body">
        <div className="ai-usage-row" style={{ marginTop: 0, marginBottom: 12 }}><AiUsageMeter kind="brief" /></div>
        {error ? <div className="ai-notice ai-notice-error"><i className="fas fa-triangle-exclamation"></i><span>{error}</span></div> : null}
        {busy ? <AiWorking label={t('ai.brief.working')} /> : saved ? <SavedReport saved={saved} /> : saved === null ? <p className="ai-muted">{t('ai.brief.intro')}</p> : null}
      </div>
    </div>
  );
}
