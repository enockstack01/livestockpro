import { createElement, useContext } from 'react';
import { StyleSheet } from 'react-native';

/* Carlito, the metric compatible Calibri (the Agricoders typeface), on
   every piece of text in the app, as in the CropManager app. It has a
   Regular and a Bold face; Android needs a separate family per weight, so
   the weight in a style picks the face (and fontWeight is reset so the
   bold face isn't made bolder still). Text nested in other text without a
   weight of its own keeps its parent's face. */
export const FONT_FAMILIES = { regular: 'Carlito_400Regular', bold: 'Carlito_700Bold' };
const BOLD = new Set(['600', '700', '800', '900', 'bold']);

function withCarlito(style, inherit) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return style;
  if (flat.fontWeight == null && inherit) return style;
  const family = BOLD.has(String(flat.fontWeight)) ? FONT_FAMILIES.bold : FONT_FAMILIES.regular;
  return [style, { fontFamily: family, fontWeight: 'normal' }];
}

/* Text or TextInput with the Carlito face. `ancestor` is React Native's
   "inside a Text" context, or null for inputs. */
export function carlito(Original, ancestor) {
  function CarlitoText(props) {
    const inside = ancestor ? useContext(ancestor) : false; // eslint-disable-line react-hooks/rules-of-hooks
    return createElement(Original, { ...props, style: withCarlito(props.style, !!inside) });
  }
  Object.assign(CarlitoText, Original);
  CarlitoText.displayName = Original.displayName || 'Text';
  return CarlitoText;
}
