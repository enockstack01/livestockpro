import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { AiNotConfigured, AiUsageMeter, AiWorking, SavedReport, aiErrorText, useAiStatus } from '../components/ai/AiViews.jsx';
import PhotoPicker, { usePhotos } from '../components/ai/PhotoPicker.jsx';

const TABS = [
  { key: 'ask', icon: 'comments' },
  { key: 'advisor', icon: 'seedling' },
  { key: 'diagnose', icon: 'stethoscope' },
  { key: 'reports', icon: 'folder-open' }
];

/* LivestockPro AI: Ask LivestockPro (answers from the farm's own records),
   the farm advisor, AI diagnosis for any animal, and every saved report. */
export default function Assistant() {
  const { t } = useTranslation();
  const configured = useAiStatus();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'ask';

  return (
    <>
      <div className="page-header">
        <div>
          <h1><span className="ai-title-icon"><i className="fas fa-wand-magic-sparkles"></i></span> {t('ai.title')}</h1>
          <p>{t('ai.subtitle')}</p>
        </div>
        {configured ? <AiUsageMeter /> : null}
      </div>
      {configured === false ? <AiNotConfigured /> : null}
      <div className="tabs">
        {TABS.map((x) => (
          <button key={x.key} className={`tab-btn${tab === x.key ? ' active' : ''}`} onClick={() => setParams({ tab: x.key })}>
            <i className={`fas fa-${x.icon}`}></i> {t(`ai.tabs.${x.key}`)}
          </button>
        ))}
      </div>
      {tab === 'ask' ? <AskTab disabled={configured === false} /> : null}
      {tab === 'advisor' ? <AdvisorTab disabled={configured === false} /> : null}
      {tab === 'diagnose' ? <DiagnoseTab disabled={configured === false} /> : null}
      {tab === 'reports' ? <ReportsTab /> : null}
      <p className="ai-powered">{t('ai.poweredBy')}</p>
    </>
  );
}

