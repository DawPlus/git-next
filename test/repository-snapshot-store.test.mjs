import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coreSource = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const hostSource = readFileSync(new URL("../src/webview-host.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/panel-handlers.ts", import.meta.url), "utf8");
const messageSource = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");

test("initialized repository UI reads cached snapshots before refreshing", () => {
  assert.match(coreSource, /const repositorySnapshots = new Map\(\)/);
  assert.match(coreSource, /function getCachedState\(cwd\)/);
  assert.match(coreSource, /return getCachedState\(cwd\) \?\? refreshState\(cwd\)/);
});

test("snapshot generations are isolated per repository", () => {
  assert.match(coreSource, /const stateLoadGenerations = new Map\(\)/);
  assert.match(coreSource, /getStateLoadGeneration\(cwd\)/);
  assert.doesNotMatch(coreSource, /let stateLoadGeneration = 0/);
});

test("mutation boundary refreshes snapshot before subsequent UI render", () => {
  const fn = hostSource.slice(
    hostSource.indexOf("async function runInternalGitOperation"),
    hostSource.indexOf("async function refreshWebviewHosts"),
  );
  assert.match(fn, /invalidateSharedStateLoad\(cwd\)/);
  assert.match(fn, /await refreshState\(cwd\)\.catch/);
  assert.ok(fn.indexOf("return await action()") < fn.indexOf("await refreshState(cwd)"));
});

test("external Git refresh bursts reuse very recent snapshots", () => {
  assert.match(hostSource, /refreshState\(item, \{ maxAgeMs: 250 \}\)/);
  assert.match(panelSource, /refreshState\(cwd, \{ maxAgeMs: 250 \}\)/);
});

test("Branch and Help surfaces read repository state through the shared store", () => {
  const branch = panelSource.slice(
    panelSource.indexOf("async function openBranchWorkspace"),
    panelSource.indexOf("async function openStashWorkspace"),
  );
  const help = panelSource.slice(
    panelSource.indexOf("async function openKnowledgePanel"),
    panelSource.indexOf("async function openGuidePanel"),
  );
  assert.match(branch, /await getState\(cwd\)/);
  assert.doesNotMatch(branch, /getBranchRepositoryState/);
  assert.match(help, /\(\) => getState\(cwd\)/);
  assert.doesNotMatch(help, /getTrackingStatus/);
});

test("Commit runs inside the mutation boundary so Safe Guard sees refreshed state", () => {
  const commit = messageSource.slice(
    messageSource.indexOf("sidebarCommit: async"),
    messageSource.indexOf("sidebarUndoCommit: async"),
  );
  assert.match(commit, /runInternalGitOperation/);
  assert.match(commit, /runWithGitStateDelta/);
});
