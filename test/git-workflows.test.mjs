import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { detectCachedRemoteHistoryRewrite } from "../src/git-safety.mjs";
import {
  compareBranches,
  createRecoveryPoint,
  discardFile,
  derivePullRequestUrl,
  getChangeWorkspace,
  getBranchesContainingCommit,
  getCommitContainment,
  getFileHistory,
  getForceWithLeasePreview,
  getCommitMessageHints,
  getRetryCheck,
  getCommitDetails,
  getCommitSuggestion,
  getPullRequestReadiness,
  createPullRequestDraft,
  getIntegrationPreview,
  formatIntegrationPreview,
  mergeIntoCurrent,
  rebaseCurrentOnto,
  getGitDoctorFindings,
  getUndoRecommendation,
  getStashDetails,
  getStagedFiles,
  buildSyncImpactSummary,
  formatImpactPreview,
  formatSyncImpactSummary,
  buildOperationGuard,
  formatOperationActionPreview,
  formatStashPreview,
  formatGitStateDelta,
  runWithGitStateDelta,
  listConflictedFiles,
  listRecoveryPoints,
  listReflog,
  recommendNextAction,
  resolveConflictSide,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from "../src/git-workflows.mjs";

const exec = promisify(execFile);

test("impact preview separates changed, added, and deleted file counts", () => {
  const text = formatImpactPreview({ action: "push", upstream: "origin/main", summary: "커밋 1개", commits: [], files: [
    { status: "M", path: "changed.txt" }, { status: "A", path: "added.txt" }, { status: "D", path: "deleted.txt" },
  ] });
  assert.match(text, /영향 파일 3개 · 변경 1 · 추가 1 · 삭제 1/);
});

test("Pull and Push share one sync impact summary shape", () => {
  const files = [
    { status: "M", path: "changed.txt" },
    { status: "A", path: "added.txt" },
  ];
  const pull = buildSyncImpactSummary({
    action: "pull",
    upstream: "origin/main",
    summary: "원격 커밋 2개",
    commits: [{ id: "a1", subject: "one" }, { id: "b2", subject: "two" }],
    files,
  });
  const push = buildSyncImpactSummary({
    action: "push",
    upstream: "origin/main",
    summary: "로컬 커밋 2개",
    commits: [{ id: "a1", subject: "one" }, { id: "b2", subject: "two" }],
    files,
  });

  assert.deepEqual(Object.keys(pull), Object.keys(push));
  assert.equal(pull.direction, "서버 origin/main → 로컬");
  assert.equal(push.direction, "로컬 → 서버 origin/main");
  assert.equal(pull.commitCount, 2);
  assert.equal(push.fileCount, 2);
  assert.match(formatSyncImpactSummary(pull), /커밋 2개/);
});

test("state delta reports only changed branch, tracking, and working tree values", () => {
  const text = formatGitStateDelta(
    { branch: "main", upstream: "origin/main", tracking: { ahead: 3, behind: 0 }, dirty: true },
    { branch: "main", upstream: "origin/main", tracking: { ahead: 0, behind: 0 }, dirty: true },
  );
  assert.equal(text, "상태 변화: 원격 기준 ahead 3 → 0");
  assert.equal(formatGitStateDelta({ branch: "main", upstream: null, tracking: null, dirty: false }, { branch: "main", upstream: null, tracking: null, dirty: false }), "상태 변화 없음");
});

test("wrapped Git action returns the actual working tree state change", async () => {
  const cwd = await repo();
  const result = await runWithGitStateDelta(cwd, async () => {
    await exec("sh", ["-c", "printf 'changed\\n' >> app.txt"], { cwd });
    return { ok: true, message: "완료" };
  });
  assert.equal(result.message, "완료 상태 변화: 작업 폴더 깨끗함 → 변경 있음");
});

test("dirty-state hint points to the file list without repeating its file count", () => {
  const hint = recommendNextAction({ changes: Array.from({ length: 26 }, (_, index) => ({ path: `${index}.txt` })) });
  assert.equal(hint.title, "로컬 변경을 먼저 Commit 또는 Stash하세요");
  assert.equal(hint.detail, "");
});

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

test("summarizes repository health as state, risk, and a next action", () => {
  const findings = getGitDoctorFindings({
    head: { detached: false, branch: "feature" },
    tracking: { kind: "diverged", ahead: 2, behind: 1, upstream: "origin/feature" },
    changes: [{ path: "app.txt" }],
    operation: { operation: "merge" },
    remoteRewrite: { rewritten: true, upstream: "origin/feature" },
  });

  assert.deepEqual(findings.map(({ id }) => id), ["operation", "diverged", "dirty", "remote-rewrite"]);
  for (const finding of findings) {
    assert.ok(finding.state);
    assert.ok(finding.risk);
    assert.ok(finding.recommendation);
    assert.ok(finding.action);
  }
});

test("Git Doctor distinguishes detached HEAD, missing upstream, and a healthy repository", () => {
  assert.equal(getGitDoctorFindings({
    head: { detached: true }, tracking: { kind: "no-upstream" }, changes: [], operation: null,
  })[0].id, "detached-head");
  assert.equal(getGitDoctorFindings({
    head: { detached: false, branch: "main" }, tracking: { kind: "no-upstream" }, changes: [], operation: null,
  })[0].id, "no-upstream");
  assert.equal(getGitDoctorFindings({
    head: { detached: false, branch: "main" }, tracking: { kind: "up-to-date", ahead: 0, behind: 0 }, changes: [], operation: null,
  })[0].id, "healthy");
});

test("Git Doctor explains a confirmed gone upstream and offers local branch review", () => {
  const [finding] = getGitDoctorFindings({
    head: { detached: false, branch: "feature" },
    tracking: { kind: "no-upstream" },
    upstreamState: { kind: "remote-branch-missing", upstream: "origin/feature" },
  });

  assert.equal(finding.id, "upstream-gone");
  assert.equal(finding.action, "branch");
  assert.match(finding.recommendation, /자동 삭제하지 않았습니다/);
});

test("derives GitHub and GitLab PR URLs", () => {
  assert.match(derivePullRequestUrl("git@github.com:owner/repo.git", "feature/a", "main"), /github\.com\/owner\/repo\/compare\/main\.\.\.feature%2Fa/);
  assert.match(derivePullRequestUrl("https://gitlab.com/team/repo.git", "feature/a", "main"), /merge_requests\/new/);
});

test("PR readiness reports tracking, local changes, and next actions", () => {
  const readiness = getPullRequestReadiness({
    branch: "feature",
    upstream: "origin/feature",
    tracking: { kind: "diverged", ahead: 2, behind: 1 },
    changes: [{ status: " M", path: "app.js" }, { status: "??", path: "notes.txt" }],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.ahead, 2);
  assert.equal(readiness.behind, 1);
  assert.equal(readiness.dirtyCount, 2);
  assert.equal(readiness.untrackedCount, 1);
  assert.match(readiness.blockers.join(" "), /기록이 갈라졌습니다/);
  assert.match(readiness.nextActions.join(" "), /Branch 비교/);
  assert.match(readiness.warnings.join(" "), /PR에는 포함되지 않습니다/);
  assert.equal(getPullRequestReadiness({
    branch: "feature",
    upstream: "origin/feature",
    tracking: { kind: "ahead", ahead: 1, behind: 0 },
    changes: [],
  }).ready, true);
});

test("PR draft uses the latest outgoing commit as title and commit list as body", () => {
  assert.deepEqual(createPullRequestDraft("feature", [
    { subject: "Add widget" },
    { subject: "Test widget" },
  ]), { title: "Add widget", body: "- Add widget\n- Test widget" });
  assert.equal(createPullRequestDraft("feature", []), null);
});

test("undo recommendations choose a safe path for recent successful actions", () => {
  assert.equal(getUndoRecommendation({ action: "push", ok: true }).id, "pushed");
  assert.equal(getUndoRecommendation({ action: "commit", ok: true }).id, "commit");
  assert.equal(getUndoRecommendation({ action: "delete-branch", ok: true }).id, "reflog");
  assert.equal(getUndoRecommendation({ action: "discard-file", ok: true, recoveryPoint: "git-next-recovery/test" }).id, "recovery");
  assert.equal(getUndoRecommendation({ action: "push", ok: false }), null);
});

test("finds local branches that keep a detached commit reachable", async () => {
  const cwd = await repo();
  const head = await git(cwd, "rev-parse", "HEAD");

  assert.deepEqual(await getBranchesContainingCommit(cwd, head), ["main"]);
  await git(cwd, "switch", "--detach", head);
  assert.deepEqual(await getBranchesContainingCommit(cwd, head), ["main"]);
});

test("in-progress operations expose one state/risk/next recovery guard", () => {
  const guard = buildOperationGuard({ operation: "rebase", path: "/repo/.git/rebase-merge" }, ["app.js"]);
  assert.equal(guard.code, "operation-in-progress");
  assert.deepEqual(guard.actions, ["operation-recovery"]);
  assert.match(guard.message, /상태:/);
  assert.match(guard.message, /위험:/);
  assert.match(guard.message, /다음:/);
  assert.match(guard.detail, /app\.js/);
});

test("operation previews explain continue and abort outcomes before confirmation", () => {
  assert.match(formatOperationActionPreview("rebase", "continue", ["app.js"]), /Rebase.*충돌 파일 1개.*반영/s);
  assert.match(formatOperationActionPreview("merge", "abort", ["app.js"]), /Merge.*충돌 파일 1개.*해결 내용은 반영되지 않고 시작 전 위치/s);
});

test("reports whether a commit is reachable from a selected ref", async () => {
  const cwd = await repo();
  const head = await git(cwd, "rev-parse", "HEAD");
  const result = await getCommitContainment(cwd, head, "main");

  assert.equal(result.ok, true);
  assert.equal(result.contained, true);
  assert.equal(result.ref, "main");

  await git(cwd, "switch", "-qc", "feature");
  await exec("sh", ["-c", "printf 'feature\\n' >> app.txt"], { cwd });
  await git(cwd, "commit", "-qam", "feature change");
  const feature = await git(cwd, "rev-parse", "HEAD");
  assert.equal((await getCommitContainment(cwd, feature, "main")).contained, false);
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
  assert.equal(comparison.mergeBase, await git(cwd, "rev-parse", "main"));
  assert.match(comparison.mergeBaseSubject, /base/);
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

test("stages and unstages every changed file under a folder", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "mkdir -p src/nested && printf 'one\\n' > src/a.js && printf 'two\\n' > src/nested/b.js"], { cwd });

  assert.equal((await stageFile(cwd, "src")).ok, true);
  assert.deepEqual((await getStagedFiles(cwd)).map(({ path }) => path), ["src/a.js", "src/nested/b.js"]);

  assert.equal((await unstageFile(cwd, "src")).ok, true);
  assert.equal((await getStagedFiles(cwd)).length, 0);
  assert.equal((await getChangeWorkspace(cwd)).unstaged.length, 2);
});

test("reverts a staged new file", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "mkdir -p src && printf 'new\\n' > src/new.js"], { cwd });
  await git(cwd, "add", "src/new.js");

  const result = await discardFile(cwd, "src/new.js", { added: true });

  assert.equal(result.ok, true);
  assert.equal((await getChangeWorkspace(cwd)).files.length, 0);
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

