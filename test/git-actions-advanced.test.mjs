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
  fetchPruneRemote,
  getBranchDeleteInfo,
  getBranchCleanupCandidates,
  listStashes,
  isSafeStashRef,
  pushWithUpstream,
  pushWithForceWithLease,
  renameBranch,
  revertCommit,
  stashApply,
  stashDrop,
  stashPush,
  validateBranchName,
  validateCommitish,
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

test("switch keeps non-conflicting uncommitted changes", async () => {
  const repo = makeRepo();
  assert.equal((await createBranch(repo, "feature/dirty", "HEAD")).ok, true);
  writeFileSync(join(repo, "base.txt"), "base\nlocal change\n");

  const result = await checkoutBranch(repo, "feature/dirty");
  assert.equal(result.ok, true);
  assert.equal(git(repo, ["branch", "--show-current"]), "feature/dirty");
  assert.match(git(repo, ["status", "--short"]), /base\.txt/);
});

test("reviews merged, gone-upstream, and stale branches without marking uncertain branches safe", async () => {
  const repo = makeRepo();
  git(repo, ["branch", "merged"]);
  git(repo, ["switch", "-c", "gone"]);
  writeFileSync(join(repo, "gone.txt"), "gone\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "gone upstream branch"]);
  const remote = mkdtempSync(join(tmpdir(), "git-next-gone-remote-"));
  git(remote, ["init", "--bare"]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["config", "branch.gone.remote", "origin"]);
  git(repo, ["config", "branch.gone.merge", "refs/heads/gone"]);
  git(repo, ["switch", "-c", "stale"]);
  writeFileSync(join(repo, "stale.txt"), "stale\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "stale branch commit"]);
  git(repo, ["switch", "main"]);

  const result = await getBranchCleanupCandidates(repo, { now: Date.now() + 100 * 86400000 });
  assert.equal(result.ok, true);
  const byName = Object.fromEntries(result.candidates.map((candidate) => [candidate.name, candidate]));
  assert.equal(byName.main, undefined);
  assert.equal(byName.merged.safe, true);
  assert.match(byName.merged.reasons.join(" "), /병합/);
  assert.equal(byName.gone.safe, false);
  assert.match(byName.gone.reasons.join(" "), /원격 추적/);
  assert.equal(byName.stale.safe, false);
  assert.match(byName.stale.reasons.join(" "), /90일/);
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

test("first push creates the remote branch and configures its upstream", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-first-push-"));
  git(remote, ["init", "--bare"]);

  const repo = makeRepo();
  git(repo, ["remote", "add", "origin", remote]);

  const result = await pushWithUpstream(repo, "origin", "main");

  assert.equal(result.ok, true);
  assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]), "origin/main");
  assert.equal(git(remote, ["rev-parse", "refs/heads/main"]), git(repo, ["rev-parse", "HEAD"]));
});

test("failed first push keeps Git detail and suggests the next check", async () => {
  const repo = makeRepo();

  const result = await pushWithUpstream(repo, "missing", "main");

  assert.equal(result.ok, false);
  assert.match(result.detail, /missing/);
  assert.match(result.message, /Remote와 브랜치 이름을 확인/);
});

test("fetch prune removes stale remote refs without deleting local branches", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-prune-remote-"));
  git(remote, ["init", "--bare"]);
  const repo = makeRepo();
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-u", "origin", "main"]);
  git(remote, ["update-ref", "-d", "refs/heads/main"]);

  const result = await fetchPruneRemote(repo, "origin");

  assert.equal(result.ok, true);
  assert.equal(git(repo, ["branch", "--list", "--format=%(refname:short)", "main"]), "main");
  assert.throws(() => git(repo, ["show-ref", "--verify", "refs/remotes/origin/main"]));
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


test("force-with-lease updates only the reviewed remote tip and rejects a changed tip", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-lease-remote-"));
  git(remote, ["init", "--bare"]);
  const repo = makeRepo();
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-u", "origin", "main"]);
  const expected = git(remote, ["rev-parse", "refs/heads/main"]);
  writeFileSync(join(repo, "local.txt"), "local\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "local update"]);
  const other = mkdtempSync(join(tmpdir(), "git-next-lease-other-"));
  git(other, ["clone", "-b", "main", remote, "."]);
  git(other, ["config", "user.name", "Git Next Test"]);
  git(other, ["config", "user.email", "git-next@example.test"]);
  writeFileSync(join(other, "remote.txt"), "remote\n");
  git(other, ["add", "."]);
  git(other, ["commit", "-m", "remote update"]);
  git(other, ["push", "origin", "main"]);
  const remoteBefore = git(remote, ["rev-parse", "refs/heads/main"]);
  const rejected = await pushWithForceWithLease(repo, "origin", "refs/heads/main", expected);
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /원격 기준점이 바뀌어 Push를 취소/);
  assert.equal(git(remote, ["rev-parse", "refs/heads/main"]), remoteBefore);
});

test("rejects option-like refs before destructive Git actions", async () => {
  const repo = makeRepo();
  assert.equal((await validateCommitish(repo, "--abort")).ok, false);
  assert.equal((await createBranch(repo, "-danger", "HEAD")).ok, false);
  assert.equal((await cherryPickCommit(repo, "--abort")).ok, false);
  assert.equal(isSafeStashRef("--index"), false);
  assert.equal((await stashApply(repo, "--index")).ok, false);
});

test("force-with-lease sends the reviewed local history when the remote tip still matches", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-lease-success-"));
  git(remote, ["init", "--bare"]);
  const repo = makeRepo();
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-u", "origin", "main"]);
  const expected = git(remote, ["rev-parse", "refs/heads/main"]);
  writeFileSync(join(repo, "local.txt"), "local\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "local update"]);
  const result = await pushWithForceWithLease(repo, "origin", "refs/heads/main", expected);
  assert.equal(result.ok, true);
  assert.equal(git(remote, ["rev-parse", "refs/heads/main"]), git(repo, ["rev-parse", "HEAD"]));
});
