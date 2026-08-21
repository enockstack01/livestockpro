import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import fr from './locales/fr.json';
import sw from './locales/sw.json';
import rw from './locales/rw.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import hi from './locales/hi.json';

/* Every supported language — SUPPORTED_LANGUAGES drives the picker UI in
   Settings/the drawer menu; `code` must match a resources key below.
   Kinyarwanda, English, French, and Kiswahili are the required baseline;
   the rest round out broad coverage. rtl:true languages need
   I18nManager.forceRTL() — see LanguageProvider. */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'sw', label: 'Kiswahili', nativeLabel: 'Kiswahili' },
  { code: 'rw', label: 'Kinyarwanda', nativeLabel: 'Ikinyarwanda' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', rtl: true },
  { code: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
];

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  sw: { translation: sw },
  rw: { translation: rw },
  es: { translation: es },
  pt: { translation: pt },
  de: { translation: de },
  ar: { translation: ar },
  zh: { translation: zh },
  hi: { translation: hi },
};

const supportedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
const deviceLanguage = Localization.getLocales()?.[0]?.languageCode;
const initialLanguage = supportedCodes.includes(deviceLanguage) ? deviceLanguage : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