function AskTab({ disabled }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const photos = usePhotos();
  const examples = t('ai.ask.examples', { returnObjects: true });

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  /* A photo can go with a question, or on its own (then a standard question
     about what it shows is asked). Only the latest question carries photos. */
  async function send(text) {
    const withPhotos = photos.photos.length > 0;
    const q = (text || draft).trim() || (withPhotos ? t('ai.photo.defaultQuestion') : '');
    if (!q || busy) return;
    const extra = withPhotos ? photos.payload() : {};
    const next = [...messages, { role: 'user', content: q, thumbs: withPhotos ? photos.photos.map((p) => p.thumb) : undefined }];
    setMessages(next);
    setDraft('');
    photos.clear();
    setError(null);
    setBusy(true);
    const { data, error: err } = await api.aiChat({ messages: next.map(({ role, content }) => ({ role, content })), language: i18n.language, images: extra.images });
    setBusy(false);
    if (err) { setError(aiErrorText(t, err, i18n.language)); return; }
    setMessages([...next, { role: 'assistant', content: data.reply }]);
  }

  return (
    <div className="card ai-chat">
      <div className="ai-chat-log">
        {messages.length === 0 ? (
          <div className="ai-chat-empty">
            <span className="ai-spark ai-spark-lg"><i className="fas fa-comments"></i></span>
            <p>{t('ai.ask.empty')}</p>
            <div className="ai-examples">
              {(Array.isArray(examples) ? examples : []).map((ex) => (
                <button key={ex} type="button" className="ai-example" disabled={disabled} onClick={() => send(ex)}>{ex}</button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <span className="ai-msg-who">{m.role === 'user' ? t('ai.ask.you') : t('ai.ask.assistant')}</span>
            {m.thumbs ? <div className="ai-msg-photos">{m.thumbs.map((src, j) => <img key={j} src={src} alt={t('ai.photo.alt', { n: j + 1 })} />)}</div> : null}
            <div className="ai-msg-text">{m.content}</div>
          </div>
        ))}
        {busy ? <AiWorking /> : null}
        {error ? <div className="ai-notice ai-notice-error"><i className="fas fa-triangle-exclamation"></i><span>{error}</span></div> : null}
        <div ref={endRef} />
      </div>
      <form className="ai-chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          className="form-control"
          rows={2}
          value={draft}
          placeholder={t('ai.ask.placeholder')}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <PhotoPicker state={photos} disabled={disabled || busy} compact />
        <div className="ai-chat-actions">
          {messages.length ? <button type="button" className="btn btn-secondary" onClick={() => { setMessages([]); setError(null); }}><i className="fas fa-plus"></i> {t('ai.ask.clear')}</button> : null}
          <button type="submit" className="btn btn-primary" disabled={disabled || busy || (!draft.trim() && !photos.photos.length)}><i className="fas fa-paper-plane"></i> {t('ai.ask.send')}</button>
        </div>
      </form>
    </div>
  );
}

/* Latest saved advice, or a button to ask for it; also used on the dashboard. */
export function AdvisorTab({ disabled, compact }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const configured = useAiStatus();
  const showToast = useToast();
  const [saved, setSaved] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.aiReports({ kind: 'advisor', limit: 1 }).then(({ data }) => setSaved((data && data[0]) || null));
  }, [api]);

  async function run() {
    setBusy(true);
    const { data, error } = await api.aiAdvisor({ language: i18n.language });
    setBusy(false);
    if (error) { showToast(aiErrorText(t, error, i18n.language), 'error'); return; }
    setSaved(data);
  }

  async function remove(r) {
    await api.aiDeleteReport(r.id);
    setSaved(null);
  }

  if (compact && configured === false) return null;

  return (
    <div className={`card${compact ? ' ai-advisor-card' : ''}`}>
      <div className="card-header">
        <h3><i className="fas fa-seedling"></i> {t('ai.advisor.title')}</h3>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={disabled || busy}>
          <i className={`fas fa-${busy ? 'spinner fa-spin' : 'wand-magic-sparkles'}`}></i> {saved ? t('ai.advisor.refresh') : t('ai.advisor.run')}
        </button>
      </div>
      <div className="card-body">
        {busy ? <AiWorking label={t('ai.advisor.working')} /> : saved && compact ? (
          <AdvisorDigest saved={saved} />
        ) : saved ? (
          <SavedReport saved={saved} onDelete={remove} />
        ) : saved === null ? (
          <p className="ai-muted">{t('ai.advisor.intro')}</p>
        ) : null}
      </div>
    </div>
  );
}

/* Dashboard version: the headline, summary and the first three priorities. */
function AdvisorDigest({ saved }) {
  const { t, i18n } = useTranslation();
  const r = saved.report || {};
  return (
    <div className="ai-digest">
      <h4>{saved.title}</h4>
      <p>{r.summary}</p>
      <ol className="ai-digest-list">
        {(r.priorities || []).slice(0, 3).map((p, i) => (
          <li key={i}><strong>{p.title}</strong> <span className="ai-muted">· {t(`ai.advisor.when.${p.when}`)}</span><br /><span>{p.detail}</span></li>
        ))}
      </ol>
      <div className="ai-digest-foot">
        <span className="ai-muted">{t('ai.report.generated', { date: new Date(saved.created_at).toLocaleString(i18n.language) })}</span>
        <Link to="/assistant?tab=advisor">{t('ai.advisor.openFull')} <i className="fas fa-arrow-right"></i></Link>
      </div>
    </div>
  );
}