test("detects cached upstream rewrites without fetching or changing refs", async () => {
  const runGit = async (_cwd, args) => {
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "origin/main";
    if (args[0] === "rev-parse") return "new-tip";
    if (args[0] === "reflog") return "new-tip\nold-tip";
    if (args[0] === "merge-base") throw Object.assign(new Error("old tip is not an ancestor"), { code: 1 });
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };

  assert.deepEqual(await detectCachedRemoteHistoryRewrite("/repo", runGit), {
    rewritten: true,
    available: true,
    upstream: "origin/main",
    before: "old-tip",
    after: "new-tip",
  });
});

test("ignores missing tracking reflog and accepts fast-forward reflog movement", async () => {
  const baseGit = async (_cwd, args) => {
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "origin/main";
    if (args[0] === "rev-parse") return "new-tip";
    if (args[0] === "reflog") return "new-tip\nold-tip";
    if (args[0] === "merge-base") return "";
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
  const noLog = async (_cwd, args) => args[0] === "reflog" ? "new-tip" : baseGit(_cwd, args);

  assert.equal((await detectCachedRemoteHistoryRewrite("/repo", noLog)).available, false);
  assert.equal((await detectCachedRemoteHistoryRewrite("/repo", baseGit)).rewritten, false);
});

test("creates a local recovery ref before risky history changes", async () => {
  const cwd = await repo();
  const head = await git(cwd, "rev-parse", "HEAD");

  const point = await createRecoveryPoint(cwd, "undo-local-commit");
  const points = await listRecoveryPoints(cwd);

  assert.equal(point.ok, true);
  assert.match(point.name, /^git-next-recovery\/undo-local-commit-/);
  assert.equal(point.commit, head);
  assert.equal(await git(cwd, "rev-parse", point.name), head);
  assert.equal(await git(cwd, "rev-parse", "HEAD"), head);
  assert.deepEqual(points.map(({ name, commit }) => ({ name, commit })), [{ name: point.name, commit: head }]);
});

test("previews file-level Stash overlap without claiming a certain conflict", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "printf 'stashed change\\n' >> app.txt"], { cwd });
  await git(cwd, "stash", "push", "-m", "overlap case");
  await exec("sh", ["-c", "printf 'local change\\n' >> app.txt && printf 'separate\\n' > other.txt"], { cwd });

  const details = await getStashDetails(cwd, "stash@{0}");

  assert.deepEqual(details.overlap, ["app.txt"]);
  assert.deepEqual(details.files.map(({ path }) => path), ["app.txt"]);
});


