import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LIGHT_COLORS, DARK_COLORS, RADIUS, SHADOW, SHADOW_LG } from '../../../shared/theme';

const STORAGE_KEY = 'lp_theme_preference'; // 'light' | 'dark' | 'system'
const ThemeContext = createContext(null);

/* The phone app follows the CropManager mobile app (the Agriplan style):
   16 radius flat cards, pill buttons and badges, a forest app bar, and in
   dark mode deep green surfaces instead of the web's neutral greys.
   `heading` is the colour of card titles (Forest, a soft green in dark). */
const MOBILE_LIGHT = { ...LIGHT_COLORS, heading: '#1B5E20', appBar: '#1B5E20', sidebar: '#1B5E20', overlay: 'rgba(15,31,20,0.55)', pill: '#F3F8F3' };
const MOBILE_DARK = {
  ...DARK_COLORS,
  bg: '#0C140D',
  card: '#111814',
  text: '#E6EEE7',
  textLight: '#9AA79B',
  placeholder: '#6B776C',
  border: '#26332A',
  primaryLight: '#1B3A1D',
  heading: '#A5D6A7',
  appBar: '#1B5E20',
  sidebar: '#1B5E20',
  overlay: 'rgba(0,0,0,0.7)',
  pill: '#1B3A1D',
};
const MOBILE_RADIUS = { ...RADIUS, card: 16, input: 12, button: 999, buttonSm: 999, sheet: 24, dialog: 20 };

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState('system');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme() || 'light');

  useEffect(() => {
    // SecureStore's web shim doesn't implement this on every Expo SDK version
    // (throws instead of just missing the key) — never let that break theming.
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setPreference(saved);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme || 'light'));
    return () => sub.remove();
  }, []);

  const scheme = preference === 'system' ? systemScheme : preference;
  const colors = scheme === 'dark' ? MOBILE_DARK : MOBILE_LIGHT;

  function setThemePreference(next) {
    setPreference(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }

  const value = useMemo(
    () => ({ scheme, colors, radius: MOBILE_RADIUS, shadow: SHADOW, shadowLg: SHADOW_LG, preference, setThemePreference }),
    [scheme, colors, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return ctx;
}
