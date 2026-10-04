import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getLinkedWorktrees, getRepositoryState } from "../src/git-state.mjs";
import { abortGitOperation, continueGitOperation, listConflictedFiles, resolveConflictSide } from "../src/git-workflows.mjs";
import {
  detectRemoteHistoryRewrite,
  getHeadSafety,
  getInProgressOperation,
  getTrackingStatus,
  getWorkingTreeChanges,
  inspectCurrentUpstream,
  preflightPullSafety,
} from "../src/git-safety.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "git-next-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Git Next Test"]);
  git(dir, ["config", "user.email", "git-next@example.test"]);
  return dir;
}

function commit(repo, name, content = name) {
  writeFileSync(join(repo, name), content);
  git(repo, ["add", name]);
  git(repo, ["commit", "-m", name]);
}

test("실제 Git 저장소의 빈 상태와 첫 커밋을 읽는다", async () => {
  const repo = makeRepo();

  const empty = await getRepositoryState(repo);
  assert.equal(empty.kind, "repository");
  assert.equal(empty.branch, "main");
  assert.equal(empty.commits.length, 0);

  commit(repo, "first.txt");
  const first = await getRepositoryState(repo);
  assert.equal(first.commits.length, 1);
  assert.equal(first.refs.some((ref) => ref.name === "main"), true);
});

test("브랜치 분기, 병합, detached HEAD를 실제 Git 출력에서 읽는다", async () => {
  const repo = makeRepo();
  commit(repo, "base.txt");

  git(repo, ["checkout", "-b", "feature"]);
  commit(repo, "feature.txt");

  git(repo, ["checkout", "main"]);
  commit(repo, "main.txt");
  git(repo, ["merge", "--no-ff", "feature", "-m", "merge feature"]);

  const merged = await getRepositoryState(repo);
  assert.equal(merged.commits.some((item) => item.parents.length === 2), true);
  assert.equal(merged.refs.some((ref) => ref.name === "feature"), true);

  git(repo, ["checkout", "--detach", "HEAD~1"]);
  const detached = await getRepositoryState(repo);
  assert.equal(detached.branch, null);
  assert.ok(detached.head);
});

test("distinguishes a deleted remote branch from a missing local tracking ref", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-upstream-remote-"));
  git(remote, ["init", "--bare"]);
  const local = makeRepo();
  commit(local, "main.txt");
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  git(local, ["update-ref", "-d", "refs/remotes/origin/main"]);
  assert.equal((await inspectCurrentUpstream(local)).kind, "tracking-ref-missing");
  git(local, ["fetch", "origin"]);

  git(remote, ["update-ref", "-d", "refs/heads/main"]);
  assert.equal((await inspectCurrentUpstream(local)).kind, "remote-branch-missing");
});

test("원격 추적 상태의 ahead, behind, diverged를 실제 저장소로 판별한다", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-remote-"));
  git(remote, ["init", "--bare"]);

  const local = makeRepo();
  commit(local, "base.txt");
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  commit(local, "ahead.txt");
  let status = await getTrackingStatus(local);
  assert.equal(status.kind, "ahead");

  const other = mkdtempSync(join(tmpdir(), "git-next-other-"));
  git(other, ["clone", "-b", "main", remote, "."]);
  git(other, ["config", "user.name", "Git Next Test"]);
  git(other, ["config", "user.email", "git-next@example.test"]);
  commit(other, "remote.txt");
  git(other, ["push", "origin", "main"]);

  git(local, ["fetch", "origin"]);
  status = await getTrackingStatus(local);
  assert.equal(status.kind, "diverged");

  git(local, ["reset", "--hard", "origin/main"]);
  status = await getTrackingStatus(local);
  assert.equal(status.kind, "up-to-date");

  commit(other, "remote-2.txt");
  git(other, ["push", "origin", "main"]);
  git(local, ["fetch", "origin"]);
  status = await getTrackingStatus(local);
  assert.equal(status.kind, "behind");
});

test("Safe Guard가 dirty working tree와 detached HEAD를 실제 저장소에서 감지한다", async () => {
  const repo = makeRepo();
  commit(repo, "base.txt");

  writeFileSync(join(repo, "dirty.txt"), "dirty");
  const changes = await getWorkingTreeChanges(repo);
  assert.equal(changes.some((item) => item.path === "dirty.txt"), true);

  git(repo, ["add", "dirty.txt"]);
  git(repo, ["commit", "-m", "dirty"]);
  git(repo, ["checkout", "--detach", "HEAD"]);

  const head = await getHeadSafety(repo);
  assert.equal(head.detached, true);
});

test("unstaged 경로의 첫 글자와 porcelain 상태 열을 보존한다", async () => {
  const repo = makeRepo();
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "extension.js"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base"]);
  writeFileSync(join(repo, "src", "extension.js"), "after\n");

  assert.deepEqual(await getWorkingTreeChanges(repo), [
    { status: " M", path: "src/extension.js" },
  ]);
});

