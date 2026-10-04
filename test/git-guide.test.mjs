import assert from "node:assert/strict";
import test from "node:test";

import { classifyGuide, renderGuideHtml } from "../src/git-guide.mjs";

test("classifies common pull and push recovery situations", () => {
  assert.equal(classifyGuide({ action: "pull", code: "dirty-working-tree" }), "dirty-pull");
  assert.equal(classifyGuide({ action: "pull", code: "pull-conflict" }), "pull-conflict");
  assert.equal(classifyGuide({ action: "push", detail: "rejected non-fast-forward" }), "push-rejected");
  assert.equal(classifyGuide({ action: "push", code: "diverged" }), "diverged");
  assert.equal(classifyGuide({ action: "pull", code: "no-upstream" }), "no-upstream");
  assert.equal(classifyGuide({ action: "pull", code: "remote-history-rewritten" }), "remote-rewritten");
  assert.equal(classifyGuide({ action: "pull", code: "merge-in-progress" }), "merge-in-progress");
});

test("renders human-readable merge conflict marker guide", () => {
  const html = renderGuideHtml("pull-conflict");

  assert.match(html, /상황별 Git 가이드/);
  assert.match(html, /내 변경/);
  assert.match(html, /서버에서 들어온 변경/);
  assert.match(html, /&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD/);
  assert.match(html, /HEAD.*서버 이름이 아니라/s);
  assert.match(html, /이유를 모른 채 Force Push/);
});


test("explains partial-file commits through VS Code Source Control", () => {
  const html = renderGuideHtml("partial-stage");
  assert.match(html, /파일 일부만 Commit/);
  assert.match(html, /VS Code Source Control/);
  assert.match(html, /Staged Changes/);
  assert.match(html, /선택하지 않은 변경은 작업 폴더에 남아요/);
});
