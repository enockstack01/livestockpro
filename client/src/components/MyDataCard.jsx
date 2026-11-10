import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useAccount } from './AccountGate.jsx';
import ExportMenu, { useFarmIdentity } from './ExportMenu.jsx';
import { buildAllDataExport, DATA_TABLES } from '../../../shared/dataExport.js';

/* Settings: download everything the user has recorded, whenever they want. */
export default function MyDataCard() {
  const { t } = useTranslation();
  const api = useApi();
  const { account } = useAccount();
  const identity = useFarmIdentity();

  async function build() {
    const data = {};
    for (const table of ['profiles', ...DATA_TABLES]) {
      const res = await api.list(table, { order: 'created_at.asc' });
      if (res.error) throw new Error(res.error.message);
      data[table] = res.data || [];
    }
    return buildAllDataExport(data, t, { ...identity, account });
  }

  return (
    <div className="card mt-24">
      <div className="card-header"><h3><i className="fas fa-download" style={{ color: 'var(--blue)', marginRight: 6 }}></i> {t('settings.myData')}</h3></div>
      <div className="card-body">
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{t('settings.myDataHelp')}</p>
        <ExportMenu primary label={t('settings.downloadMyData')} formats={['xlsx', 'csv', 'pdf', 'json']} build={build} />
      </div>
    </div>
  );
}
