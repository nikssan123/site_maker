import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bg from '../locales/bg.json';
import en from '../locales/en.json';

const STORAGE_KEY = 'appmaker-language';

function deepMerge<T extends Record<string, any>>(base: T, override: Record<string, any>): T {
  const out: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function detectInitialLanguage(): 'bg' | 'en' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bg' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  const nav = navigator.language.toLowerCase();
  return nav.startsWith('bg') ? 'bg' : 'en';
}

const resources = {
  bg: { translation: bg },
  en: { translation: deepMerge(bg as Record<string, any>, en as Record<string, any>) },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'bg',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});

document.documentElement.lang = i18n.language;

export default i18n;
