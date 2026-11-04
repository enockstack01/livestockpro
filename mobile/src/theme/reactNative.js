/* What `import … from 'react-native'` gives the app's own code (src/,
   app/ and shared/; metro.config.js points those imports here): React
   Native as is, except that Text and TextInput set in Carlito
   (src/theme/fontsCore.js). Libraries keep the plain components. */
import { Text as PlainText, TextInput as PlainTextInput } from 'react-native';
import { carlito } from './fontsCore';
import TextAncestor from './textAncestor';

export * from 'react-native';
export const Text = carlito(PlainText, TextAncestor);
export const TextInput = carlito(PlainTextInput, null);
