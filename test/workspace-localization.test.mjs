import assert from "node:assert/strict";
import test from "node:test";

import {
  renderChangesWorkspace,
  renderCompareWorkspace,
  renderBranchWorkspace,
  renderStashWorkspace,
  renderCommitDetailsWorkspace,
} from "../src/workspace-views.mts";
import {
  setLocale,
  resetLocale,
} from "../src/i18n.mts";
import { workspace as koWorkspace } from "../src/locales/ko/workspace.mts";
import { workspace as enWorkspace } from "../src/locales/en/workspace.mts";

test("locale dictionaries: ko and en workspace dictionary keys match 100%", () => {
  function getDeepKeys(obj, prefix = "") {
    return Object.keys(obj).flatMap((key) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        return getDeepKeys(obj[key], fullPath);
      }
      return [fullPath];
    });
  }

  const koKeys = getDeepKeys(koWorkspace).sort();
  const enKeys = getDeepKeys(enWorkspace).sort();
  assert.deepEqual(koKeys, enKeys, "All workspace keys must exist in both ko and en");
});

test("changes workspace renders in Korean and English", () => {
  const data = {
    files: [],
    staged: [{ status: "M ", path: "staged.js", staged: true, unstaged: false }],
    unstaged: [{ status: "??", path: "untracked.js", untracked: true, staged: false, unstaged: true }],
  };

  // Korean
  const koHtml = renderChangesWorkspace(data, null, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /변경사항 · Commit/);
  assert.match(koHtml, /Staged · Commit에 포함/);
  assert.match(koHtml, /변경사항 · 아직 미포함/);
  assert.match(koHtml, /신규/);
  assert.match(koHtml, /Staging에서 빼기/);
  assert.match(koHtml, /Staging에 넣기/);
  assert.match(koHtml, /비교/);
  assert.match(koHtml, /되돌리기/);
  assert.match(koHtml, /새로고침/);
  assert.match(koHtml, /Commit 만들기/);
  assert.match(koHtml, /마지막 로컬 Commit 취소/);
  assert.match(koHtml, /Commit은 현재 Staged 파일만 포함합니다/);

  // English
  const enHtml = renderChangesWorkspace(data, null, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Changes · Commit/);
  assert.match(enHtml, /Staged · Included in Commit/);
  assert.match(enHtml, /Changes · Not staged yet/);
  assert.match(enHtml, /New/);
  assert.match(enHtml, /Remove from staging/);
  assert.match(enHtml, /Add to staging/);
  assert.match(enHtml, /Diff/);
  assert.match(enHtml, /Discard/);
  assert.match(enHtml, /Refresh/);
  assert.match(enHtml, /Create Commit/);
  assert.match(enHtml, /Undo last local commit/);
  assert.match(enHtml, /Commit includes only currently staged files/);
});

test("compare workspace renders in Korean and English", () => {
  const comparison = {
    ok: true,
    upstream: "origin/main",
    files: [
      { path: "shared.js", scope: "both", localStatus: "M", remoteStatus: "M" },
      { path: "local.js", scope: "local", localStatus: "M", remoteStatus: null },
      { path: "remote.js", scope: "remote", localStatus: null, remoteStatus: "A" },
    ],
  };

  // Korean
  const koHtml = renderCompareWorkspace(comparison, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /양쪽에서 변경/);
  assert.match(koHtml, /로컬에서만 변경/);
  assert.match(koHtml, /Remote에서만 변경/);
  assert.match(koHtml, /Remote 새로고침/);
  assert.match(koHtml, /최신 origin\/main과 현재 로컬 상태를 읽기 전용으로 비교합니다/);

  // English
  const enHtml = renderCompareWorkspace(comparison, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Changed on both sides/);
  assert.match(enHtml, /Changed only in local/);
  assert.match(enHtml, /Changed only in remote/);
  assert.match(enHtml, /Refresh Remote/);
  assert.match(enHtml, /Read-only comparison of current local state with latest origin\/main/);
});

