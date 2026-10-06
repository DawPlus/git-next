import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  explainGitError,
  validateCommitish,
  validateBranchName,
  validateTagName,
} from "../src/git-actions.mts";
import { getPushGuidance, getActionRisk } from "../src/git-safety.mts";
import { listSafeGuardRules, evaluateSafeguards } from "../src/safe-guard.mts";
import { renderGraphHtml } from "../src/graph-view.mts";
import { renderSidebarHtml, renderSafeGuardDetailsHtml } from "../src/sidebar-view.mts";
import {
  renderChangesWorkspace,
  renderCompareWorkspace,
  renderBranchWorkspace,
  renderStashWorkspace,
  renderCommitDetailsWorkspace,
  renderKnowledgeCenter,
} from "../src/workspace-views.mts";
import { renderGlossaryHtml } from "../src/glossary-view.mts";
import { TERM_METADATA, SCENARIO_DEFINITIONS } from "../src/glossary-data.mts";
import { renderGuideHtml, GUIDES } from "../src/git-guide.mts";
import {
  t,
  getLocale,
  setLocale,
  resetLocale,
  normalizeLocale,
  detectLocale,
  getFixedT,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "../src/i18n.mts";
import { koMessages } from "../src/locales/ko/index.mts";
import { enMessages } from "../src/locales/en/index.mts";

// Helper to extract all deep leaf entries and paths
function getDeepEntries(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, val]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        return val.flatMap((item, idx) => {
          if (item && typeof item === "object") {
            return getDeepEntries(item, `${fullPath}.${idx}`);
          }
          return [[`${fullPath}.${idx}`, String(item)]];
        });
      }
      return getDeepEntries(val, fullPath);
    }
    return [[fullPath, String(val)]];
  });
}

// ---------------------------------------------------------------------------
// 1. Existing baseline tests (preserved)
// ---------------------------------------------------------------------------

test("사용자 노출 UI가 한글을 기본으로 사용한다", () => {
  resetLocale();
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: null,
    refs: [],
    commits: [],
    tracking: { kind: "behind", ahead: 0, behind: 1, upstream: "origin/main" },
    pullBeforePush: false,
  });

  assert.match(html, /새로고침/);
  assert.match(html, /받기 \(Pull\)/);
  assert.match(html, /보내기 \(Push\)/);
  assert.match(html, /원격 앞섬/);
  assert.doesNotMatch(html, />Refresh</);
  assert.doesNotMatch(html, />Pull</);
  assert.doesNotMatch(html, />Push</);
});

test("대표 Git 오류와 Push 차단 안내가 한글이다", () => {
  resetLocale();
  assert.match(explainGitError("push", "rejected non-fast-forward"), /원격 브랜치/);
  assert.match(explainGitError("pull", "CONFLICT automatic merge failed"), /충돌/);
  assert.match(getPushGuidance({ kind: "behind", ahead: 0, behind: 2 }).message, /먼저 받기/);
});

test("VS Code 명령과 설정 설명도 한글이다", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.contributes.commands[0].title, "Git Next: 그래프 열기");
  assert.match(packageJson.contributes.configuration.properties["gitNext.pullBeforePush"].description, /Push 전에/);
});

