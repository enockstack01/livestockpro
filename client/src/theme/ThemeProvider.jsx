import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'lp_theme_preference'; // 'light' | 'dark' | 'system' — same key index.html's inline script reads
const ThemeContext = createContext(null);

function getSystemScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch (e) {
    return 'system';
  }
}

/* Web counterpart to mobile/src/theme/ThemeProvider.js — same preference
   model (light/dark/system, persisted) and the same palette (see
   shared/theme.js), but applied via a `data-theme` attribute on <html> that
   client/src/style.css keys its dark-mode CSS variables off of, instead of
   handing components a JS colors object (index.html sets the same attribute
   inline before first paint, so there's no flash of the wrong theme). */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredPreference);
  const [systemScheme, setSystemScheme] = useState(getSystemScheme);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemScheme(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const scheme = preference === 'system' ? systemScheme : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', scheme);
  }, [scheme]);

  function setThemePreference(next) {
    setPreference(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* storage unavailable */ }
  }

  const value = { scheme, preference, setThemePreference };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return ctx;
}