test("branch workspace renders in Korean and English", () => {
  const state = {
    branch: "main",
    tracking: { kind: "ahead" },
    refs: [
      { name: "main", kind: "local", upstream: "origin/main" },
      { name: "feature", kind: "local", upstream: null },
      { name: "origin/main", kind: "remote", upstream: null },
    ],
  };

  // Korean
  const koHtml = renderBranchWorkspace(state, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /Local · 내 작업 공간/);
  assert.match(koHtml, /Remote 보호 영역/);
  assert.match(koHtml, /여기는 로컬에서 직접 수정하지 않아요/);
  assert.match(koHtml, /Push하면 원격에 반영됩니다/);
  assert.match(koHtml, /현재 작업/);
  assert.match(koHtml, /원격 브랜치 origin\/main와 연결됨/);
  assert.match(koHtml, /로컬에만 있는 브랜치/);
  assert.match(koHtml, /원격 저장소의 브랜치/);
  assert.match(koHtml, /동기화 · Push 필요/);
  assert.match(koHtml, /원격 새로고침/);
  assert.match(koHtml, /선택한 브랜치/);
  assert.match(koHtml, /브랜치를 선택하세요/);
  assert.match(koHtml, /이 브랜치로 이동/);
  assert.match(koHtml, /로컬로 가져오기/);

  // English
  const enHtml = renderBranchWorkspace(state, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Local · Working space/);
  assert.match(enHtml, /Remote protected area/);
  assert.match(enHtml, /Cannot be edited directly in local/);
  assert.match(enHtml, /Work in Local and push to update remote/);
  assert.match(enHtml, /Current/);
  assert.match(enHtml, /Connected to remote branch origin\/main/);
  assert.match(enHtml, /Local branch only/);
  assert.match(enHtml, /Branch on remote repository/);
  assert.match(enHtml, /Sync · Push needed/);
  assert.match(enHtml, /Refresh Remote/);
  assert.match(enHtml, /Selected branch/);
  assert.match(enHtml, /Select a branch/);
  assert.match(enHtml, /Switch to this branch/);
  assert.match(enHtml, /Track in local/);
});

test("stash workspace renders educational copy in both Korean and English", () => {
  const stashes = [
    { ref: "stash@{0}", message: "wip", relative: "1 minute ago" },
  ];
  const details = {
    ref: "stash@{0}",
    stat: "1 file changed",
    files: [{ status: "M", path: "app.js" }],
    overlap: ["app.js"],
  };

  // Korean
  const koHtml = renderStashWorkspace(stashes, details, null, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /Apply \/ Pop \/ Drop 차이/);
  assert.match(koHtml, /<strong>Apply<\/strong> · 변경을 작업 폴더에 꺼내지만 Stash는 그대로 남깁니다/);
  assert.match(koHtml, /<strong>Pop<\/strong> · 변경을 꺼내고, 성공하면 그 Stash를 목록에서 제거합니다/);
  assert.match(koHtml, /<strong>Drop<\/strong> · 변경을 꺼내지 않고 Stash만 영구 삭제합니다/);
  assert.match(koHtml, /Pop 후에도 <code>stash@\{0\}<\/code>이 보일 수 있어요/);
  assert.match(koHtml, /번호가 당겨져 그 항목이 새 <code>stash@\{0\}<\/code>이 됩니다/);
  assert.match(koHtml, /Apply · 복원 후 보관 유지/);
  assert.match(koHtml, /Pop · 복원 후 제거/);
  assert.match(koHtml, /Drop · 보관본 삭제/);
  assert.match(koHtml, /현재 변경과 겹치는 파일 1개: app\.js/);

  // English
  const enHtml = renderStashWorkspace(stashes, details, null, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Differences between Apply \/ Pop \/ Drop/);
  assert.match(enHtml, /<strong>Apply<\/strong> · Restores changes to working directory while keeping the stash intact/);
  assert.match(enHtml, /<strong>Pop<\/strong> · Restores changes and removes the stash from list on success/);
  assert.match(enHtml, /<strong>Drop<\/strong> · Permanently deletes the stash without restoring changes/);
  assert.match(enHtml, /You may still see <code>stash@\{0\}<\/code> after Pop/);
  assert.match(enHtml, /older stashes will be renumbered, making the next item the new <code>stash@\{0\}<\/code>/);
  assert.match(enHtml, /Apply · Restore and keep stash/);
  assert.match(enHtml, /Pop · Restore and remove/);
  assert.match(enHtml, /Drop · Delete stash/);
  assert.match(enHtml, /1 file\(s\) overlap with current changes: app\.js/);
});

