import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkoutBranch,
  cherryPickCommit,
  createBranch,
  createTag,
  createTrackingBranch,
  deleteBranch,
  deleteTag,
  getBranchDeleteInfo,
  listStashes,
  renameBranch,
  revertCommit,
  stashApply,
  stashDrop,
  stashPush,
  validateBranchName,
  validateTagName,
} from "../src/git-actions.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "git-next-advanced-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Git Next Test"]);
  git(dir, ["config", "user.email", "git-next@example.test"]);
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  return dir;
}

test("creates, switches, renames, and deletes local branches", async () => {
  const repo = makeRepo();

  assert.equal((await validateBranchName(repo, "feature/test")).ok, true);
  assert.equal((await createBranch(repo, "feature/test", "HEAD")).ok, true);
  assert.equal((await checkoutBranch(repo, "feature/test")).ok, true);
  assert.equal(git(repo, ["branch", "--show-current"]), "feature/test");

  assert.equal((await renameBranch(repo, "feature/test", "feature/renamed")).ok, true);
  assert.equal(git(repo, ["branch", "--show-current"]), "feature/renamed");

  git(repo, ["switch", "main"]);
  const info = await getBranchDeleteInfo(repo, "feature/renamed");
  assert.equal(info.merged, true);
  assert.equal((await deleteBranch(repo, "feature/renamed")).ok, true);
});

test("creates a local tracking branch from a remote-only ref", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-track-remote-"));
  git(remote, ["init", "--bare"]);

  const repo = makeRepo();
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-u", "origin", "main"]);

  git(repo, ["switch", "-c", "feature"]);
  writeFileSync(join(repo, "remote.txt"), "remote\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "remote feature"]);
  git(repo, ["push", "origin", "feature"]);
  git(repo, ["switch", "main"]);
  git(repo, ["branch", "-D", "feature"]);
  git(repo, ["fetch", "origin"]);

  const result = await createTrackingBranch(repo, "feature-local", "origin/feature");
  assert.equal(result.ok, true);
  assert.equal(git(repo, ["branch", "--show-current"]), "feature-local");
  assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]), "origin/feature");
});

test("creates and deletes lightweight tags", async () => {
  const repo = makeRepo();

  assert.equal((await validateTagName(repo, "v0.1.0")).ok, true);
  assert.equal((await createTag(repo, "v0.1.0", "HEAD")).ok, true);
  assert.equal(git(repo, ["tag", "--list", "v0.1.0"]), "v0.1.0");
  assert.equal((await deleteTag(repo, "v0.1.0")).ok, true);
  assert.equal(git(repo, ["tag", "--list", "v0.1.0"]), "");
});

test("stashes, applies, and drops local changes", async () => {
  const repo = makeRepo();

  writeFileSync(join(repo, "work.txt"), "work\n");
  assert.equal((await stashPush(repo, "test stash")).ok, true);

  const stashes = await listStashes(repo);
  assert.equal(stashes.length, 1);
  assert.match(stashes[0].message, /test stash/);

  assert.equal((await stashApply(repo, stashes[0].ref)).ok, true);
  assert.equal((await stashDrop(repo, stashes[0].ref)).ok, true);
  assert.equal((await listStashes(repo)).length, 0);
});

test("cherry-picks and reverts a selected commit", async () => {
  const repo = makeRepo();

  git(repo, ["switch", "-c", "feature"]);
  writeFileSync(join(repo, "feature.txt"), "feature\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "feature"]);
  const featureCommit = git(repo, ["rev-parse", "HEAD"]);

  git(repo, ["switch", "main"]);
  const cherry = await cherryPickCommit(repo, featureCommit);
  assert.equal(cherry.ok, true);
  assert.equal(git(repo, ["log", "-1", "--pretty=%s"]), "feature");

  const picked = git(repo, ["rev-parse", "HEAD"]);
  const reverted = await revertCommit(repo, picked);
  assert.equal(reverted.ok, true);
  assert.match(git(repo, ["log", "-1", "--pretty=%s"]), /Revert/);
});
