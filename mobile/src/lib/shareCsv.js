import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* Hands a CSV to the user: the native share sheet on a phone (save to
   Files, email, WhatsApp…), a normal file download when the app runs in a
   browser — the counterpart of the web app's downloadCSV(). Uses the
   SDK 54+ File/Paths API; the old writeAsStringAsync/cacheDirectory
   functions now throw at runtime. Resolves false when sharing isn't
   available on the device. */
export async function shareCsv(csv, filename) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  return true;
}