test("file history returns a bounded list of matching commits and handles empty history", async () => {
  const cwd = await repo();
  await exec("sh", ["-c", "printf 'first\n' > 'file with spaces.txt'"], { cwd });
  await git(cwd, "add", "--", "file with spaces.txt");
  await git(cwd, "commit", "-qm", "add spaced file");
  await exec("sh", ["-c", "printf 'second\n' >> 'file with spaces.txt'"], { cwd });
  await git(cwd, "add", "--", "file with spaces.txt");
  await git(cwd, "commit", "-qm", "update spaced file");
  const history = await getFileHistory(cwd, "file with spaces.txt", 1);
  assert.deepEqual(history.map(({ message }) => message), ["update spaced file"]);
  assert.deepEqual(await getFileHistory(cwd, "missing.txt"), []);
});


test("stash preview names its message and summarizes included files", () => {
  const preview = formatStashPreview([
    { status: "M", path: "src/app.js" },
    { status: "A", path: "notes.md" },
  ], "fix login flow");
  assert.match(preview, /fix login flow/);
  assert.match(preview, /포함 파일 2개/);
  assert.match(preview, /src\/app\.js/);
});


test("commit message hints flag vague, long, and bodyless drafts without blocking", () => {
  const hints = getCommitMessageHints("update: change things");
  assert.match(hints.join(" "), /무엇을 바꿨는지/);
  assert.match(hints.join(" "), /본문이 비어/);
  assert.match(getCommitMessageHints(`${"x".repeat(73)}\n\nReason`)[0], /제목이 길어요/);
  assert.deepEqual(getCommitMessageHints("Refresh tokens on expiry\n\nPrevents expired sessions"), []);
  assert.deepEqual(getCommitMessageHints(""), []);
});


