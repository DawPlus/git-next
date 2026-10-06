export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export {
  t,
  getLocale,
  setLocale,
  resetLocale,
  normalizeLocale,
  detectLocale,
  getFixedT,
  getTranslations,
  registerTranslations,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "./i18n.mjs";

