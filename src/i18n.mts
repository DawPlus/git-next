/**
 * Git Next Localization (i18n) Foundation
 *
 * Architecture and Conventions:
 * 1. Key Naming and Namespaces:
 *    - Keys follow `<namespace>.<subkey>` or `<namespace>.<section>.<subkey>` dot notation.
 *    - Predefined namespaces:
 *      - `common.*`: Reusable actions, button labels, and universal words (e.g., refresh, pull, push, confirm)
 *      - `sidebar.*`: Sidebar views, file lists, staging, commit helpers
 *      - `graph.*`: Commit graph, branches, tags, filtering
 *      - `safeguard.*`: Safe Guard status, rule descriptions, override warnings
 *      - `guidance.*`: Next action guidance, recommendations, safety notices
 *      - `dialog.*`: Confirmations, alerts, modal dialogs
 *      - `glossary.*`: Terminology guide and scenario definitions
 *      - `ai.*`: AI diagnosis, history, and practice panels
 *
 * 2. Multi-file Namespace Organization:
 *    - Rather than a single monolithic dictionary, each namespace is placed in
 *      `src/locales/<locale>/<namespace>.mts` and aggregated in `src/locales/<locale>/index.mts`.
 *    - Additional bundles can be registered dynamically via `registerTranslations(locale, namespace, bundle)`.
 *
 * 3. Fallback and Defaults:
 *    - Default product locale is Korean ('ko').
 *    - Unsupported or unknown locales deterministically fall back to 'ko'.
 *    - Missing translation keys in a target locale deterministically fall back to 'ko'.
 *    - If a key is missing in all locales, the key itself is returned.
 *
 * 4. Interpolation:
 *    - Placeholders in templates use `{param}` or `{{param}}`.
 *    - Missing parameters preserve the placeholder token without error.
 */

import { koMessages } from "./locales/ko/index.mjs";
import { enMessages } from "./locales/en/index.mjs";

export type SupportedLocale = "ko" | "en";
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["ko", "en"] as const;
export const DEFAULT_LOCALE: SupportedLocale = "ko";

type TranslationBundle = Record<string, any>;

const dictionaries: Record<SupportedLocale, TranslationBundle> = {
  ko: { ...koMessages },
  en: { ...enMessages },
};

export function normalizeLocale(raw?: string | null): SupportedLocale {
  if (!raw || typeof raw !== "string") {
    return DEFAULT_LOCALE;
  }
  const normalized = raw.trim().toLowerCase().replace(/_/g, "-");
  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized.startsWith("ko")) {
    return "ko";
  }
  return DEFAULT_LOCALE;
}

export function detectLocale(candidate?: string | null): SupportedLocale {
  if (candidate != null && typeof candidate === "string" && candidate.trim() !== "") {
    return normalizeLocale(candidate);
  }

  // 1. VS Code API environment if available
  const globalVsCode = (globalThis as any).vscode;
  if (globalVsCode?.env?.language) {
    return normalizeLocale(globalVsCode.env.language);
  }

  // 2. VS Code NLS config environment variable
  if (typeof process !== "undefined" && process.env?.VSCODE_NLS_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.VSCODE_NLS_CONFIG);
      if (typeof parsed?.locale === "string") {
        return normalizeLocale(parsed.locale);
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return DEFAULT_LOCALE;
}

let activeLocale: SupportedLocale = detectLocale();

export function getLocale(): SupportedLocale {
  return activeLocale;
}

export function setLocale(candidate?: string | null): SupportedLocale {
  activeLocale = normalizeLocale(candidate);
  return activeLocale;
}

export function resetLocale(): SupportedLocale {
  activeLocale = DEFAULT_LOCALE;
  return activeLocale;
}

export function registerTranslations(
  locale: SupportedLocale,
  namespaceOrBundle: string | TranslationBundle,
  bundle?: TranslationBundle,
): void {
  const targetLocale = normalizeLocale(locale);
  if (!dictionaries[targetLocale]) {
    dictionaries[targetLocale] = {};
  }

  if (typeof namespaceOrBundle === "string") {
    const namespace = namespaceOrBundle;
    dictionaries[targetLocale][namespace] = {
      ...(dictionaries[targetLocale][namespace] || {}),
      ...(bundle || {}),
    };
  } else if (namespaceOrBundle && typeof namespaceOrBundle === "object") {
    Object.assign(dictionaries[targetLocale], namespaceOrBundle);
  }
}

export function getTranslations(locale?: SupportedLocale): TranslationBundle {
  const target = normalizeLocale(locale ?? activeLocale);
  return dictionaries[target] ?? dictionaries[DEFAULT_LOCALE];
}

function resolveKey(dict: TranslationBundle, key: string): string | undefined {
  if (!dict || !key) return undefined;

  // Exact flat key match
  if (typeof dict[key] === "string") {
    return dict[key];
  }

  // Dot path resolution: "namespace.section.key"
  const segments = key.split(".");
  let current: any = dict;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }

  if (typeof current === "string") {
    return current;
  }

  return undefined;
}

export function interpolate(template: string, params?: Record<string, any>): string {
  if (!params || typeof params !== "object") {
    return template;
  }

  return template.replace(/\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}/g, (match, paramKey) => {
    if (Object.prototype.hasOwnProperty.call(params, paramKey)) {
      const val = params[paramKey];
      return val != null ? String(val) : "";
    }
    return match;
  });
}

export interface TranslateOptions {
  locale?: string | null;
}

export function t(
  key: string,
  params?: Record<string, any>,
  options?: TranslateOptions,
): string {
  if (!key || typeof key !== "string") {
    return "";
  }

  const targetLocale = options?.locale ? normalizeLocale(options.locale) : activeLocale;
  const targetDict = dictionaries[targetLocale];
  const defaultDict = dictionaries[DEFAULT_LOCALE];

  // 1. Look up in active/target locale
  let template = resolveKey(targetDict, key);

  // 2. Deterministic fallback to Korean default locale if missing in target
  if (template === undefined && targetLocale !== DEFAULT_LOCALE) {
    template = resolveKey(defaultDict, key);
  }

  // 3. Fallback to key itself if not found anywhere
  if (template === undefined) {
    return interpolate(key, params);
  }

  // 4. Parameter interpolation
  return interpolate(template, params);
}

export function getFixedT(localeCandidate?: string | null) {
  const fixedLocale = normalizeLocale(localeCandidate);
  return function fixedT(key: string, params?: Record<string, any>): string {
    return t(key, params, { locale: fixedLocale });
  };
}
