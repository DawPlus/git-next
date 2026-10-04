import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  compareBranches,
  derivePullRequestUrl,
  getChangeWorkspace,
  getCommitDetails,
  getCommitSuggestion,
  getStagedFiles,
  listConflictedFiles,
  listReflog,
  recommendNextAction,
  resolveConflictSide,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from "../src/git-workflows.mjs";

const exec = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await exec("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function repo() {
  const cwd = await mkdtemp(join(tmpdir(), "git-next-workflows-"));
  await git(cwd, "init", "-q", "-b", "main");
  await git(cwd, "config", "user.email", "test@example.com");
  await git(cwd, "config", "user.name", "Git Next Test");
  await exec("sh", ["-c", "printf 'base\n' > app.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "base");
  return cwd;
}

test("recommends safe next action from state", () => {
  assert.equal(recommendNextAction({ changes: [{ path: "a" }], tracking: { kind: "behind", behind: 2 } }).kind, "dirty");
  assert.equal(recommendNextAction({ changes: [], tracking: { kind: "behind", behind: 2 } }).kind, "pull");
  assert.equal(recommendNextAction({ changes: [], tracking: { kind: "diverged" } }).kind, "diverged");
  assert.equal(recommendNextAction({ changes: [], tracking: { kind: "ahead", ahead: 1 } }).kind, "push");
});

test("derives GitHub and GitLab PR URLs", () => {
  assert.match(derivePullRequestUrl("git@github.com:owner/repo.git", "feature/a", "main"), /github\.com\/owner\/repo\/compare\/main\.\.\.feature%2Fa/);
  assert.match(derivePullRequestUrl("https://gitlab.com/team/repo.git", "feature/a", "main"), /merge_requests\/new/);
});

test("compares branches, reads reflog, and suggests commit message", async () => {
  const cwd = await repo();
  await git(cwd, "switch", "-qc", "feature");
  await exec("sh", ["-c", "printf 'feature\n' >> app.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "feature work");
  await git(cwd, "switch", "-q", "main");

  const comparison = await compareBranches(cwd, "main", "feature");
  assert.equal(comparison.otherCount, 1);
  assert.match(comparison.otherOnly[0].subject, /feature work/);
  assert.equal(comparison.files[0].path, "app.txt");

  await exec("sh", ["-c", "printf 'local\n' >> app.txt"], { cwd });
  const unstagedSuggestion = await getCommitSuggestion(cwd);
  assert.equal(unstagedSuggestion.subject, "");
  await git(cwd, "add", "app.txt");
  const suggestion = await getCommitSuggestion(cwd);
  assert.match(suggestion.subject, /update app\.txt/);

  const reflog = await listReflog(cwd);
  assert.ok(reflog.length >= 2);
});

test("reads exact files changed by a graph commit", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "printf 'change\n' >> app.txt && printf 'new\n' > extra.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "graph detail");

  const head = await git(cwd, "rev-parse", "HEAD");
  const details = await getCommitDetails(cwd, head);
  assert.equal(details.ok, true);
  assert.match(details.message, /graph detail/);
  assert.equal(details.parents.length, 1);
  assert.equal(details.files.some((file) => file.path === "app.txt" && file.status.startsWith("M")), true);
  assert.equal(details.files.some((file) => file.path === "extra.txt" && file.status.startsWith("A")), true);
});

test("stages and unstages individual files for the commit workspace", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "printf 'change\n' >> app.txt && printf 'new\n' > extra.txt"], { cwd });

  let state = await getChangeWorkspace(cwd);
  assert.equal(state.unstaged.some((file) => file.path === "app.txt"), true);
  assert.equal(state.unstaged.some((file) => file.path === "extra.txt"), true);

  assert.equal((await stageFile(cwd, "app.txt")).ok, true);
  assert.equal((await getStagedFiles(cwd)).some((file) => file.path === "app.txt"), true);

  assert.equal((await unstageFile(cwd, "app.txt")).ok, true);
  state = await getChangeWorkspace(cwd);
  assert.equal(state.staged.some((file) => file.path === "app.txt"), false);
});

test("stages and unstages all changes without touching file contents", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "printf 'change\n' >> app.txt && printf 'new\n' > extra.txt"], { cwd });

  assert.equal((await stageAll(cwd)).ok, true);
  let state = await getChangeWorkspace(cwd);
  assert.equal(state.staged.length >= 2, true);

  assert.equal((await unstageAll(cwd)).ok, true);
  state = await getChangeWorkspace(cwd);
  assert.equal(state.staged.length, 0);
  assert.equal(state.unstaged.some((file) => file.path === "app.txt"), true);
  assert.equal(state.unstaged.some((file) => file.path === "extra.txt"), true);
});

test("detects and resolves a merge conflict side", async () => {
  const cwd = await repo();
  await git(cwd, "switch", "-qc", "feature");
  await exec("sh", ["-c", "printf 'feature\n' > app.txt"], { cwd });
  await git(cwd, "commit", "-qam", "feature change");
  await git(cwd, "switch", "-q", "main");
  await exec("sh", ["-c", "printf 'main\n' > app.txt"], { cwd });
  await git(cwd, "commit", "-qam", "main change");

  await assert.rejects(() => git(cwd, "merge", "feature"));
  assert.deepEqual(await listConflictedFiles(cwd), ["app.txt"]);

  const resolved = await resolveConflictSide(cwd, "app.txt", "mine");
  assert.equal(resolved.ok, true);
  assert.deepEqual(await listConflictedFiles(cwd), []);
});
