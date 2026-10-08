import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const host = readFileSync(new URL("../src/webview-host.ts", import.meta.url), "utf8");
const handler = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");

test("recent internal Stage echoes are checked against actual Git state before skipping full refresh", () => {
  assert.match(host, /recentInternalStageRoots\.get\(root\)/);
  assert.match(host, /Date\.now\(\) - marker > 1000/);
  assert.match(host, /head\.commit !== cached\.head \|\| head\.name !== cached\.branch/);
  assert.match(host, /getWorkingTreeChanges\(root\)/);
  assert.match(host, /signature\(actual\) === signature\(cached\.changes/);
  assert.match(host, /if \(await isUnchangedInternalStageEcho\(item\)\) return false;/);
  assert.match(host, /results\.some\(\(result\) => result\.status !== "fulfilled" \|\| result\.value !== false\)/);
  assert.match(host, /await refreshState\(item, \{ maxAgeMs: 250 \}\)/);
});

test("external refresh events arriving during an active scan are coalesced into a follow-up pass", () => {
  assert.match(host, /let externalGitRefreshInFlight = false/);
  assert.match(host, /if \(externalGitRefreshInFlight\) return/);
  assert.match(host, /externalGitRefreshInFlight = true/);
  assert.match(host, /externalGitRefreshInFlight = false/);
  assert.match(host, /if \(externalGitRefreshRoots\.size\) scheduleExternalGitRefresh\(\)/);
});

test("successful individual and folder Stage/Unstage record internal mutation after cache update", () => {
  assert.equal((handler.match(/markInternalStage\(root\);/g) ?? []).length, 2);
  assert.match(handler, /applyWorkingTreeCacheAction\(cwd, \{/);
});
