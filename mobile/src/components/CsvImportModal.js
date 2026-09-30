import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';
import { useRepository } from '../db/repository';
import { Modal, Muted } from '../ui/kit';
import { animalsFromCsv } from '../../../shared/csv';

/* "Import Animals from CSV" — the web Animals page's import dialog: the same
   instructions and dashed drop zone, which here opens the phone's file
   picker (Files / Drive / Downloads). Parsing and the required-field rules
   come from shared/csv.js, so a file the web accepts imports identically
   here. Rows are written to the local database and sync like any other
   new record. */
export default function CsvImportModal({ open, onClose, onImported }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToast();
  const repo = useRepository();
  const [busy, setBusy] = useState(false);

  async function pickAndImport() {
    // '*/*' rather than a CSV MIME list: Android file providers label .csv
    // files inconsistently (text/csv, text/comma-separated-values,
    // application/octet-stream…), so filter on the file name instead.
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!/\.csv$/i.test(asset.name || '')) { showToast(t('animalsPage.csvOnly'), 'error'); return; }

    setBusy(true);
    try {
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const { total, records, skipped } = animalsFromCsv(text);
      if (total === 0) { showToast(t('animalsPage.csvEmpty'), 'error'); return; }
      if (records.length === 0) { showToast(t('animalsPage.noValidRows'), 'error'); return; }
      for (const record of records) await repo.insert('animals', record);
      showToast(t('animalsPage.importedSuccess', { count: records.length }) + (skipped ? t('animalsPage.skippedRows', { count: skipped }) : ''), 'success');
      onClose();
      onImported?.();
    } catch (err) {
      showToast(t('animalsPage.csvParseError', { message: err.message }), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('animalsPage.importAnimalsCsv')}>
      <Muted style={{ marginBottom: 16 }}>{t('animalsPage.importInstructions')}</Muted>
      <Pressable
        onPress={pickAndImport}
        disabled={busy}
        style={({ pressed }) => [styles.dropZone, { borderColor: pressed ? colors.primary : colors.border, backgroundColor: pressed ? colors.primaryLight : 'transparent' }]}
      >
        {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name="cloud-arrow-up" size={36} color={colors.textLight} />}
        <Text style={[styles.browse, { color: colors.primary }]}>{t('animalsPage.clickToBrowse')}</Text>
        <Text style={[styles.hint, { color: colors.textLight }]}>{t('animalsPage.csvOnly')}</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dropZone: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center', gap: 10 },
  browse: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12 },
});
