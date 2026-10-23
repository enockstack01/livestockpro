import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { docIsLandscape, docToCsv, docToHtml, docToSheets, exportFileName } from '../../../shared/recordExport';
import { sheetsToXlsx } from './xlsx';

/* Saves an export document (shared/recordExport.js) on the phone and opens
   the share sheet (save to Files, WhatsApp, email): PDF printed from the
   branded layout by the system's PDF engine (every script prints, Arabic,
   Chinese and Hindi included), Excel and CSV as files. In a browser (Expo
   web) the file downloads instead. Resolves false when sharing is not
   available on the device. */

const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv'
};
const UTI = { pdf: 'com.adobe.pdf', xlsx: 'org.openxmlformats.spreadsheetml.sheet', csv: 'public.comma-separated-values-text' };

/* A4 in points; landscape for wide tables. */
const A4 = { width: 595, height: 842 };

function downloadOnWeb(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function share(file, format) {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: file.name });
  return true;
}

export async function exportDoc(doc, format, t, lang) {
  const name = exportFileName(doc.title, format);

  if (format === 'csv') {
    const csv = docToCsv(doc);
    if (Platform.OS === 'web') { downloadOnWeb(csv, name, MIME.csv); return true; }
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(csv);
    return share(file, format);
  }

  if (format === 'xlsx') {
    const bytes = sheetsToXlsx(docToSheets(doc));
    if (Platform.OS === 'web') { downloadOnWeb(bytes, name, MIME.xlsx); return true; }
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(bytes);
    return share(file, format);
  }

  const html = docToHtml(doc, t, { lang });
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return true; }
  const landscape = docIsLandscape(doc);
  const { uri } = await Print.printToFileAsync({
    html,
    width: landscape ? A4.height : A4.width,
    height: landscape ? A4.width : A4.height,
    margins: { left: 34, right: 34, top: 40, bottom: 44 }
  });
  /* Give the file the report's name instead of the random one. */
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  return share(target, format);
}

/* The system print dialog (paper, or "Save as PDF"). */
export function printDoc(doc, t, lang) {
  return Print.printAsync({ html: docToHtml(doc, t, { lang }), orientation: docIsLandscape(doc) ? Print.Orientation.landscape : Print.Orientation.portrait });
}