test("사이드바에서 변경 파일을 보고 diff, stage, unstage, commit 할 수 있다", () => {
  resetLocale();
  const html = renderSidebarHtml({
    branch: "main",
    upstream: "origin/main",
    tracking: { kind: "up-to-date" },
    changes: [
      { status: "M ", path: "src/staged.js" },
      { status: " M", path: "src/unstaged.js" },
      { status: "??", path: "src/new.js" },
    ],
  });

  assert.match(html, /Staged/);
  assert.match(html, /변경사항/);
  assert.match(html, /src\/staged\.js/);
  assert.match(html, /src\/unstaged\.js/);
  assert.match(html, /src\/new\.js/);
  assert.match(html, /data-action="sidebarDiff"/);
  assert.match(html, /data-action="sidebarStage"/);
  assert.match(html, /data-action="sidebarUnstage"/);
  assert.match(html, /data-action="sidebarCommit"/);
  assert.match(html, /data-action="sidebarStage" data-path="src"/);
  assert.match(html, /data-action="sidebarUnstage" data-path="src"/);
  assert.match(html, /class="file-open"/);
  assert.match(html, /class="folder-icon"/);
  assert.match(html, /class="file-icon"/);
  assert.match(html, /data-action="sidebarDiscard"/);
  assert.match(html, /class="status "\>수정<\/span>\s*<svg class="file-icon"[\s\S]*?<span class="path" title="src\/staged\.js">/);
  assert.match(html, /data-action="sidebarStageAll"/);
  assert.match(html, /data-action="sidebarUnstageAll"/);
  assert.match(html, /class="scm-group scm-card"/);
  assert.match(html, /class="commit-compose"/);
  assert.match(html, /stage-control/);
  assert.match(html, /\.scm-file \.mini-action:active/);
  assert.match(html, /class="status-hints"/);
  assert.ok(html.indexOf('data-action="openGraph"') < html.indexOf("source-control\">"));
  assert.match(html, /data-action="refresh" aria-label="동기화"/);
  assert.doesNotMatch(html, /data-action="openKnowledge" aria-label="동기화 도움말"/);
  assert.equal((html.match(/class="tool-button"/g) ?? []).length, 7);
  assert.match(html, /data-action="changeLanguage"/);
  assert.ok(html.indexOf('data-action="openGraph"') < html.indexOf('data-tool="ai-diagnose"'));
  assert.ok(html.indexOf('data-tool="ai-diagnose"') < html.indexOf('data-action="refresh"'));
  assert.doesNotMatch(html, /class="tool-button"[^>]*data-tool="ai-history"/);
  assert.doesNotMatch(html, /class="tool-button"[^>]*data-tool="remote"/);
  assert.doesNotMatch(html, /class="tool-button"[^>]*data-tool="compare"/);
  assert.match(html, /data-tool="commit" aria-label="Commit 메시지 도우미"/);
  assert.doesNotMatch(html, /data-tool="partial-stage" aria-label="부분 Commit 안내"/);
  assert.match(html, /class="commit-input-wrap"/);
  assert.match(html, /class="icon-button commit-helper"/);
});

test("변경 그룹은 항목이 있을 때만 보인다", () => {
  resetLocale();
  const emptyHtml = renderSidebarHtml({
    branch: "main",
    upstream: "origin/main",
    tracking: { kind: "up-to-date" },
    changes: [],
  });
  assert.doesNotMatch(emptyHtml, /data-action="sidebarStageAll"/);
  assert.doesNotMatch(emptyHtml, /data-action="sidebarUnstageAll"/);
  assert.match(emptyHtml, /변경사항이 없습니다/);

  const stagedOnly = renderSidebarHtml({
    branch: "main",
    upstream: "origin/main",
    tracking: { kind: "up-to-date" },
    changes: [{ status: "M ", path: "src/staged.js" }],
  });
  assert.match(stagedOnly, /data-action="sidebarUnstageAll"/);
  assert.doesNotMatch(stagedOnly, /data-action="sidebarStageAll"/);
});

// ---------------------------------------------------------------------------
// 2. Release Gate: Korean and English 100% key parity & non-empty validation
// ---------------------------------------------------------------------------

test("release gate: ko and en locale bundles have 100% key parity across all namespaces", () => {
  const koEntries = new Map(getDeepEntries(koMessages));
  const enEntries = new Map(getDeepEntries(enMessages));

  assert.ok(koEntries.size > 800, `Expected > 800 keys, found ${koEntries.size}`);
  assert.equal(
    koEntries.size,
    enEntries.size,
    `Key count mismatch: ko=${koEntries.size}, en=${enEntries.size}`,
  );

  const missingInEn = [...koEntries.keys()].filter((k) => !enEntries.has(k));
  const missingInKo = [...enEntries.keys()].filter((k) => !koEntries.has(k));

  assert.deepEqual(missingInEn, [], "No keys should be missing in English");
  assert.deepEqual(missingInKo, [], "No keys should be missing in Korean");

  // Verify all entries contain non-empty strings
  for (const [key, val] of koEntries.entries()) {
    assert.ok(typeof val === "string" && val.trim().length > 0, `ko key ${key} is empty`);
  }
  for (const [key, val] of enEntries.entries()) {
    assert.ok(typeof val === "string" && val.trim().length > 0, `en key ${key} is empty`);
  }
});

