import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bg from '../locales/bg.json';

void i18n.use(initReactI18next).init({
  resources: { bg: { translation: bg } },
  lng: 'bg',
  fallbackLng: 'bg',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = 'bg';

export default i18n;
