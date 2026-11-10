import { useTranslation } from 'react-i18next';
import { useRepository } from '../db/repository';
import { useAccount } from '../account/AccountProvider';
import ExportButton, { useFarmIdentity } from '../components/ExportButton';
import { Card, CardBody, CardHeader, Muted } from '../ui/kit';
import { buildAllDataExport, DATA_TABLES } from '../../../shared/dataExport';

/* Settings: download everything the user has recorded, whenever they want.
   Read from the phone's own database, so it works with no internet and
   includes records not synced yet. */
export default function MyDataCard() {
  const { t } = useTranslation();
  const repo = useRepository();
  const { account } = useAccount();
  const identity = useFarmIdentity();

  async function build() {
    const data = {};
    for (const table of ['profiles', ...DATA_TABLES]) data[table] = await repo.list(table, { order: 'created_at ASC' });
    return buildAllDataExport(data, t, { ...identity, account });
  }

  return (
    <Card>
      <CardHeader title={t('settings.myData')} icon="download" />
      <CardBody>
        <Muted style={{ marginBottom: 14 }}>{t('settings.myDataHelp')}</Muted>
        <ExportButton variant="primary" label={t('settings.downloadMyData')} formats={['xlsx', 'csv', 'pdf', 'json']} build={build} />
      </CardBody>
    </Card>
  );
}
