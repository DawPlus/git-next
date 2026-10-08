import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("all refresh buttons react immediately and retain busy state through rerenders", () => {
  const code = read("../src/sidebar-interactions.mts");
  assert.match(code, /querySelectorAll\(/);
  assert.match(code, /refreshPending/);
  assert.match(code, /refreshPending = true;\s*applyRefreshPending\(\);\s*vscode.postMessage\(message\)/);
  assert.match(code, /event\.data\?\.type === "refreshPending"/);
  assert.match(code, /gitnext:refresh", \(\) => \{ applySyncPending\(\); applyRefreshPending\(\); \}/);
});

test("refresh completion and error both release the busy indicator", () => {
  const handler = read("../src/webview-message-handler.ts");
  assert.match(handler, /refreshActionsInFlight\.add\(key\)/);
  assert.match(handler, /finally \{\s*refreshActionsInFlight\.delete\(key\)/);
  assert.match(handler, /type: "refreshPending", pending: false/);
  const view = read("../src/sidebar-view.mts");
  assert.match(view, /button\[data-action="refresh"\]\.is-refreshing svg/);
  assert.match(view, /button\.guard-next-action\.is-refreshing::before/);
});
