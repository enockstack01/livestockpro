import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal.jsx';
import { useApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { AiNotConfigured, AiUsageMeter, AiWorking, SavedReport, aiErrorText, useAiStatus } from './AiViews.jsx';

/* "Diagnose with AI" on a health record: the farmer adds what they see, the
   server reads the animal's records and writes a diagnosis and treatment
   report, saved against the record so it can be reopened and printed. */
export default function DiagnoseModal({ record, onClose }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const showToast = useToast();
  const configured = useAiStatus();
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [earlier, setEarlier] = useState([]);

  useEffect(() => {
    if (!record) return;
    setSaved(null);
    setSymptoms([record.disease, record.notes].filter(Boolean).join('. '));
    api.aiReports({ kind: 'diagnosis', record_id: record.id, limit: 5 }).then(({ data }) => setEarlier(data || []));
  }, [record, api]);

  async function run() {
    setBusy(true);
    const { data, error } = await api.aiDiagnose({ health_record_id: record.id, symptoms, language: i18n.language });
    setBusy(false);
    if (error) { showToast(aiErrorText(t, error, i18n.language), 'error'); return; }
    setSaved(data);
    setEarlier((list) => [data, ...list]);
  }

  async function remove(r) {
    await api.aiDeleteReport(r.id);
    setEarlier((list) => list.filter((x) => x.id !== r.id));
    if (saved && saved.id === r.id) setSaved(null);
  }

  const subtitle = record ? `${t('ai.report.animal')}: ${record.tag_id || ''}` : '';

  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      maxWidth="820px"
      title={<><i className="fas fa-wand-magic-sparkles" style={{ marginRight: 8 }}></i>{t('ai.diagnose.title')}{record && record.tag_id ? ` · ${record.tag_id}` : ''}</>}
      footer={saved ? (
        <button className="btn btn-secondary" onClick={() => setSaved(null)}><i className="fas fa-rotate"></i> {t('ai.diagnose.again')}</button>
      ) : (
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={run} disabled={busy || configured === false || !symptoms.trim()}>
            <i className="fas fa-wand-magic-sparkles"></i> {t('ai.diagnose.run')}
          </button>
        </>
      )}
    >
      {configured === false ? <AiNotConfigured /> : null}
      {saved ? (
        <SavedReport saved={saved} subtitle={subtitle} onDelete={remove} />
      ) : busy ? (
        <AiWorking label={t('ai.diagnose.working')} />
      ) : (
        <>
          <p className="ai-muted" style={{ marginBottom: 14 }}>{t('ai.diagnose.intro')}</p>
          <div className="form-group">
            <label>{t('ai.diagnose.symptoms')}</label>
            <textarea className="form-control" rows={4} value={symptoms} placeholder={t('ai.diagnose.symptomsHint')} onChange={(e) => setSymptoms(e.target.value)} />
          </div>
          <p className="ai-disclaimer"><i className="fas fa-user-doctor"></i> {t('ai.vetNotice')}</p>
          {configured ? <div className="ai-usage-row"><AiUsageMeter kind="diagnose" /></div> : null}
          {earlier.length ? (
            <div className="ai-earlier">
              <h4>{t('ai.diagnose.previous')}</h4>
              {earlier.map((r) => (
                <button key={r.id} type="button" className="ai-earlier-row" onClick={() => setSaved(r)}>
                  <i className="fas fa-file-medical"></i><span>{r.title}</span><small>{new Date(r.created_at).toLocaleDateString(i18n.language)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
