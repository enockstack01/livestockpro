import { createContext, useContext, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import i18n, { SUPPORTED_LANGUAGES } from './index';

const STORAGE_KEY = 'lp_language_preference';
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(i18n.language);
  const [rtlRestartNeeded, setRtlRestartNeeded] = useState(false);

  useEffect(() => {
    // SecureStore's web shim doesn't implement this on every Expo SDK version
    // (throws instead of just missing the key) — never let that break i18n init.
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved) && saved !== i18n.language) {
          applyLanguage(saved, false);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLanguage(code, persist = true) {
    i18n.changeLanguage(code);
    setLanguageState(code);
    if (persist) SecureStore.setItemAsync(STORAGE_KEY, code).catch(() => {});

    const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    const shouldBeRTL = !!meta?.rtl;
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
      setRtlRestartNeeded(true); // RN only applies the new writing direction after a full restart
    }
  }

  const value = {
    language,
    setLanguage: (code) => applyLanguage(code, true),
    languages: SUPPORTED_LANGUAGES,
    rtlRestartNeeded,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() must be used inside <LanguageProvider>');
  return ctx;
}
