import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LIGHT_COLORS, DARK_COLORS, RADIUS, SHADOW, SHADOW_LG } from '../../../shared/theme';

const STORAGE_KEY = 'lp_theme_preference'; // 'light' | 'dark' | 'system'
const ThemeContext = createContext(null);

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
  const colors = scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  function setThemePreference(next) {
    setPreference(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }

  const value = useMemo(
    () => ({ scheme, colors, radius: RADIUS, shadow: SHADOW, shadowLg: SHADOW_LG, preference, setThemePreference }),
    [scheme, colors, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return ctx;
}
