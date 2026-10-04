import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { explainGitError } from "../src/git-actions.mjs";
import { getPushGuidance } from "../src/git-safety.mjs";
import { renderGraphHtml } from "../src/graph-view.mjs";

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
