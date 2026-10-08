import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coreSource = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/panel-handlers.ts", import.meta.url), "utf8");
const messageSource = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");

test("working-tree refresh updates only cached change-derived state", () => {
  const fn = coreSource.slice(
    coreSource.indexOf("async function refreshWorkingTreeState"),
    coreSource.indexOf("async function getState"),
  );
  assert.match(fn, /getWorkingTreeChanges\(cwd\)/);
  assert.match(fn, /setCachedWorkingTreeChanges\(cwd, changes\)/);
  assert.doesNotMatch(fn, /getRepositoryState/);
  assert.doesNotMatch(fn, /getLinkedWorktrees/);
  assert.doesNotMatch(fn, /getTrackingStatus/);
});

test("Changes workspace renders from cached changes and follows external Git state changes", () => {
  const fn = panelSource.slice(
    panelSource.indexOf("async function openChangesPanel"),
    panelSource.indexOf("async function openLocalRemoteDiff"),
  );
  assert.match(fn, /renderChangesWorkspace\(toChangeWorkspace\(state\.changes/);
  assert.doesNotMatch(fn, /getChangeWorkspace\(cwd\)/);
  assert.match(fn, /repository\.state(?:\?\.)?\.onDidChange/);
  assert.match(fn, /refreshWorkingTreeState\(currentCwd\)/);
});

test("folder stage cache action updates descendants, not only an exact filename", () => {
  const fn = coreSource.slice(
    coreSource.indexOf("async function applyWorkingTreeCacheAction"),
    coreSource.indexOf("async function refreshWorkingTreeState"),
  );
  assert.match(fn, /change\.path\.startsWith/);
  assert.match(fn, /targetPath\.replace/);
});

test("sidebar stage mutations update cached working-tree state without a blocking rescan", () => {
  const fn = messageSource.slice(
    messageSource.indexOf("async function updateSidebarStage"),
    messageSource.indexOf("async function updateGraphOptions"),
  );
  const scopes = fn.match(/refresh: "none"/g) ?? [];
  assert.equal(scopes.length, 2);
  assert.match(fn, /applyWorkingTreeCacheAction/);
  assert.doesNotMatch(fn, /refreshWorkingTreeState/);
});
