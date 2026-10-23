import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../lib/toast.jsx';
import { exportDoc } from '../lib/exporters.js';
import { useAccount } from './AccountGate.jsx';
import { useApi } from '../lib/api.js';
import { buildRecordExport } from '../../../shared/recordExport.js';

const FORMATS = [
  { key: 'pdf', icon: 'fa-file-pdf' },
  { key: 'xlsx', icon: 'fa-file-excel' },
  { key: 'csv', icon: 'fa-file-csv' }
];

/* "Export" button with PDF, Excel and CSV. `build` returns the export
   document (shared/recordExport.js) for what the page shows right now. */
export default function ExportMenu({ build, disabled, label, primary }) {
  const { t, i18n } = useTranslation();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function run(format) {
    setOpen(false);
    setBusy(format);
    try {
      const doc = await build();
      if (!doc) return;
      await exportDoc(doc, format, t, i18n.language);
      showToast(t('exports.done', { format: t(`exports.formats.${format}`) }), 'success');
    } catch (e) {
      showToast(t('exports.failed', { message: e.message }), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-menu no-print" ref={ref}>
      <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`} disabled={disabled || Boolean(busy)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-file-export'}`}></i> {busy ? t('exports.preparing') : label || t('exports.export')} <i className="fas fa-chevron-down export-caret"></i>
      </button>
      <div className={`export-dropdown${open ? ' show' : ''}`} role="menu">
        {FORMATS.map((f) => (
          <button key={f.key} type="button" role="menuitem" className="export-option" onClick={() => run(f.key)}>
            <span className={`export-icon ${f.key}`}><i className={`fas ${f.icon}`}></i></span>
            <span><strong>{t(`exports.formats.${f.key}`)}</strong><small>{t(`exports.formatHints.${f.key}`)}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Export for a records page: the rows the page shows right now (after its
   search and filters), with the farm name and the user's Livestock ID. */
export function RecordExportMenu({ table, rows, filtersText }) {
  const { t } = useTranslation();
  const identity = useFarmIdentity();
  return (
    <ExportMenu
      disabled={!rows.length}
      build={() => buildRecordExport(table, rows, t, { filtersText, ...identity })}
    />
  );
}

/* Farm name (from the farm profile, else the sign-up request) and Livestock
   ID for export headers. The profile is read once every few minutes. */
let farmCache = { name: null, at: 0 };
export function useFarmIdentity() {
  const { account } = useAccount();
  const api = useApi();
  const [farm, setFarm] = useState(farmCache.name);
  useEffect(() => {
    if (farmCache.name !== null && Date.now() - farmCache.at < 5 * 60 * 1000) return;
    api.list('profiles').then(({ data }) => {
      farmCache = { name: (data && data[0] && data[0].farm_name) || '', at: Date.now() };
      setFarm(farmCache.name);
    });
  }, [api]);
  return {
    farmName: farm || (account && account.request ? account.request.farm_name : '') || '',
    livestockId: account ? account.livestockId || '' : ''
  };
}
