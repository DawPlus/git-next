import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  renderSidebarHtml,
  renderSafeGuardDetailsHtml,
} from "../src/sidebar-view.mts";
import {
  setLocale,
  resetLocale,
  getFixedT,
} from "../src/i18n.mts";
import { sidebar as koSidebar } from "../src/locales/ko/sidebar.mts";
import { sidebar as enSidebar } from "../src/locales/en/sidebar.mts";

function createMockState(overrides = {}) {
  return {
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: "abc1234",
    refs: [],
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

test("locale dictionaries: ko and en sidebar dictionary keys match 100%", () => {
  function getDeepKeys(obj, prefix = "") {
    return Object.keys(obj).flatMap((key) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        return getDeepKeys(obj[key], fullPath);
      }
      return [fullPath];
    });
  }

  const koKeys = getDeepKeys(koSidebar).sort();
  const enKeys = getDeepKeys(enSidebar).sort();
  assert.deepEqual(koKeys, enKeys, "All sidebar keys must exist in both ko and en");
});

test("sidebar renders in Korean with full surface coverage", () => {
  resetLocale();
  const state = createMockState();
  const notice = { ok: false, level: "warning", message: "경고 알림", detail: "상세" };
  const html = renderSidebarHtml(state, notice, { locale: "ko" });

  // HTML language attribute
  assert.match(html, /<html lang="ko">/);

  // Header & tracking
  assert.match(html, /로컬 앞섬/);
  assert.match(html, /aria-label="그래프 보기" title="그래프 보기"/);
  assert.match(html, /aria-label="AI 진단" title="AI 진단"/);
  assert.match(html, /aria-label="동기화" title="동기화"/);
  assert.match(html, /aria-label="Git 도구" title="Git 도구"/);
  assert.match(html, /aria-label="도움말" title="도움말"/);

  // Tools panel
  assert.match(html, /aria-label="브랜치 도구"[^>]*>[\s\S]*?<span class="tool-title">브랜치<\/span>/);
  assert.match(html, /aria-label="태그 도구"[^>]*>[\s\S]*?<span class="tool-title">태그<\/span>/);
  assert.match(html, /aria-label="Stash 도구"[^>]*>[\s\S]*?<span class="tool-title">Stash<\/span>/);
  assert.match(html, /aria-label="Git Doctor"[^>]*>[\s\S]*?<span class="tool-title">Doctor<\/span>/);
  assert.match(html, /aria-label="복구 도구"[^>]*>[\s\S]*?<span class="tool-title">복구<\/span>/);
  assert.match(html, /aria-label="Safe Guard 규칙"[^>]*>[\s\S]*?<span class="tool-title">Safe Guard<\/span>/);

  // Worktree & relaxed rules notes
  assert.match(html, /다른 작업 폴더 1개 · feature · \/repo-feature/);
  assert.match(html, /세션 동안 완화된 보호: pull-before-push/);

  // Safe Guard status
  assert.match(html, /aria-label="Safe Guard 상태: 주의"/);
  assert.match(html, /aria-label="현재 상태 안내: Commit local changes/);
  assert.match(html, /aria-label="검사 결과 상세 보기" title="검사 결과 상세 보기"/);

  // Next recommendation
  assert.match(html, /class="guard-recommendation-label">다음 추천<\/span>/);
  assert.match(html, /title="현재 상태에서 추천하는 다음 행동: 전체 Stage"/);
  assert.match(html, /class="guard-next-action"[^>]*>전체 Stage<\/button>/);

  // Commit & Undo
  assert.match(html, /placeholder="Commit message 입력"/);
  assert.match(html, /aria-label="Commit 메시지 도우미" title="Commit 메시지 도우미"/);
  assert.match(html, />Commit<\/button>/);
  assert.match(html, />마지막 Commit 취소<\/button>/);
  assert.match(html, /title="아직 Push하지 않은 마지막 Commit만 취소하고 변경은 Staged 상태로 되돌립니다\."/);

  // Pull / Push & Risk badges
  assert.match(html, />Push 2<\/span>/);
  assert.match(html, /class="action-risk/);
  assert.match(html, /aria-label="위험도/);

  // Changes / SCM
  assert.match(html, /class="eyebrow">변경사항<\/div>/);
  assert.match(html, /class="scm-count">5개<\/span>/);
  assert.match(html, /class="group-title">Staged<\/span>/);
  assert.match(html, /title="전체 Unstage">전체 −<\/button>/);
  assert.match(html, /class="group-title">변경사항<\/span>/);
  assert.match(html, /title="전체 Stage">전체 \+<\/button>/);

  // Tree actions & titles
  assert.match(html, /title="폴더 전체 Stage"/);
  assert.match(html, /title="폴더 전체 Unstage"/);
  assert.match(html, /title="변경 내용 비교"/);
  assert.match(html, /title="파일 변경 되돌리기"/);
  assert.match(html, /title="Staging에 넣기"/);
  assert.match(html, /title="Staging에서 빼기"/);

  // Status badges
  assert.match(html, />수정<\/span>/);
  assert.match(html, />신규<\/span>/);
  assert.match(html, />삭제<\/span>/);
  assert.match(html, />충돌<\/span>/);
});

test("sidebar renders in English from the same state", () => {
  const state = createMockState();
  const notice = { ok: false, level: "warning", message: "Notice message", detail: "Details" };
  const html = renderSidebarHtml(state, notice, { locale: "en" });

  // HTML language attribute
  assert.match(html, /<html lang="en">/);

  // Header & tracking
  assert.match(html, /Ahead/);
  assert.match(html, /aria-label="View Graph" title="View Graph"/);
  assert.match(html, /aria-label="AI Diagnose" title="AI Diagnose"/);
  assert.match(html, /aria-label="Sync" title="Sync"/);
  assert.match(html, /aria-label="Git Tools" title="Git Tools"/);
  assert.match(html, /aria-label="Help" title="Help"/);

  // Tools panel
  assert.match(html, /aria-label="Branch tools"[^>]*>[\s\S]*?<span class="tool-title">Branch<\/span>/);
  assert.match(html, /aria-label="Tag tools"[^>]*>[\s\S]*?<span class="tool-title">Tag<\/span>/);
  assert.match(html, /aria-label="Stash tools"[^>]*>[\s\S]*?<span class="tool-title">Stash<\/span>/);
  assert.match(html, /aria-label="Git Doctor"[^>]*>[\s\S]*?<span class="tool-title">Doctor<\/span>/);
  assert.match(html, /aria-label="Recovery tools"[^>]*>[\s\S]*?<span class="tool-title">Recovery<\/span>/);
  assert.match(html, /aria-label="Safe Guard rules"[^>]*>[\s\S]*?<span class="tool-title">Safe Guard<\/span>/);

  // Worktree & relaxed rules notes
  assert.match(html, /1 other worktrees · feature · \/repo-feature/);
  assert.match(html, /Protections relaxed for session: pull-before-push/);

  // Safe Guard status
  assert.match(html, /aria-label="Safe Guard status: Warning"/);
  assert.match(html, /aria-label="Current status guidance: Commit local changes/);
  assert.match(html, /aria-label="View inspection details" title="View inspection details"/);

  // Next recommendation
  assert.match(html, /class="guard-recommendation-label">Next Recommendation<\/span>/);
  assert.match(html, /title="Recommended next action for current state: Stage All"/);
  assert.match(html, /class="guard-next-action"[^>]*>Stage All<\/button>/);

  // Commit & Undo
  assert.match(html, /placeholder="Enter commit message"/);
  assert.match(html, /aria-label="Commit message helper" title="Commit message helper"/);
  assert.match(html, />Commit<\/button>/);
  assert.match(html, />Undo last Commit<\/button>/);
  assert.match(html, /title="Undo only the last unpushed Commit and return changes to Staged state\."/);

  // Pull / Push & Risk badges
  assert.match(html, />Push 2<\/span>/);
  assert.match(html, /class="action-risk/);
  assert.match(html, /aria-label="Risk (Low|Medium|High):/);

  // Changes / SCM
  assert.match(html, /class="eyebrow">Changes<\/div>/);
  assert.match(html, /class="scm-count">5 items<\/span>/);
  assert.match(html, /class="group-title">Staged<\/span>/);
  assert.match(html, /title="Unstage All">All −<\/button>/);
  assert.match(html, /class="group-title">Changes<\/span>/);
  assert.match(html, /title="Stage All">All \+<\/button>/);

  // Tree actions & titles
  assert.match(html, /title="Stage entire folder"/);
  assert.match(html, /title="Unstage entire folder"/);
  assert.match(html, /title="Compare changes"/);
  assert.match(html, /title="Discard file changes"/);
  assert.match(html, /title="Stage"/);
  assert.match(html, /title="Unstage"/);

  // Status badges
  assert.match(html, />Modified<\/span>/);
  assert.match(html, />New<\/span>/);
  assert.match(html, />Deleted<\/span>/);
  assert.match(html, />Conflict<\/span>/);
});

test("sidebar empty state renders in Korean and English", () => {
  const emptyState = createMockState({ changes: [] });

  const koHtml = renderSidebarHtml(emptyState, null, { locale: "ko" });
  assert.match(koHtml, /class="scm-empty">변경사항이 없습니다\.<\/div>/);

  const enHtml = renderSidebarHtml(emptyState, null, { locale: "en" });
  assert.match(enHtml, /class="scm-empty">No changes\.<\/div>/);
});

test("Safe Guard details html renders in Korean and English", () => {
  const notice = { message: null, detail: "git status output" };

  const koDetails = renderSafeGuardDetailsHtml(notice, { locale: "ko" });
  assert.match(koDetails, /<html lang="ko">/);
  assert.match(koDetails, /실행된 검사 결과가 없습니다\./);
  assert.match(koDetails, /<h2>Git 상세 정보<\/h2>/);

  const enDetails = renderSafeGuardDetailsHtml(notice, { locale: "en" });
  assert.match(enDetails, /<html lang="en">/);
  assert.match(enDetails, /No inspection results available\./);
  assert.match(enDetails, /<h2>Git Details<\/h2>/);
});

test("contextual recommended actions follow the active locale", () => {
  const actionsToTest = [
    { kind: "unknown", ko: "원격 상태 새로고침", en: "Refresh remote status" },
    { kind: "remote-missing", ko: "브랜치 상태 확인", en: "Check branch status" },
    { kind: "pull-blocked-dirty", ko: "Stash로 보관", en: "Stash changes" },
  ];

  for (const { kind, ko, en } of actionsToTest) {
    const state = createMockState({ nextAction: { kind, title: "Action", detail: "" } });

    const koHtml = renderSidebarHtml(state, null, { locale: "ko" });
    assert.match(koHtml, new RegExp(`title="현재 상태에서 추천하는 다음 행동: ${ko}"`));

    const enHtml = renderSidebarHtml(state, null, { locale: "en" });
    assert.match(enHtml, new RegExp(`title="Recommended next action for current state: ${en}"`));
  }
});

test("active locale setting changes renderSidebarHtml output", () => {
  resetLocale();
  const state = createMockState({ changes: [] });

  // Default locale is ko
  const defaultHtml = renderSidebarHtml(state);
  assert.match(defaultHtml, /변경사항이 없습니다\./);

  // Set to en
  setLocale("en");
  const enHtml = renderSidebarHtml(state);
  assert.match(enHtml, /No changes\./);

  // Reset to ko
  resetLocale();
  const resetHtml = renderSidebarHtml(state);
  assert.match(resetHtml, /변경사항이 없습니다\./);
});

test("guard: no hardcoded Korean user-facing strings remain in sidebar-view.mts template markup", () => {
  const source = readFileSync(new URL("../src/sidebar-view.mts", import.meta.url), "utf8");

  // In renderSidebarHtml and renderSafeGuardDetailsHtml template bodies,
  // assert that common previously hardcoded strings are no longer present as raw string literals.
  const forbiddenRawStrings = [
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
    'title="폴더 전체 Stage"',
    'title="폴더 전체 Unstage"',
    'title="변경 내용 비교"',
    'title="파일 변경 되돌리기"',
    'title="Staging에 넣기"',
    'title="Staging에서 빼기"',
    'placeholder="Commit message 입력"',
    'aria-label="Commit 메시지 도우미"',
    '>마지막 Commit 취소<',
    'title="아직 Push하지 않은 마지막 Commit만 취소',
    '<div class="eyebrow">변경사항</div>',
    '<div class="scm-empty">변경사항이 없습니다.</div>',
    'title="전체 Stage">전체 +<',
    'title="전체 Unstage">전체 −<',
    'Safe Guard 상태: ',
    '현재 상태 안내: ',
    '다음 추천</span>',
    '현재 상태에서 추천하는 다음 행동: ',
    '<h2>Git 상세 정보</h2>',
    '<html lang="ko">',
  ];

  for (const str of forbiddenRawStrings) {
    assert.ok(
      !source.includes(str),
      `Hardcoded string "${str}" was found in src/sidebar-view.mts, must use i18n`,
    );
  }
});

test("guard: English rendering contains no untranslated Korean text in UI chrome", () => {
  const state = createMockState({
    branch: "main",
    upstream: "origin/main",
    changes: [
      { status: "M ", path: "src/file1.ts" },
      { status: "??", path: "src/file2.ts" },
    ],
    nextAction: { kind: "dirty", title: "Action title", detail: "Action detail" },
  });

  const html = renderSidebarHtml(state, null, { locale: "en" });

  // Extract all attribute values and text contents from UI chrome (excluding script and style)
  const bodyOnly = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");

  // Match all tags and their text
  const koreanRegex = /[\uac00-\ud7a3]/g;
  const koreanMatches = bodyOnly.match(koreanRegex);

  assert.equal(
    koreanMatches,
    null,
    `English UI should not contain Korean characters, found: ${koreanMatches?.join(", ")}`,
  );
});
