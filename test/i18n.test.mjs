import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

import {
  t,
  getLocale,
  setLocale,
  resetLocale,
  normalizeLocale,
  detectLocale,
  getFixedT,
  registerTranslations,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "../src/i18n.mts";

test("locale normalization: maps supported variants and falls back to Korean", () => {
  assert.equal(DEFAULT_LOCALE, "ko");
  assert.deepEqual(SUPPORTED_LOCALES, ["ko", "en"]);

  // English variants
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("en_US"), "en");
  assert.equal(normalizeLocale("en-GB"), "en");
  assert.equal(normalizeLocale("EN"), "en");

  // Korean variants
  assert.equal(normalizeLocale("ko"), "ko");
  assert.equal(normalizeLocale("ko-KR"), "ko");
  assert.equal(normalizeLocale("ko_KR"), "ko");
  assert.equal(normalizeLocale("KO"), "ko");

  // Unsupported or invalid locales fall back to Korean
  assert.equal(normalizeLocale("ja"), "ko");
  assert.equal(normalizeLocale("zh-CN"), "ko");
  assert.equal(normalizeLocale("fr"), "ko");
  assert.equal(normalizeLocale(""), "ko");
  assert.equal(normalizeLocale(null), "ko");
  assert.equal(normalizeLocale(undefined), "ko");
});

test("detectLocale: identifies explicit language or falls back to Korean", () => {
  assert.equal(detectLocale("en-US"), "en");
  assert.equal(detectLocale("ko-KR"), "ko");
  assert.equal(detectLocale("de-DE"), "ko");
  assert.equal(detectLocale(), "ko");
});

test("active locale management: setLocale, getLocale, resetLocale", () => {
  resetLocale();
  assert.equal(getLocale(), "ko");

  setLocale("en-US");
  assert.equal(getLocale(), "en");

  setLocale("unsupported-lang");
  assert.equal(getLocale(), "ko");

  setLocale("en");
  assert.equal(getLocale(), "en");
  resetLocale();
  assert.equal(getLocale(), "ko");
});

test("sample keys: ko and en dictionaries resolve the same core sample keys", () => {
  const sampleKeys = [
    "common.refresh",
    "common.pull",
    "common.push",
    "common.confirm",
    "common.cancel",
    "common.execute",
    "common.close",
    "common.save",
    "common.retry",
    "common.loading",
    "common.empty",
    "safeguard.safe",
    "safeguard.warning",
    "safeguard.blocked",
  ];

  const tKo = getFixedT("ko");
  const tEn = getFixedT("en");

  for (const key of sampleKeys) {
    const koVal = tKo(key);
    const enVal = tEn(key);

    assert.notEqual(koVal, key, `ko should resolve ${key}`);
    assert.notEqual(enVal, key, `en should resolve ${key}`);
    assert.notEqual(koVal, enVal, `ko and en should have distinct translations for ${key}`);
  }

  assert.equal(tKo("common.refresh"), "새로고침");
  assert.equal(tEn("common.refresh"), "Refresh");
  assert.equal(tKo("common.pull"), "받기 (Pull)");
  assert.equal(tEn("common.pull"), "Pull");
  assert.equal(tKo("common.push"), "보내기 (Push)");
  assert.equal(tEn("common.push"), "Push");
  assert.equal(tKo("safeguard.safe"), "안전");
  assert.equal(tEn("safeguard.safe"), "Safe");
});

test("deterministic fallback: missing en key falls back to ko", () => {
  registerTranslations("ko", "testNamespace", {
    onlyInKorean: "한국어 전용 문구",
  });

  const tEn = getFixedT("en");
  // The key does not exist in en, so it must fall back to ko
  assert.equal(tEn("testNamespace.onlyInKorean"), "한국어 전용 문구");
});

test("missing keys: return the key itself when missing in all locales", () => {
  const tKo = getFixedT("ko");
  const tEn = getFixedT("en");

  assert.equal(tKo("nonexistent.key.name"), "nonexistent.key.name");
  assert.equal(tEn("nonexistent.key.name"), "nonexistent.key.name");
  assert.equal(t(""), "");
});

test("parameter interpolation: replaces {param} and {{param}} and preserves missing tokens", () => {
  const tKo = getFixedT("ko");
  const tEn = getFixedT("en");

  // Basic interpolation
  assert.equal(tKo("common.greeting", { name: "도현" }), "안녕하세요, 도현님!");
  assert.equal(tEn("common.greeting", { name: "Doh" }), "Hello, Doh!");

  // Numeric and zero values
  assert.equal(tKo("common.itemsCount", { count: 3 }), "3개 항목");
  assert.equal(tKo("common.itemsCount", { count: 0 }), "0개 항목");
  assert.equal(tEn("common.itemsCount", { count: 0 }), "0 items");

  // Missing parameter preserves placeholder
  assert.equal(tKo("common.greeting", {}), "안녕하세요, {name}님!");

  // Empty string parameter
  assert.equal(tKo("common.greeting", { name: "" }), "안녕하세요, 님!");

  // Custom registered template with {{mustache}} style
  registerTranslations("ko", "testNamespace", {
    mustacheTemplate: "템플릿 {{paramA}} 및 {paramB}",
  });
  assert.equal(
    tKo("testNamespace.mustacheTemplate", { paramA: "값1", paramB: "값2" }),
    "템플릿 값1 및 값2",
  );
});

test("registerTranslations: allows adding new namespaces dynamically", () => {
  registerTranslations("ko", "customSection", {
    welcome: "환영합니다",
  });
  registerTranslations("en", "customSection", {
    welcome: "Welcome",
  });

  assert.equal(getFixedT("ko")("customSection.welcome"), "환영합니다");
  assert.equal(getFixedT("en")("customSection.welcome"), "Welcome");
});

test("cross-module compatibility: view-shared.mts re-exports i18n for ESM views", async () => {
  const viewShared = await import("../src/view-shared.mts");
  assert.equal(typeof viewShared.t, "function");
  assert.equal(typeof viewShared.getLocale, "function");
  assert.equal(typeof viewShared.setLocale, "function");
  assert.equal(typeof viewShared.normalizeLocale, "function");
  assert.equal(viewShared.t("common.refresh"), "새로고침");
});

test("cross-module compatibility: extension-core.ts and i18n.js provide i18n for CommonJS modules", () => {
  const i18nCjs = require("../src/i18n.ts");

  assert.equal(typeof i18nCjs.t, "function");
  assert.equal(typeof i18nCjs.setLocale, "function");
  assert.equal(typeof i18nCjs.getLocale, "function");
  assert.equal(typeof i18nCjs.normalizeLocale, "function");

  assert.equal(i18nCjs.t("common.confirm"), "확인");
  assert.equal(i18nCjs.getFixedT("en")("common.confirm"), "Confirm");
});