test("failed-action retry guidance identifies the condition to recheck", () => {
  assert.match(getRetryCheck({ action: "pull", code: "dirty-working-tree" }), /Commit 또는 Stash/);
  assert.match(getRetryCheck({ action: "push", code: "diverged" }), /Remote/);
  assert.match(getRetryCheck({ action: "stage-file" }), /저장소 상태/);
});


test("force-with-lease preview names the exact current upstream tip", async () => {
  const cwd = await repo();
  const remote = await mkdtemp(join(tmpdir(), "git-next-lease-remote-"));
  await git(remote, "init", "--bare");
  await git(cwd, "remote", "add", "origin", remote);
  await git(cwd, "push", "-u", "origin", "main");
  const preview = await getForceWithLeasePreview(cwd);
  assert.equal(preview.ok, true);
  assert.equal(preview.remote, "origin");
  assert.equal(preview.remoteRef, "refs/heads/main");
  assert.equal(preview.expected, await git(remote, "rev-parse", "refs/heads/main"));
});

test("previews and merges another branch into the current branch", async () => {
  const cwd = await repo();
  await git(cwd, "switch", "-c", "feature");
  await exec("sh", ["-c", "printf 'feature\n' > feature.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "feature work");
  const featureTip = await git(cwd, "rev-parse", "HEAD");
  await git(cwd, "switch", "main");

  const preview = await getIntegrationPreview(cwd, "feature");
  assert.equal(preview.ok, true);
  assert.equal(preview.incomingCommits.length, 1);
  assert.equal(preview.targetCommit, featureTip);
  assert.match(formatIntegrationPreview(preview, "merge"), /Merge 대상: feature/);

  const result = await mergeIntoCurrent(cwd, "feature");
  assert.equal(result.ok, true);
  assert.equal(await git(cwd, "rev-parse", "HEAD"), featureTip);
});

test("rebases diverged local work onto the reviewed target", async () => {
  const cwd = await repo();
  await git(cwd, "switch", "-c", "remote");
  await exec("sh", ["-c", "printf 'remote\n' > remote.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "remote work");

  await git(cwd, "switch", "main");
  await exec("sh", ["-c", "printf 'local\n' > local.txt"], { cwd });
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "local work");

  const result = await rebaseCurrentOnto(cwd, "remote");
  assert.equal(result.ok, true);
  await git(cwd, "merge-base", "--is-ancestor", "remote", "HEAD");
});
