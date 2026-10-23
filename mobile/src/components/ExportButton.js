import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { Button, Modal } from '../ui/kit';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';
import { exportDoc } from '../lib/exportDoc';
import { useAccount } from '../account/AccountProvider';
import { useRepository } from '../db/repository';
import { buildRecordExport } from '../../../shared/recordExport';

const FORMATS = [
  { key: 'pdf', icon: 'file-pdf', bg: '#C62828', fg: '#FFFFFF' },
  { key: 'xlsx', icon: 'file-excel', bg: '#2E7D32', fg: '#FFFFFF' },
  { key: 'csv', icon: 'file-csv', bg: '#F9A825', fg: '#1C2B1E' }
];

/* "Export" with PDF, Excel and CSV (twin of the web's ExportMenu). `build`
   returns the export document for what the screen shows. */
export default function ExportButton({ build, disabled, label, variant = 'secondary' }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(format) {
    setOpen(false);
    setBusy(true);
    try {
      const doc = await build();
      if (!doc) return;
      const ok = await exportDoc(doc, format, t, i18n.language);
      if (!ok) showToast(t('reports.sharingUnavailable'), 'error');
    } catch (e) {
      showToast(t('exports.failed', { message: e.message }), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} icon="file-export" title={busy ? t('exports.preparing') : label || t('exports.export')} loading={busy} disabled={disabled || busy} onPress={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title={label || t('exports.export')} maxWidth={420}>
        {FORMATS.map((f) => (
          <Pressable key={f.key} onPress={() => run(f.key)} accessibilityRole="button" style={({ pressed }) => [styles.option, { borderColor: colors.border, backgroundColor: pressed ? colors.bg : 'transparent' }]}>
            <View style={[styles.icon, { backgroundColor: f.bg }]}><Icon name={f.icon} size={16} color={f.fg} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{t(`exports.formats.${f.key}`)}</Text>
              <Text style={[styles.hint, { color: colors.textLight }]}>{t(`exports.formatHints.${f.key}`)}</Text>
            </View>
          </Pressable>
        ))}
      </Modal>
    </>
  );
}

/* Farm name (farm profile, else the sign-up request) and Livestock ID. */
export function useFarmIdentity() {
  const { account } = useAccount();
  const repo = useRepository();
  const [farm, setFarm] = useState('');
  useEffect(() => {
    repo.list('profiles').then((rows) => setFarm((rows && rows[0] && rows[0].farm_name) || '')).catch(() => {});
  }, [repo]);
  return {
    farmName: farm || (account && account.request ? account.request.farm_name : '') || '',
    livestockId: account ? account.livestockId || '' : ''
  };
}

/* Export for a records screen: the rows it shows (after search and filters). */
export function RecordExportButton({ table, rows, filtersText }) {
  const { t } = useTranslation();
  const identity = useFarmIdentity();
  return <ExportButton disabled={!rows.length} build={() => buildRecordExport(table, rows, t, { filtersText, ...identity })} />;
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 2 }
});