test("commit detail workspace renders in Korean and English", () => {
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

  // Korean
  const koHtml = renderCommitDetailsWorkspace(details, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /Commit 상세/);
  assert.match(koHtml, /← 그래프로 돌아가기/);
  assert.match(koHtml, /그래프에서 선택한 Commit이 실제로 바꾼 파일을 확인합니다/);
  assert.match(koHtml, /변경 파일/);
  assert.match(koHtml, /Parent · <code>1234567890<\/code>/);

  // English
  const enHtml = renderCommitDetailsWorkspace(details, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Commit Details/);
  assert.match(enHtml, /← Back to graph/);
  assert.match(enHtml, /Inspect files actually modified by the commit selected in graph/);
  assert.match(enHtml, /Changed files/);
  assert.match(enHtml, /Parent · <code>1234567890<\/code>/);
});

test("empty and notice states render in both locales", () => {
  // Changes empty
  const koChangesEmpty = renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, { message: "알림" }, { locale: "ko" });
  assert.match(koChangesEmpty, /아직 Staging된 파일이 없습니다/);
  assert.match(koChangesEmpty, /추가로 선택할 변경사항이 없습니다/);

  const enChangesEmpty = renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, { message: "Notice" }, { locale: "en" });
  assert.match(enChangesEmpty, /No staged files yet/);
  assert.match(enChangesEmpty, /No more changes to select/);

  // Compare empty
  const koCompareEmpty = renderCompareWorkspace({ ok: false, message: "저장소 없음", detail: "상세" }, { locale: "ko" });
  assert.match(koCompareEmpty, /저장소 없음/);

  const enCompareEmpty = renderCompareWorkspace({ ok: true, upstream: "origin/main", files: [] }, { locale: "en" });
  assert.match(enCompareEmpty, /None/);

  // Branch empty
  const koBranchEmpty = renderBranchWorkspace({ branch: null, refs: [] }, { locale: "ko" });
  assert.match(koBranchEmpty, /로컬 브랜치가 없습니다/);
  assert.match(koBranchEmpty, /표시할 원격 브랜치가 없습니다/);

  const enBranchEmpty = renderBranchWorkspace({ branch: null, refs: [] }, { locale: "en" });
  assert.match(enBranchEmpty, /No local branches/);
  assert.match(enBranchEmpty, /No remote branches to display/);

  // Stash empty
  const koStashEmpty = renderStashWorkspace([], null, null, { locale: "ko" });
  assert.match(koStashEmpty, /저장된 Stash가 없습니다/);

  const enStashEmpty = renderStashWorkspace([], null, null, { locale: "en" });
  assert.match(enStashEmpty, /No saved stashes/);

  // Commit details empty/failed
  const koCommitFail = renderCommitDetailsWorkspace({ ok: false }, { locale: "ko" });
  assert.match(koCommitFail, /커밋 정보를 읽지 못했습니다/);

  const enCommitFail = renderCommitDetailsWorkspace({ ok: false }, { locale: "en" });
  assert.match(enCommitFail, /Could not read commit information/);
});

test("narrow layout styles accommodate longer English text", () => {
  const enBranch = renderBranchWorkspace({ branch: "main", refs: [] }, { locale: "en" });
  // Verify CSS contains overflow handling and responsive layout
  assert.match(enBranch, /overflow-wrap:\s*break-word/i);
  assert.match(enBranch, /@media\(max-width:720px\)/);
});