test("release gate: interpolation parameter parity between Korean and English templates", () => {
  const koEntries = new Map(getDeepEntries(koMessages));
  const enEntries = new Map(getDeepEntries(enMessages));
  const paramRegex = /\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}/g;

  for (const [key, koVal] of koEntries.entries()) {
    const enVal = enEntries.get(key);
    if (!enVal) continue;

    const koParams = new Set([...koVal.matchAll(paramRegex)].map((m) => m[1]));
    const enParams = new Set([...enVal.matchAll(paramRegex)].map((m) => m[1]));

    const missingInEn = [...koParams].filter((p) => !enParams.has(p));
    const missingInKo = [...enParams].filter((p) => !koParams.has(p));

    assert.deepEqual(
      missingInEn,
      [],
      `Interpolation parameter missing in EN for key "${key}": ${missingInEn.join(", ")}`,
    );
    assert.deepEqual(
      missingInKo,
      [],
      `Interpolation parameter missing in KO for key "${key}": ${missingInKo.join(", ")}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Missing-key and unused-key static code analysis
// ---------------------------------------------------------------------------

test("release gate: all statically referenced translation keys (t and tFn) exist in dictionaries", () => {
  const allDictKeys = new Set(getDeepEntries(koMessages).map(([k]) => k));
  const staticKeys = new Set();
  const keyRegex = /\b(?:t|tFn)\(\s*["\x27]([a-zA-Z0-9_.-]+)["\x27]/g;

  function scanDir(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        scanDir(full);
      } else if (full.endsWith(".mts") || full.endsWith(".ts")) {
        const normalized = full.replace(/\\/g, "/");
        if (normalized.includes("src/locales/")) continue;
        const content = readFileSync(full, "utf8");
        for (const m of content.matchAll(keyRegex)) {
          staticKeys.add(m[1]);
        }
      }
    }
  }

  scanDir(join(process.cwd(), "src"));

  assert.ok(staticKeys.size > 400, `Expected > 400 static key usages, found ${staticKeys.size}`);

  const missingKeys = [...staticKeys].filter((k) => !allDictKeys.has(k));
  assert.deepEqual(missingKeys, [], "All statically referenced keys must exist in locale dictionaries");
});

test("release gate: unused-key check for statically knowable UI namespaces", () => {
  const allDictKeys = new Set(getDeepEntries(koMessages).map(([k]) => k));
  const staticKeys = new Set();
  const keyRegex = /\b(?:t|tFn)\(\s*["\x27]([a-zA-Z0-9_.-]+)["\x27]/g;

  function scanDir(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        scanDir(full);
      } else if (full.endsWith(".mts") || full.endsWith(".ts")) {
        const normalized = full.replace(/\\/g, "/");
        if (normalized.includes("src/locales/")) continue;
        const content = readFileSync(full, "utf8");
        for (const m of content.matchAll(keyRegex)) {
          staticKeys.add(m[1]);
        }
      }
    }
  }

  scanDir(join(process.cwd(), "src"));

  // Statically knowable namespaces whose keys must all be referenced in source code
  // (dynamic namespaces such as guide.guides, glossary.terms, glossary.scenarios, safeguard.rules, sidebar.risk.reasons are excluded and verified via dynamic registry mapping tests)
  const staticallyKnowableSections = [
    "guide.marker.",
    "glossary.live.",
    "workspace.branch.script.",
    "workspace.branch.sync.",
  ];

  for (const section of staticallyKnowableSections) {
    const keys = [...allDictKeys].filter((k) => k.startsWith(section));
    const unused = keys.filter((k) => !staticKeys.has(k));
    assert.deepEqual(
      unused,
      [],
      `Found unused keys in statically knowable namespace "${section}": ${unused.join(", ")}`,
    );
  }
});

test("release gate: dynamic namespace keys (guides, terms, scenarios, safeguards) map completely", () => {
  const allDictKeys = new Set(getDeepEntries(koMessages).map(([k]) => k));

  // 1. Guides dynamic keys
  for (const guideKey of Object.keys(GUIDES)) {
    assert.ok(
      allDictKeys.has(`guide.guides.${guideKey}.title`),
      `guide.guides.${guideKey}.title must exist`,
    );
    assert.ok(
      allDictKeys.has(`guide.guides.${guideKey}.summary`),
      `guide.guides.${guideKey}.summary must exist`,
    );
    assert.ok(
      allDictKeys.has(`guide.guides.${guideKey}.example`),
      `guide.guides.${guideKey}.example must exist`,
    );
  }

  // 2. Glossary terms dynamic keys
  for (const meta of TERM_METADATA) {
    assert.ok(
      allDictKeys.has(`glossary.terms.${meta.key}.summary`),
      `glossary.terms.${meta.key}.summary must exist`,
    );
    assert.ok(
      allDictKeys.has(`glossary.terms.${meta.key}.effect`),
      `glossary.terms.${meta.key}.effect must exist`,
    );
  }

  // 3. Glossary scenarios dynamic keys
  for (const sc of SCENARIO_DEFINITIONS) {
    assert.ok(
      allDictKeys.has(`glossary.scenarios.${sc.key}.title`),
      `glossary.scenarios.${sc.key}.title must exist`,
    );
    assert.ok(
      allDictKeys.has(`glossary.scenarios.${sc.key}.state`),
      `glossary.scenarios.${sc.key}.state must exist`,
    );
  }

  // 4. Safe Guard rule dynamic keys
  for (const rule of listSafeGuardRules()) {
    // Camelcase rule id mapping
    const camelId = rule.id.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
    assert.ok(
      allDictKeys.has(`safeguard.rules.${camelId}.title`),
      `safeguard.rules.${camelId}.title must exist`,
    );
    assert.ok(
      allDictKeys.has(`safeguard.rules.${camelId}.purpose`),
      `safeguard.rules.${camelId}.purpose must exist`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Scoped Hardcoded UI Copy Scan
// ---------------------------------------------------------------------------

test("release gate: scoped source templates contain no unintended hardcoded Korean strings", () => {
  const scopedFiles = [
    "src/sidebar-view.mts",
    "src/workspace-views.mts",
    "src/glossary-view.mts",
    "src/git-guide.mts",
  ];

  const forbiddenLiterals = [
    'title="그래프 보기"',
    'aria-label="그래프 보기"',
    'title="AI 진단"',
    'aria-label="동기화"',
    'title="Git 도구"',
    'title="도움말"',
    'aria-label="브랜치 도구"',
    '<span class="tool-title">브랜치</span>',
    'aria-label="태그 도구"',
    '<span class="tool-title">태그</span>',
    'aria-label="Stash 도구"',
    'aria-label="Git Doctor"',
    'aria-label="복구 도구"',
    'aria-label="Safe Guard 규칙"',
    'placeholder="Commit message 입력"',
    '<div class="eyebrow">변경사항</div>',
    '<div class="scm-empty">변경사항이 없습니다.</div>',
    '<h2>Git 상세 정보</h2>',
    '<h2>Git 저장소가 없습니다</h2>',
  ];

  for (const file of scopedFiles) {
    const content = readFileSync(join(process.cwd(), file), "utf8");
    for (const lit of forbiddenLiterals) {
      assert.ok(
        !content.includes(lit),
        `Found hardcoded literal "${lit}" in ${file}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Korean and English Smoke Rendering Tests
// ---------------------------------------------------------------------------

function createMockState(overrides = {}) {
  return {
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: "abc1234",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "abc1234", kind: "local" },
      { name: "origin/main", fullName: "refs/remotes/origin/main", target: "abc1234", kind: "remote" },
    ],
    commits: [],
    tracking: { kind: "ahead", ahead: 2, behind: 0, upstream: "origin/main" },
    pullBeforePush: false,
    worktrees: [
      { isCurrent: true, branch: "main", path: "/repo" },
      { isCurrent: false, branch: "feature", path: "/repo-feature" },
    ],
    relaxedRules: ["pull-before-push"],
    changes: [
      { status: "M ", path: "src/staged.ts" },
      { status: " M", path: "src/modified.ts" },
      { status: "D ", path: "src/deleted.ts" },
      { status: "??", path: "src/new-file.ts" },
      { status: "UU", path: "src/conflict.ts" },
    ],
    nextAction: {
      kind: "dirty",
      title: "Commit local changes",
      detail: "There are uncommitted changes",
    },
    ...overrides,
  };
}

const koreanRegex = /[\uac00-\ud7a3]/g;

function assertValidEnglishRendering(name, html) {
  assert.match(html, /<html lang="en">/, `${name} should have lang="en"`);
  const bodyOnly = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const koreanMatches = bodyOnly.match(koreanRegex);
  assert.equal(
    koreanMatches,
    null,
    `${name} English rendering must not leak Korean characters, found: ${koreanMatches?.join(", ")}`,
  );
}

function assertValidKoreanRendering(name, html) {
  assert.match(html, /<html lang="ko">/, `${name} should have lang="ko"`);
  const bodyOnly = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const koreanMatches = bodyOnly.match(koreanRegex);
  assert.ok(
    koreanMatches && koreanMatches.length > 0,
    `${name} Korean rendering should contain Korean characters`,
  );
}

test("smoke test: sidebar renders in Korean and English with zero English leaks", () => {
  const state = createMockState();
  const notice = { ok: false, level: "warning", message: "Notice", detail: "Detail" };

  const koHtml = renderSidebarHtml(state, notice, { locale: "ko" });
  assertValidKoreanRendering("Sidebar", koHtml);
  assert.match(koHtml, /로컬 앞섬/);
  assert.match(koHtml, /aria-label="그래프 보기"/);

  const enHtml = renderSidebarHtml(state, notice, { locale: "en" });
  assertValidEnglishRendering("Sidebar", enHtml);
  assert.match(enHtml, /Ahead/);
  assert.match(enHtml, /aria-label="View Graph"/);
});

test("smoke test: safe guard details render in Korean and English", () => {
  const notice = { message: "Safe guard notice", detail: "git status" };

  const koHtml = renderSafeGuardDetailsHtml(notice, { locale: "ko" });
  assertValidKoreanRendering("SafeGuardDetails", koHtml);

  const enHtml = renderSafeGuardDetailsHtml(notice, { locale: "en" });
  assertValidEnglishRendering("SafeGuardDetails", enHtml);
});

test("smoke test: changes workspace renders in Korean and English", () => {
  const data = {
    files: [],
    staged: [{ status: "M ", path: "staged.js", staged: true, unstaged: false }],
    unstaged: [{ status: "??", path: "untracked.js", untracked: true, staged: false, unstaged: true }],
  };

  const koHtml = renderChangesWorkspace(data, null, { locale: "ko" });
  assertValidKoreanRendering("ChangesWorkspace", koHtml);
  assert.match(koHtml, /변경사항 · Commit/);

  const enHtml = renderChangesWorkspace(data, null, { locale: "en" });
  assertValidEnglishRendering("ChangesWorkspace", enHtml);
  assert.match(enHtml, /Changes · Commit/);
});

test("smoke test: compare workspace renders in Korean and English", () => {
  const comparison = {
    ok: true,
    upstream: "origin/main",
    files: [
      { path: "shared.js", scope: "both", localStatus: "M", remoteStatus: "M" },
      { path: "local.js", scope: "local", localStatus: "M", remoteStatus: null },
      { path: "remote.js", scope: "remote", localStatus: null, remoteStatus: "A" },
    ],
  };

  const koHtml = renderCompareWorkspace(comparison, { locale: "ko" });
  assertValidKoreanRendering("CompareWorkspace", koHtml);
  assert.match(koHtml, /양쪽에서 변경/);

  const enHtml = renderCompareWorkspace(comparison, { locale: "en" });
  assertValidEnglishRendering("CompareWorkspace", enHtml);
  assert.match(enHtml, /Changed on both sides/);
});

test("smoke test: branch workspace renders in Korean and English", () => {
  const state = createMockState();

  const koHtml = renderBranchWorkspace(state, { locale: "ko" });
  assertValidKoreanRendering("BranchWorkspace", koHtml);
  assert.match(koHtml, /Local · 내 작업 공간/);

  const enHtml = renderBranchWorkspace(state, { locale: "en" });
  assertValidEnglishRendering("BranchWorkspace", enHtml);
  assert.match(enHtml, /Local · Working space/);
});

test("smoke test: stash workspace renders in Korean and English", () => {
  const stashes = [{ ref: "stash@{0}", message: "wip", relative: "1 minute ago" }];
  const details = { ref: "stash@{0}", stat: "1 file changed", files: [{ status: "M", path: "app.js" }], overlap: ["app.js"] };

  const koHtml = renderStashWorkspace(stashes, details, null, { locale: "ko" });
  assertValidKoreanRendering("StashWorkspace", koHtml);
  assert.match(koHtml, /Apply \/ Pop \/ Drop 차이/);

  const enHtml = renderStashWorkspace(stashes, details, null, { locale: "en" });
  assertValidEnglishRendering("StashWorkspace", enHtml);
  assert.match(enHtml, /Differences between Apply \/ Pop \/ Drop/);
});

test("smoke test: commit details workspace renders in Korean and English", () => {
  const details = {
    ok: true,
    id: "abcdef1234567890",
    parents: ["1234567890abcdef"],
    author: "Tester",
    email: "test@example.com",
    authoredAt: "2026-10-04T16:00:00+09:00",
    message: "feature: update app",
    files: [
      { status: "M", path: "app.js", oldPath: null },
      { status: "R100", oldPath: "old.js", path: "new.js" },
    ],
  };

  const koHtml = renderCommitDetailsWorkspace(details, { locale: "ko" });
  assertValidKoreanRendering("CommitDetailsWorkspace", koHtml);
  assert.match(koHtml, /Commit 상세/);

  const enHtml = renderCommitDetailsWorkspace(details, { locale: "en" });
  assertValidEnglishRendering("CommitDetailsWorkspace", enHtml);
  assert.match(enHtml, /Commit Details/);
});

test("smoke test: knowledge center workspace renders in Korean and English", () => {
  const state = createMockState();

  const koGuides = renderKnowledgeCenter({ tab: "guides", state }, { locale: "ko" });
  assertValidKoreanRendering("KnowledgeCenterGuides", koGuides);
  assert.match(koGuides, /Git 도움말/);

  const enGuides = renderKnowledgeCenter({ tab: "guides", state }, { locale: "en" });
  assertValidEnglishRendering("KnowledgeCenterGuides", enGuides);
  assert.match(enGuides, /Git Help &amp; Learning Center/);

  const koTerms = renderKnowledgeCenter({ tab: "terms", state }, { locale: "ko" });
  assertValidKoreanRendering("KnowledgeCenterTerms", koTerms);

  const enTerms = renderKnowledgeCenter({ tab: "terms", state }, { locale: "en" });
  assertValidEnglishRendering("KnowledgeCenterTerms", enTerms);
});

test("smoke test: glossary and situational guides render in Korean and English", () => {
  const koGlossary = renderGlossaryHtml({ locale: "ko" });
  assertValidKoreanRendering("GlossaryHtml", koGlossary);
  assert.match(koGlossary, /Git 용어 설명/);

  const enGlossary = renderGlossaryHtml({ locale: "en" });
  assertValidEnglishRendering("GlossaryHtml", enGlossary);
  assert.match(enGlossary, /Git Terminology Guide/);

  const koGuide = renderGuideHtml("dirty-pull", { locale: "ko" });
  assertValidKoreanRendering("GuideHtml", koGuide);
  assert.match(koGuide, /상황별 Git 가이드/);

  const enGuide = renderGuideHtml("dirty-pull", { locale: "en" });
  assertValidEnglishRendering("GuideHtml", enGuide);
  assert.match(enGuide, /Situational Git Guides/);
});

// ---------------------------------------------------------------------------
// 6. Tooltip, aria-label, modal, error, and empty-state coverage
// ---------------------------------------------------------------------------

test("coverage: tooltips and aria-labels exist and localize in Korean and English", () => {
  const state = createMockState();

  // Sidebar tooltips & aria-labels
  const koSidebar = renderSidebarHtml(state, null, { locale: "ko" });
  assert.match(koSidebar, /title="그래프 보기"/);
  assert.match(koSidebar, /aria-label="동기화"/);
  assert.match(koSidebar, /title="Commit 메시지 도우미"/);
  assert.match(koSidebar, /title="전체 Stage"/);
  assert.match(koSidebar, /title="전체 Unstage"/);

  const enSidebar = renderSidebarHtml(state, null, { locale: "en" });
  assert.match(enSidebar, /title="View Graph"/);
  assert.match(enSidebar, /aria-label="Sync"/);
  assert.match(enSidebar, /title="Commit message helper"/);
  assert.match(enSidebar, /title="Stage All"/);
  assert.match(enSidebar, /title="Unstage All"/);

  // Changes workspace tooltips & titles
  const data = { files: [], staged: [{ status: "M ", path: "f.js" }], unstaged: [] };
  const koChanges = renderChangesWorkspace(data, null, { locale: "ko" });
  assert.match(koChanges, /title="Staging에서 빼기"/);

  const enChanges = renderChangesWorkspace(data, null, { locale: "en" });
  assert.match(enChanges, /title="Remove from staging"/);
});

test("coverage: modal and confirmation dialog templates localize in Korean and English", () => {
  const tKo = getFixedT("ko");
  const tEn = getFixedT("en");

  // Severity labels
  assert.equal(tKo("dialog.confirmMutation.safe"), "확인됨");
  assert.equal(tEn("dialog.confirmMutation.safe"), "Verified");
  assert.equal(tKo("dialog.confirmMutation.warning"), "주의");
  assert.equal(tEn("dialog.confirmMutation.warning"), "Warning");
  assert.equal(tKo("dialog.confirmMutation.blocked"), "차단");
  assert.equal(tEn("dialog.confirmMutation.blocked"), "Blocked");

  // Context interpolations
  assert.equal(
    tKo("dialog.confirmMutation.worktreeContext", { count: 3, details: "b1 · /p1 / b2 · /p2" }),
    "다른 작업 폴더 3개: b1 · /p1 / b2 · /p2",
  );
  assert.equal(
    tEn("dialog.confirmMutation.worktreeContext", { count: 3, details: "b1 · /p1 / b2 · /p2" }),
    "3 other worktree(s): b1 · /p1 / b2 · /p2",
  );
});

test("coverage: error messages and validation localize in Korean and English", async () => {
  // Git error explanations
  setLocale("ko");
  assert.match(explainGitError("push", "rejected non-fast-forward"), /원격 브랜치/);
  setLocale("en");
  assert.match(explainGitError("push", "rejected non-fast-forward"), /Remote branch/i);

  // Validations
  setLocale("ko");
  const koVal = await validateBranchName("/repo", "   ");
  assert.equal(koVal.ok, false);
  assert.equal(koVal.message, "브랜치 이름을 입력하세요.");

  setLocale("en");
  const enVal = await validateBranchName("/repo", "   ");
  assert.equal(enVal.ok, false);
  assert.equal(enVal.message, "Please enter a branch name.");

  resetLocale();
});

test("coverage: empty states render correctly in Korean and English across all surfaces", () => {
  // 1. Sidebar empty changes
  const koEmptySidebar = renderSidebarHtml(createMockState({ changes: [] }), null, { locale: "ko" });
  assert.match(koEmptySidebar, /변경사항이 없습니다\./);
  const enEmptySidebar = renderSidebarHtml(createMockState({ changes: [] }), null, { locale: "en" });
  assert.match(enEmptySidebar, /No changes\./);

  // 2. Changes workspace empty
  const koEmptyChanges = renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, null, { locale: "ko" });
  assert.match(koEmptyChanges, /아직 Staging된 파일이 없습니다/);
  const enEmptyChanges = renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, null, { locale: "en" });
  assert.match(enEmptyChanges, /No staged files yet/);

  // 3. Stash workspace empty
  const koEmptyStash = renderStashWorkspace([], null, null, { locale: "ko" });
  assert.match(koEmptyStash, /저장된 Stash가 없습니다/);
  const enEmptyStash = renderStashWorkspace([], null, null, { locale: "en" });
  assert.match(enEmptyStash, /No saved stashes/);

  // 4. Branch workspace empty
  const koEmptyBranch = renderBranchWorkspace({ branch: null, refs: [] }, { locale: "ko" });
  assert.match(koEmptyBranch, /로컬 브랜치가 없습니다/);
  const enEmptyBranch = renderBranchWorkspace({ branch: null, refs: [] }, { locale: "en" });
  assert.match(enEmptyBranch, /No local branches/);

  // 5. Commit details empty/failed
  const koFailCommit = renderCommitDetailsWorkspace({ ok: false }, { locale: "ko" });
  assert.match(koFailCommit, /커밋 정보를 읽지 못했습니다/);
  const enFailCommit = renderCommitDetailsWorkspace({ ok: false }, { locale: "en" });
  assert.match(enFailCommit, /Could not read commit information/);
});
