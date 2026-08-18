import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import uk from "./locales/uk.json";

export const SUPPORTED_LANGUAGES = ["en", "uk"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "kubelens-language";

function detectLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "uk") return stored;
  if (navigator.language?.toLowerCase().startsWith("uk")) return "uk";
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
