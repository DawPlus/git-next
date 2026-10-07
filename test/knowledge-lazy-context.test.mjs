import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("../src/panel-handlers.ts", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("../src/workspace-views.mts", import.meta.url), "utf8");

test("knowledge panel renders before live repository context resolves", () => {
  const fn = panelSource.slice(panelSource.indexOf("async function openKnowledgePanel"), panelSource.indexOf("async function openGuidePanel"));
  assert.match(fn, /setWebviewHtml\(panel\.webview, renderKnowledgeCenter/);
  assert.match(fn, /traceAsync\("help:live-context"/);
  assert.ok(fn.indexOf("setWebviewHtml") < fn.indexOf('traceAsync("help:live-context"'));
  assert.doesNotMatch(fn, /await traceAsync\("help:live-context"/);
});

test("knowledge help reads repository context through the shared snapshot store", () => {
  const fn = panelSource.slice(panelSource.indexOf("async function openKnowledgePanel"), panelSource.indexOf("async function openGuidePanel"));
  assert.match(fn, /traceAsync\("help:live-context", cwd, \(\) => getState\(cwd\)\)/);
  assert.doesNotMatch(fn, /getHeadSafety/);
  assert.doesNotMatch(fn, /getTrackingStatus/);
  assert.doesNotMatch(fn, /getWorkingTreeChanges/);
  assert.doesNotMatch(fn, /inspectCurrentUpstream/);
});

test("knowledge live context updates only repository-aware sections", () => {
  assert.match(panelSource, /type: "knowledgeLiveContext"/);
  assert.match(viewSource, /data-live-term/);
  assert.match(viewSource, /data-scenario-id/);
  assert.match(viewSource, /knowledgeLiveContext/);
  assert.match(viewSource, /data-live-status/);
});
