import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  // Allows loading translations from public/locales by default
  .use(Backend)
  // Detects language from browser/localStorage
  .use(LanguageDetector)
  // Passes i18n down to react-i18next
  .use(initReactI18next)
  .init({
    fallbackLng: 'id',
    supportedLngs: ['en', 'id'],
    load: 'languageOnly', // Convert en-US to en
    debug: import.meta.env.MODE === 'development',

    interpolation: {
      escapeValue: false,
    },
    
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    }
  });

export default i18n;
