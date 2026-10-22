import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en.json";
import it from "@/locales/it.json";

export const SUPPORTED_LANGUAGES = ["en", "it"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const DETECTION_OPTIONS = {
  order: ["localStorage", "navigator"],
  caches: ["localStorage"],
  lookupLocalStorage: "openstudio.lang",
};

// A standalone detector, deliberately not registered on the i18next instance via `.use()`:
// a registered detector caches whatever language init resolves back to localStorage, so the
// saved choice is written only by changeLanguage(), when the user actually picks one.
// Guarded for Node, where the unit tests import this module without localStorage/navigator.
const detector = typeof window !== "undefined" ? new LanguageDetector() : null;
detector?.init(undefined, DETECTION_OPTIONS);

function detectLanguage(): string {
  const detected = detector?.detect();
  return (Array.isArray(detected) ? detected[0] : detected) ?? "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  fallbackLng: "en",
  // The app is a client-only SPA, so the first render can already use the saved or
  // browser language; unsupported ones fall back to English.
  lng: detectLanguage(),
  supportedLngs: SUPPORTED_LANGUAGES,
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** Changes the active language and persists the choice; the LanguageSwitcher uses this. */
export function changeLanguage(lang: string): void {
  detector?.cacheUserLanguage(lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
