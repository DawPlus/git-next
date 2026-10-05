import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { explainGitError } from "../src/git-actions.mts";
import { getPushGuidance } from "../src/git-safety.mts";
import { renderGraphHtml } from "../src/graph-view.mts";
import { renderSidebarHtml } from "../src/sidebar-view.mts";

test("사용자 노출 UI가 한글을 기본으로 사용한다", () => {
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
  assert.equal((html.match(/class="tool-button"/g) ?? []).length, 6);
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