test("Safe Guard가 dirty 자체는 허용하고 Remote와 겹치는 변경만 Pull 전에 막는다", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-preflight-remote-"));
  git(remote, ["init", "--bare"]);

  const local = makeRepo();
  writeFileSync(join(local, "shared.txt"), "base\n");
  writeFileSync(join(local, "local.txt"), "base\n");
  writeFileSync(join(local, "remote.txt"), "base\n");
  git(local, ["add", "."]);
  git(local, ["commit", "-m", "base"]);
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  const other = mkdtempSync(join(tmpdir(), "git-next-preflight-other-"));
  git(other, ["clone", "-b", "main", remote, "."]);
  git(other, ["config", "user.name", "Git Next Test"]);
  git(other, ["config", "user.email", "git-next@example.test"]);

  writeFileSync(join(local, "local.txt"), "local dirty\n");
  writeFileSync(join(other, "remote.txt"), "remote changed\n");
  git(other, ["add", "remote.txt"]);
  git(other, ["commit", "-m", "remote only"]);
  git(other, ["push", "origin", "main"]);

  const safe = await preflightPullSafety(local);
  assert.equal(safe.level, "safe");

  writeFileSync(join(other, "shared.txt"), "remote shared\n");
  git(other, ["add", "shared.txt"]);
  git(other, ["commit", "-m", "shared remote"]);
  git(other, ["push", "origin", "main"]);
  writeFileSync(join(local, "shared.txt"), "local shared\n");

  const blocked = await preflightPullSafety(local);
  assert.equal(blocked.level, "blocked");
  assert.equal(blocked.code, "dirty-incoming-overlap");
  assert.deepEqual(blocked.affected, ["shared.txt"]);
});

test("Safe Guard가 진행 중인 merge 표식을 감지한다", async () => {
  const repo = makeRepo();
  commit(repo, "base.txt");

  const mergeHeadPath = git(repo, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  writeFileSync(join(repo, mergeHeadPath), "0000000000000000000000000000000000000000\n");

  const operation = await getInProgressOperation(repo);
  assert.equal(operation?.operation, "merge");
});

test("Safe Guard가 원격 force-push 히스토리 재작성을 감지한다", async () => {
  const remote = mkdtempSync(join(tmpdir(), "git-next-rewrite-remote-"));
  git(remote, ["init", "--bare"]);

  const local = makeRepo();
  commit(local, "base.txt");
  git(local, ["remote", "add", "origin", remote]);
  git(local, ["push", "-u", "origin", "main"]);

  const other = mkdtempSync(join(tmpdir(), "git-next-rewrite-other-"));
  git(other, ["clone", "-b", "main", remote, "."]);
  git(other, ["config", "user.name", "Git Next Test"]);
  git(other, ["config", "user.email", "git-next@example.test"]);
  commit(other, "remote.txt");
  git(other, ["push", "origin", "main"]);

  git(local, ["fetch", "origin"]);
  const oldRemoteTip = git(local, ["rev-parse", "origin/main"]);

  git(other, ["reset", "--hard", "HEAD~1"]);
  commit(other, "rewritten.txt");
  git(other, ["push", "--force", "origin", "main"]);

  const result = await detectRemoteHistoryRewrite(local);
  assert.equal(result.rewritten, true);
  assert.equal(result.before, oldRemoteTip);
  assert.notEqual(result.after, oldRemoteTip);
});

test("continues a resolved merge and safely aborts merge and rebase", async () => {
  const mergeRepo = makeRepo();
  commit(mergeRepo, "conflict.txt", "base\n");
  git(mergeRepo, ["switch", "-c", "feature"]);
  commit(mergeRepo, "conflict.txt", "feature\n");
  git(mergeRepo, ["switch", "main"]);
  commit(mergeRepo, "conflict.txt", "main\n");
  const mergeHead = git(mergeRepo, ["rev-parse", "HEAD"]);
  assert.throws(() => git(mergeRepo, ["merge", "feature"]));
  assert.deepEqual(await listConflictedFiles(mergeRepo), ["conflict.txt"]);
  assert.equal((await resolveConflictSide(mergeRepo, "conflict.txt", "mine")).ok, true);
  assert.equal((await continueGitOperation(mergeRepo, "merge")).ok, true);
  assert.equal(await getInProgressOperation(mergeRepo), null);

  const abortRepo = makeRepo();
  commit(abortRepo, "conflict.txt", "base\n");
  git(abortRepo, ["switch", "-c", "feature"]);
  commit(abortRepo, "conflict.txt", "feature\n");
  const featureHead = git(abortRepo, ["rev-parse", "HEAD"]);
  git(abortRepo, ["switch", "main"]);
  commit(abortRepo, "conflict.txt", "main\n");
  git(abortRepo, ["switch", "feature"]);
  assert.throws(() => git(abortRepo, ["rebase", "main"]));
  assert.equal((await abortGitOperation(abortRepo, "rebase")).ok, true);
  assert.equal(git(abortRepo, ["rev-parse", "HEAD"]), featureHead);
  assert.equal(await getInProgressOperation(abortRepo), null);
});


test("detects linked worktrees from a nested folder in the current worktree", async () => {
  const repo = makeRepo();
  commit(repo, "base.txt");
  const linked = join(tmpdir(), `git-next-linked-${Date.now()}`);
  git(repo, ["worktree", "add", "-b", "feature", linked]);
  mkdirSync(join(repo, "nested"));
  const worktrees = await getLinkedWorktrees(join(repo, "nested"));
  assert.equal(worktrees.length, 2);
  assert.deepEqual(worktrees.map(({ branch, isCurrent }) => ({ branch, isCurrent })), [
    { branch: "main", isCurrent: true },
    { branch: "feature", isCurrent: false },
  ]);
});
