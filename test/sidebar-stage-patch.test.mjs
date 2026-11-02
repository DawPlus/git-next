import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderSidebarHtml, renderSidebarStagePatch } from "../src/sidebar-view.mts";

const core = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const handler = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");

function sampleState(extra = {}) {
  return {
    kind: "repository",
    branch: "main",
    upstream: "origin/main",
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" },
    changes: [
      { path: "src/a.ts", status: " M" },
      { path: "src/b.ts", status: "M " },
    ],
    nextAction: { kind: "dirty", title: "Commit할 변경이 있어요", detail: "Staging을 확인하세요." },
    ...extra,
  };
}

test("stage patch extracts SCM groups and status hints without full document", () => {
  const patch = renderSidebarStagePatch(sampleState());
  assert.ok(patch);
  assert.match(patch.scmGroupsHtml, /data-area="staged"/);
  assert.match(patch.scmGroupsHtml, /data-area="unstaged"/);
  assert.match(patch.scmGroupsHtml, /src\/a\.ts|a\.ts/);
  assert.match(patch.statusHintsHtml, /Safe Guard|guard-summary/);
  assert.match(patch.scmCountLabel, /2|변경/);
  assert.doesNotMatch(patch.scmGroupsHtml, /<!doctype html>/i);
});

test("full sidebar still exposes patch roots for client surgical refresh", () => {
  const html = renderSidebarHtml(sampleState());
  assert.match(html, /data-scm-patch-root/);
  assert.match(html, /data-status-hints-patch/);
  assert.match(html, /data-scm-count/);
  assert.match(html, /<!--scm-patch-start-->/);
  assert.match(html, /<!--status-hints-start-->/);
});

test("one-file stage uses surgical SCM refresh before full main replace", () => {
  assert.match(core, /gitNextScmRefresh/);
  assert.match(core, /data-scm-patch-root/);
  assert.match(core, /async function renderSidebarStagePatch/);
  assert.match(handler, /renderSidebarStagePatch\(host, cwd, notice\)/);
  assert.match(handler, /if \(result\.ok && mode === "sidebar"\)/);
});

test("stage-all and error paths keep full renderPanel fallback available", () => {
  const stageAll = handler.slice(
    handler.indexOf("async function updateSidebarStageAll"),
    handler.indexOf("async function updateGraphOptions"),
  );
  assert.match(stageAll, /renderPanel\(host, result, mode, getOptions\(\)\)/);
  assert.doesNotMatch(stageAll, /renderSidebarStagePatch/);
});
