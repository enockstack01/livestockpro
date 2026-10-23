import { Platform } from 'react-native';
import * as Print from 'expo-print';

/* Opens the system print dialog for `html`. On the web target expo-print
   would print the whole app page, so there the report goes to its own
   window and prints from that. */
export async function printHtml(html) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) throw new Error('Pop-up blocked');
    win.document.write(html);
    win.document.close();
    win.focus();
    // onload doesn't reliably fire for document.write — print once, whichever comes first.
    let printed = false;
    const go = () => { if (!printed) { printed = true; win.print(); } };
    win.onload = go;
    setTimeout(go, 400);
    return;
  }
  await Print.printAsync({ html });
}
