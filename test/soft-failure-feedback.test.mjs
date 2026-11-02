import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/panel-handlers.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/sync-handler.ts", import.meta.url), "utf8");

test("busy webview clicks surface a soft notice instead of silent return", () => {
  assert.match(core, /noteSoftFailure\("common\.actionBusy"\)/);
  assert.match(core, /function noteSoftFailure/);
});

test("refresh failures notify instead of empty catch", () => {
  assert.match(panel, /noteSoftFailure\(\)/);
  assert.doesNotMatch(panel, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  assert.match(sync, /noteSoftFailure\(\)/);
  assert.doesNotMatch(sync, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});