function DiagnoseTab({ disabled }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const [animals, setAnimals] = useState([]);
  const [animalId, setAnimalId] = useState('');
  const [species, setSpecies] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const photos = usePhotos();

  useEffect(() => {
    api.list('animals', { order: 'tag_id.asc' }).then(({ data }) => setAnimals(data || []));
  }, [api]);

  const animal = animals.find((a) => a.id === animalId);

  async function run() {
    if (!symptoms.trim() && !photos.photos.length) { showToast(t('ai.diagnose.needInput'), 'error'); return; }
    setBusy(true);
    const { data, error } = await api.aiDiagnose({ animal_id: animalId || undefined, species: animal ? undefined : species || undefined, symptoms, language: i18n.language, ...photos.payload() });
    setBusy(false);
    if (error) { showToast(aiErrorText(t, error, i18n.language), 'error'); return; }
    photos.clear();
    setSaved(data);
  }

  if (saved) {
    return (
      <div className="card"><div className="card-body">
        <SavedReport saved={saved} subtitle={animal ? `${t('ai.report.animal')}: ${animal.tag_id}` : ''} />
        <button className="btn btn-secondary mt-16" onClick={() => setSaved(null)}><i className="fas fa-rotate"></i> {t('ai.diagnose.again')}</button>
      </div></div>
    );
  }

  return (
    <div className="card">
      <div className="card-header"><h3><i className="fas fa-stethoscope"></i> {t('ai.diagnose.title')}</h3></div>
      <div className="card-body">
        {busy ? <AiWorking label={t('ai.diagnose.working')} /> : (
          <>
            <p className="ai-muted" style={{ marginBottom: 14 }}>{t('ai.diagnose.intro')}</p>
            <div className="form-row">
              <div className="form-group">
                <label>{t('ai.diagnose.animal')}</label>
                <select className="form-control" value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
                  <option value="">{t('ai.diagnose.chooseAnimal')}</option>
                  {animals.map((a) => <option key={a.id} value={a.id}>{a.tag_id}{a.name ? ` · ${a.name}` : ''}{a.species ? ` · ${t(`enums.species.${a.species}`, a.species)}` : ''}</option>)}
                </select>
              </div>
              {!animal ? (
                <div className="form-group">
                  <label>{t('ai.diagnose.species')}</label>
                  <input className="form-control" value={species} onChange={(e) => setSpecies(e.target.value)} placeholder={t('ai.diagnose.speciesHint')} />
                </div>
              ) : null}
            </div>
            <div className="form-group">
              <label>{t('ai.diagnose.symptoms')}</label>
              <textarea className="form-control" rows={5} value={symptoms} placeholder={t('ai.diagnose.symptomsHint')} onChange={(e) => setSymptoms(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('ai.photo.label')}</label>
              <PhotoPicker state={photos} disabled={disabled} />
            </div>
            <p className="ai-disclaimer"><i className="fas fa-user-doctor"></i> {t('ai.vetNotice')}</p>
            <button className="btn btn-primary mt-16" onClick={run} disabled={disabled || (!symptoms.trim() && !photos.photos.length)}><i className="fas fa-wand-magic-sparkles"></i> {t('ai.diagnose.run')}</button>
          </>
        )}
      </div>
    </div>
  );
}

function ReportsTab() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.aiReports({ limit: 60 }).then(({ data }) => setList(data || []));
  }, [api]);

  async function remove(r) {
    await api.aiDeleteReport(r.id);
    setList((l) => l.filter((x) => x.id !== r.id));
    setOpen(null);
  }

  if (open) {
    return (
      <div className="card"><div className="card-body">
        <button className="btn btn-secondary btn-sm mb-16" onClick={() => setOpen(null)}><i className="fas fa-arrow-left"></i> {t('ai.back')}</button>
        <SavedReport saved={open} subtitle={open.input && open.input.tag_id ? `${t('ai.report.animal')}: ${open.input.tag_id}` : ''} onDelete={remove} />
      </div></div>
    );
  }

  const ICON = { diagnosis: 'file-medical', advisor: 'seedling', onehealth: 'shield-virus' };
  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        {list === null ? <AiWorking label={t('common.loading')} /> : list.length === 0 ? (
          <div className="empty-state"><i className="fas fa-folder-open"></i><h3>{t('ai.reports.empty')}</h3></div>
        ) : list.map((r) => (
          <button key={r.id} type="button" className="ai-report-row" onClick={() => setOpen(r)}>
            <span className="ai-section-icon"><i className={`fas fa-${ICON[r.kind] || 'file'}`}></i></span>
            <span className="ai-report-row-text"><strong>{r.title}</strong><small>{t(`ai.reports.kinds.${r.kind}`)}{r.input && r.input.tag_id ? ` · ${r.input.tag_id}` : ''} · {new Date(r.created_at).toLocaleString(i18n.language)}</small></span>
            <i className="fas fa-chevron-right"></i>
          </button>
        ))}
      </div>
    </div>
  );
}
