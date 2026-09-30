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

import webEn from '../../../client/src/i18n/locales/en.json';
import webFr from '../../../client/src/i18n/locales/fr.json';
import webSw from '../../../client/src/i18n/locales/sw.json';
import webRw from '../../../client/src/i18n/locales/rw.json';
import webEs from '../../../client/src/i18n/locales/es.json';
import webPt from '../../../client/src/i18n/locales/pt.json';
import webDe from '../../../client/src/i18n/locales/de.json';
import webAr from '../../../client/src/i18n/locales/ar.json';
import webZh from '../../../client/src/i18n/locales/zh.json';
import webHi from '../../../client/src/i18n/locales/hi.json';

/* The mobile screens mirror the web app's design, so they use the web app's
   strings (dashboardPage.*, analytics.*, animalsPage.*, …). Mobile's own
   files are layered on top for the mobile-only keys (sync, geo, native
   auth flows) and win on any overlap. */
function deepMerge(base, over) {
  const out = { ...base };
  Object.entries(over).forEach(([k, v]) => {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  });
  return out;
}

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
  en: { translation: deepMerge(webEn, en) },
  fr: { translation: deepMerge(webFr, fr) },
  sw: { translation: deepMerge(webSw, sw) },
  rw: { translation: deepMerge(webRw, rw) },
  es: { translation: deepMerge(webEs, es) },
  pt: { translation: deepMerge(webPt, pt) },
  de: { translation: deepMerge(webDe, de) },
  ar: { translation: deepMerge(webAr, ar) },
  zh: { translation: deepMerge(webZh, zh) },
  hi: { translation: deepMerge(webHi, hi) },
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
