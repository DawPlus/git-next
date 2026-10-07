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

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "git-next-freshness-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Git Next Test"]);
  git(dir, ["config", "user.email", "git-next@example.test"]);
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, ["add", "base.txt"]);
  git(dir, ["commit", "-m", "base"]);
  return dir;
}

test("remote freshness stays off the normal inspection path", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-freshness-remote-"));
  git(remote, ["init", "--bare"]);

  const local = makeRepo();
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  clearRemoteFreshnessCache(local);
  assert.equal((await inspectCurrentUpstream(local)).kind, "unknown");

  const [first, second] = await Promise.all([
    refreshCurrentUpstreamState(local, { force: true }),
    refreshCurrentUpstreamState(local, { force: true }),
  ]);

  assert.equal(first.kind, "healthy");
  assert.deepEqual(second, first);
  assert.equal((await inspectCurrentUpstream(local)).kind, "healthy");
});
