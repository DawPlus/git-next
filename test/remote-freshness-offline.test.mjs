import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clearRemoteFreshnessCache,
  inspectCurrentUpstream,
  refreshCurrentUpstreamState,
} from "../src/git-safety.mts";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("remote freshness failure does not block local inspection", async () => {
  const local = mkdtempSync(join(tmpdir(), "git-next-freshness-offline-"));
  git(local, ["init", "-b", "main"]);
  git(local, ["config", "user.name", "Git Next Test"]);
  git(local, ["config", "user.email", "git-next@example.test"]);
  writeFileSync(join(local, "base.txt"), "base\n");
  git(local, ["add", "base.txt"]);
  git(local, ["commit", "-m", "base"]);
  git(local, ["remote", "add", "origin", join(tmpdir(), "git-next-unreachable-remote")]);
  git(local, ["config", "branch.main.remote", "origin"]);
  git(local, ["config", "branch.main.merge", "refs/heads/main"]);
  git(local, ["update-ref", "refs/remotes/origin/main", "HEAD"]);

  clearRemoteFreshnessCache(local);
  assert.equal((await inspectCurrentUpstream(local)).kind, "unknown");
  assert.equal((await refreshCurrentUpstreamState(local, { force: true })).kind, "unknown");
  assert.equal((await inspectCurrentUpstream(local)).kind, "unknown");
});
