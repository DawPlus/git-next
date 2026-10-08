import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const syncSource = readFileSync(new URL("../src/sync-handler.ts", import.meta.url), "utf8");
const preflightSource = readFileSync(new URL("../src/git-preflight.mts", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../src/git-operation-workflows.mts", import.meta.url), "utf8");

test("sync flow reuses preflight state only before mutation", () => {
  assert.match(preflightSource, /beforeSnapshot:/);
  assert.match(syncSource, /preflight\.beforeSnapshot\?\.tracking/);
  assert.match(syncSource, /const before = tracking;/);
  assert.match(syncSource, /preflight\.beforeSnapshot\?\.branch/);
  assert.match(syncSource, /const tracking = pullBeforePush \? await getTrackingStatus\(cwd\) : null/);
});

test("impact preview reuses the preflight upstream without another ref lookup", () => {
  assert.match(syncSource, /confirmImpactPreview\(host, mode, options, cwd, "pull", preflight\.beforeSnapshot\)/);
  assert.match(syncSource, /confirmImpactPreview\(host, mode, options, cwd, "push", preflight\.beforeSnapshot\)/);
  assert.match(workflowSource, /knownUpstream !== undefined \? Promise\.resolve/);
});

test("state-delta wrapper can accept partial pre-action state but always reads fresh post-action state", () => {
  assert.match(workflowSource, /beforeSnapshot\?: Partial<StateSnapshot>/);
  assert.match(workflowSource, /snapshot\(beforeSnapshot \?\? \{\}\)/);
  assert.match(workflowSource, /const after = await traceAsync\("action:state-after", cwd, \(\) => snapshot\(\)\)/);
});

test("sync mutations do not pass old preflight snapshots across user confirmation", () => {
  assert.doesNotMatch(syncSource, /runWithGitStateDelta\([^\n]+beforeSnapshot/);
});
