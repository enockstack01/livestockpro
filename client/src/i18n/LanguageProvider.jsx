import { createContext, useContext, useEffect, useState } from 'react';
import i18n, { SUPPORTED_LANGUAGES } from './index';

const STORAGE_KEY = 'lp_language_preference';
const LanguageContext = createContext(null);

function applyDocumentDirection(code) {
  const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  const dir = meta?.rtl ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = code;
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(i18n.language);

  // Apply the writing direction for whatever language i18next resolved on
  // first load (detected from localStorage/navigator.language in i18n/index.js).
  useEffect(() => {
    applyDocumentDirection(i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLanguage(code, persist = true) {
    i18n.changeLanguage(code);
    setLanguageState(code);
    applyDocumentDirection(code);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* storage unavailable */ }
    }
  }

  const value = {
    language,
    setLanguage: (code) => applyLanguage(code, true),
    languages: SUPPORTED_LANGUAGES,
    // Web can flip `dir` live (see applyDocumentDirection) so there is never
    // a restart requirement the way there is on React Native — kept as a
    // stable `false` so any shared UI copied from mobile's settings screen
    // that checks this flag still works without a code branch.
    rtlRestartNeeded: false,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() must be used inside <LanguageProvider>');
  return ctx;
}
