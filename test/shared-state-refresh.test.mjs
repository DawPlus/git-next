import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coreSource = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const hostSource = readFileSync(new URL("../src/webview-host.ts", import.meta.url), "utf8");

test("repository state loads are deduplicated only while in flight", () => {
  assert.match(coreSource, /const stateLoadsInFlight = new Map\(\)/);
  assert.match(coreSource, /const existing = stateLoadsInFlight\.get\(cwd\)/);
  assert.match(coreSource, /return existing\.promise/);
  assert.match(coreSource, /stateLoadsInFlight\.set\(cwd, \{ generation, promise \}\)/);
  assert.match(coreSource, /stateLoadsInFlight\.delete\(cwd\)/);
  assert.doesNotMatch(coreSource, /resolvedStateCache/);
});

test("mutations invalidate shared state before and after execution", () => {
  const fn = hostSource.slice(
    hostSource.indexOf("async function runInternalGitOperation"),
    hostSource.indexOf("async function refreshWebviewHosts"),
  );
  const invalidations = fn.match(/invalidateSharedStateLoad\(cwd\)/g) ?? [];
  assert.equal(invalidations.length, 2);
  assert.ok(fn.indexOf("invalidateSharedStateLoad(cwd)") < fn.indexOf("return await action()"));
  assert.ok(fn.lastIndexOf("invalidateSharedStateLoad(cwd)") > fn.indexOf("return await action()"));
});

test("repository-root changes clean removed snapshots and failed reads are retryable", () => {
  assert.match(coreSource, /repositorySnapshots\.delete\(root\)/);
  assert.match(coreSource, /stateLoadGenerations\.delete\(root\)/);
  assert.match(coreSource, /finally \{/);
  assert.match(coreSource, /current\?\.generation === generation/);
});
