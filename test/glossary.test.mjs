import assert from "node:assert/strict";
import test from "node:test";

import { renderGlossaryHtml } from "../src/glossary-view.mjs";
import { renderSafeGuardDetailsHtml, renderSidebarHtml } from "../src/sidebar-view.mjs";

test("renders Korean Git terminology guide", () => {
  const html = renderGlossaryHtml();

  for (const term of ["HEAD", "Rebase", "Force Push", "Stash", "Cherry-pick", "Revert", "Diverged"]) {
    assert.match(html, new RegExp(term, "i"));
  }
  assert.match(html, /용어 검색/);
  assert.match(html, /어디가 바뀌는지/);
  assert.match(html, /파일 수정을 내 로컬 Git 기록에 저장해요/);
  assert.match(html, /원격 저장소는 아직 안 바뀌어요/);
  assert.match(html, /class="grid"/);
  assert.match(html, /class="flow-actor actor-a/);
  assert.match(html, /class="flow-peer actor-b actor-/);
  assert.match(html, /class="semantic-mark"/);
  assert.match(html, /class="flow-icon"/);
  assert.match(html, /flow-node work/);
  assert.match(html, /flow-node remote/);
  assert.match(html, /term:hover/);
  assert.match(html, /term:active/);
  assert.match(html, /stroke-width:1\.7/);
  assert.match(html, /font-size:13px/);
  for (const animation of ["commit","push","pull","fetch","branch","head","detached","merge","conflict","rebase","stash","cherry-pick","revert","reset","tag","upstream","ahead-behind","diverged","force-push"]) {
    assert.match(html, new RegExp(`semantic-${animation}`));
  }
  assert.match(html, /@keyframes semConflictA/);
  assert.match(html, /@keyframes semRebaseFirst/);
  assert.match(html, /@keyframes semForce/);
  assert.match(html, /prefers-reduced-motion/);
});

test("sidebar exposes source control, terminology, and repository tool actions", () => {
  const html = renderSidebarHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: null,
    refs: [],
    commits: [],
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" },
    pullBeforePush: false,
  });

  assert.match(html, /data-action="openKnowledge"/);
  assert.match(html, /도움말/);
  assert.match(html, /변경사항/);
  assert.match(html, /data-action="sidebarCommit"/);
  assert.match(html, /data-toggle-tools/);
  assert.match(html, /data-action="branchMenu"/);
  assert.match(html, /data-action="tagMenu"/);
  assert.match(html, /data-action="stashMenu"/);
  assert.match(html, /data-action="openKnowledge"/);
  assert.match(html, /class="tool-grid"/);
  assert.match(html, /class="tool-icon"/);
  for (const label of ["그래프 보기", "동기화 도움말", "Git 도구", "도움말"]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
  assert.match(html, /\[origin\/main\]/);
  assert.match(html, /받기 · Pull/);
  assert.match(html, /보내기 · Push/);
  assert.match(html, /<svg viewBox="0 0 24 24">/);
});

test("sidebar links Safe Guard result to separate details view", () => {
  const html = renderSidebarHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: null,
    refs: [],
    commits: [],
    tracking: { kind: "diverged", ahead: 1, behind: 1, upstream: "origin/main" },
    pullBeforePush: false,
  }, {
    ok: false,
    level: "blocked",
    message: "Pull하면 충돌할 수 있습니다.",
    detail: "영향 파일: src/a.js",
    guideKey: "pull-conflict",
  });

  assert.match(html, /data-action="openSafeGuard"/);
  assert.match(html, /class="guard-message-button has-notice"/);
  assert.doesNotMatch(html, /<details>/);
  assert.doesNotMatch(html, /이 상황 해결 방법/);

  const details = renderSafeGuardDetailsHtml({ message: "Pull하면 충돌할 수 있습니다.", detail: "영향 파일: src/a.js" });
  assert.match(details, /Git 상세 정보/);
  assert.match(details, /영향 파일: src\/a\.js/);
});
