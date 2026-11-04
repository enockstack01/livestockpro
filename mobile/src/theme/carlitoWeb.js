/* Web only (expo start --web): babel-preset-expo turns
   `import { Text } from 'react-native'` into imports of single
   react-native-web modules, so metro.config.js points the app's imports of
   its Text and TextInput here instead of at src/theme/reactNative.js. */
import Text from 'react-native-web/dist/exports/Text';
import TextInput from 'react-native-web/dist/exports/TextInput';
import TextAncestor from 'react-native-web/dist/exports/Text/TextAncestorContext';
import { carlito } from './fontsCore';

export const CarlitoText = carlito(Text, TextAncestor);
export const CarlitoTextInput = carlito(TextInput, null);
