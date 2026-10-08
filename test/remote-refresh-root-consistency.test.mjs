import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/git-tracking.mts", import.meta.url), "utf8");

test("remote refresh marks freshness under repository root used by snapshot inspection", () => {
  const start = source.indexOf("export async function refreshRemoteState");
  const end = source.indexOf("export async function getTrackingStatus", start);
  const body = source.slice(start, end);
  assert.match(body, /const root = await runGitInspection\(cwd, \["rev-parse", "--show-toplevel"\]\)/);
  assert.match(body, /runGitInspection\(root, \["fetch", "--prune", "--all"\]\)/);
  assert.match(body, /markCurrentUpstreamFreshFromTracking\(root\)/);
  assert.match(body, /if \(root !== cwd\) await markCurrentUpstreamFreshFromTracking\(cwd\)/);
});
