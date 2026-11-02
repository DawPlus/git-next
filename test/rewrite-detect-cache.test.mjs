import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clearRewriteDetectCache,
  detectRemoteHistoryRewrite,
  runGitInspection,
} from "../src/git-safety.mts";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "git-next-rewrite-cache-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Git Next Test"]);
  git(dir, ["config", "user.email", "git-next@example.test"]);
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, ["add", "base.txt"]);
  git(dir, ["commit", "-m", "base"]);
  return dir;
}

function countingGit() {
  let fetchCount = 0;
  const runGit = async (cwd, args) => {
    if (args[0] === "fetch") fetchCount += 1;
    return runGitInspection(cwd, args);
  };
  return {
    runGit,
    fetchCount: () => fetchCount,
    reset: () => {
      fetchCount = 0;
    },
  };
}

test("detectRemoteHistoryRewrite shares one in-flight fetch for concurrent callers", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-rewrite-cache-remote-"));
  git(remote, ["init", "--bare"]);

  const local = makeRepo();
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  clearRewriteDetectCache(local);
  const counter = countingGit();

  const [a, b] = await Promise.all([
    detectRemoteHistoryRewrite(local, counter.runGit),
    detectRemoteHistoryRewrite(local, counter.runGit),
  ]);
  assert.equal(a.rewritten, false);
  assert.equal(b.rewritten, false);
  assert.equal(counter.fetchCount(), 1, "concurrent calls must share one in-flight fetch");

  // Sequential calls must fetch again so Pull can see new remote commits between clicks.
  counter.reset();
  const second = await detectRemoteHistoryRewrite(local, counter.runGit);
  assert.equal(second.rewritten, false);
  assert.equal(counter.fetchCount(), 1, "sequential call after in-flight settles must fetch again");
});
