import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const syncSource = readFileSync(new URL("../src/sync-handler.ts", import.meta.url), "utf8");
const handlerSource = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../src/sidebar-interactions.mts", import.meta.url), "utf8");
const graphSource = readFileSync(new URL("../src/graph-interactions.mts", import.meta.url), "utf8");

test("sync movement preview has no artificial per-commit delay", () => {
  assert.doesNotMatch(syncSource, /setTimeout\(resolve,\s*220\)/);
  assert.doesNotMatch(syncSource, /setTimeout\(resolve,\s*400\)/);
  assert.match(syncSource, /for \(const commit of visible\)/);
});

test("push and pull show immediate pending state in sidebar and graph", () => {
  for (const source of [sidebarSource, graphSource]) {
    assert.match(source, /syncPendingAction/);
    assert.match(source, /button\.disabled = Boolean\(syncPendingAction\)/);
    assert.match(source, /Push 중\.\.\./);
    assert.match(source, /Pull 중\.\.\./);
    assert.match(source, /gitnext:refresh/);
  }
});

test("sync requests are serialized per repository and pending always clears", () => {
  assert.match(handlerSource, /const syncActionsInFlight = new Set<string>\(\)/);
  assert.match(handlerSource, /syncActionsInFlight\.has\(cwd\)/);
  assert.match(handlerSource, /syncActionsInFlight\.add\(cwd\)/);
  assert.match(handlerSource, /finally \{/);
  assert.match(handlerSource, /syncActionsInFlight\.delete\(cwd\)/);
  assert.match(handlerSource, /type: "syncPending", action, pending: false/);
  assert.match(handlerSource, /pull: async \(\) => runSyncOnce\("pull"\)/);
  assert.match(handlerSource, /push: async \(\) => runSyncOnce\("push"\)/);
});
