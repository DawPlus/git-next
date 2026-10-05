import { runGit, parseNameStatus, parseSubjects } from "./git-command.mjs";

import { getTrackingStatus, getWorkingTreeChanges } from "./git-safety.mjs";

import { getRepositoryState } from "./git-state.mjs";
import { guidanceNotice } from "./git-guidance.mjs";
import type { CommitSubject, NameStatusEntry, TrackingStatus } from "./git-types.mjs";

type GitOperationName = "merge" | "rebase" | "cherry-pick" | "revert";
type OperationAction = "continue" | "abort";

type WorkflowResult = { ok: boolean; action?: string; message?: string; detail?: string; [key: string]: unknown };
type ImpactPreview = { action: "pull" | "push"; upstream: string | null; commits: CommitSubject[]; files: NameStatusEntry[]; summary: string };
type StateSnapshot = { branch: string | null; upstream: string | null; tracking: TrackingStatus; dirty: boolean };

export async function listConflictedFiles(cwd: string): Promise<string[]> {
  const result = await runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return result.ok && result.detail ? result.detail.split("\n").filter(Boolean) : [];
}

export async function resolveConflictSide(cwd: string, path: string, side: "mine" | "theirs"): Promise<WorkflowResult> {
  const checkout = await runGit(cwd, ["checkout", side === "mine" ? "--ours" : "--theirs", "--", path]);
  if (!checkout.ok) {
    return { ...checkout, action: "resolve-conflict", message: "충돌 쪽을 선택하지 못했습니다." };
  }
  const add = await runGit(cwd, ["add", "--", path]);
  return {
    ...add,
    action: "resolve-conflict",
    message: add.ok
      ? `${path}: ${side === "mine" ? "내 변경" : "들어온 변경"}을 선택하고 해결됨으로 표시했습니다.`
      : "파일을 해결됨으로 표시하지 못했습니다.",
  };
}

export async function continueMerge(cwd: string): Promise<WorkflowResult> {
  const conflicts = await listConflictedFiles(cwd);
  if (conflicts.length) {
    return {
      ok: false,
      action: "merge-continue",
      message: `아직 충돌 파일이 ${conflicts.length}개 남아 있습니다.`,
      detail: conflicts.join("\n"),
    };
  }
  const result = await runGit(cwd, ["commit", "--no-edit"]);
  return {
    ...result,
    action: "merge-continue",
    message: result.ok ? "충돌 정리를 반영하고 Merge를 완료했습니다." : "Merge를 완료하지 못했습니다.",
  };
}

export async function abortMerge(cwd: string): Promise<WorkflowResult> {
  const result = await runGit(cwd, ["merge", "--abort"]);
  return {
    ...result,
    action: "merge-abort",
    message: result.ok ? "진행 중인 Merge를 취소하고 이전 상태로 돌아갔습니다." : "Merge를 취소하지 못했습니다.",
  };
}

const operationCommands: Record<GitOperationName, Record<OperationAction, string[]>> = {
  merge: { continue: ["commit", "--no-edit"], abort: ["merge", "--abort"] },
  rebase: { continue: ["-c", "core.editor=true", "rebase", "--continue"], abort: ["rebase", "--abort"] },
  "cherry-pick": { continue: ["-c", "core.editor=true", "cherry-pick", "--continue"], abort: ["cherry-pick", "--abort"] },
  revert: { continue: ["-c", "core.editor=true", "revert", "--continue"], abort: ["revert", "--abort"] },
};

export function formatOperationActionPreview(operation: GitOperationName | string, action: OperationAction, conflictedFiles: string[] = []): string {
  const name = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" } as Record<string, string>)[operation] ?? operation;
  const conflicts = `충돌 파일 ${conflictedFiles.length}개`;
  return action === "continue"
    ? `${name}를 계속하면 ${conflicts}의 정리 내용을 반영하고 진행 중인 Git 작업을 이어갑니다.`
    : `${name}를 취소하면 ${conflicts}의 해결 내용은 반영되지 않고 시작 전 위치로 돌아갑니다.`;
}

export function buildOperationGuard(operation: { operation?: string; path?: string | null } | null | undefined, conflictedFiles: string[] = []) {
  const name = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" })[operation?.operation] ?? operation?.operation ?? "Git";
  const state = `${name} 진행 중`;
  const risk = "진행 중인 작업을 끝내기 전에 다른 Git 작업을 겹치면 상태가 더 복잡해질 수 있습니다.";
  const next = conflictedFiles.length
    ? `충돌 파일 ${conflictedFiles.length}개를 정리한 뒤 Continue하거나, 원치 않으면 Abort하세요.`
    : "Continue로 작업을 이어가거나 Abort로 시작 전 상태로 돌아가세요.";
  return guidanceNotice({
    ok: false,
    level: "blocked",
    code: "operation-in-progress",
    operation: operation?.operation ?? null,
    state,
    risk,
    next,
    detail: conflictedFiles.length
      ? `충돌 파일:\n${conflictedFiles.join("\n")}`
      : operation?.path ?? null,
    actions: ["operation-recovery"],
  });
}

export async function continueGitOperation(cwd: string, operation: string): Promise<WorkflowResult> {
  const command = operationCommands[operation as GitOperationName]?.continue;
  if (!command) return { ok: false, action: `${operation}-continue`, message: "지원하지 않는 Git 작업입니다." };
  const conflicts = await listConflictedFiles(cwd);
  if (conflicts.length) {
    return {
      ok: false,
      action: `${operation}-continue`,
      message: `충돌 파일 ${conflicts.length}개를 먼저 해결하세요.`,
      detail: conflicts.join("\n"),
    };
  }
  const result = await runGit(cwd, command);
  const label = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" } as Record<string, string>)[operation] ?? operation;
  return {
    ...result,
    action: `${operation}-continue`,
    message: result.ok ? `${label} 작업을 계속했습니다.` : `${label} 작업을 계속하지 못했습니다. 충돌 파일과 Git 상세 정보를 확인하세요.`,
  };
}

export async function abortGitOperation(cwd: string, operation: string): Promise<WorkflowResult> {
  const command = operationCommands[operation as GitOperationName]?.abort;
  if (!command) return { ok: false, action: `${operation}-abort`, message: "지원하지 않는 Git 작업입니다." };
  const result = await runGit(cwd, command);
  const label = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" } as Record<string, string>)[operation] ?? operation;
  return {
    ...result,
    action: `${operation}-abort`,
    message: result.ok ? `${label} 작업을 취소하고 시작 전 위치로 돌아갔습니다.` : `${label} 작업을 취소하지 못했습니다. Git 상세 정보를 확인하세요.`,
  };
}


export async function getActionImpactPreview(cwd: string, action: "pull" | "push"): Promise<ImpactPreview> {
  if (action === "push") {
    const [upstream, commits, files] = await Promise.all([
      runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
      runGit(cwd, ["log", "--oneline", "@{u}..HEAD"]),
      runGit(cwd, ["diff", "--name-status", "@{u}..HEAD"]),
    ]);
    const parsedCommits = commits.ok ? parseSubjects(commits.detail) : [];
    const parsedFiles = commits.ok && parsedCommits.length && files.ok ? parseNameStatus(files.detail) : [];
    return {
      action,
      upstream: upstream.ok ? upstream.detail : null,
      commits: parsedCommits,
      files: parsedFiles,
      summary: parsedCommits.length
        ? `원격에 커밋 ${parsedCommits.length}개를 보낼 예정입니다.`
        : "원격에 보낼 새 커밋이 없습니다.",
    };
  }

  const [upstream, commits] = await Promise.all([
    runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    runGit(cwd, ["log", "--oneline", "HEAD..@{u}"]),
  ]);
  const parsedCommits = commits.ok ? parseSubjects(commits.detail) : [];
  let parsedFiles: NameStatusEntry[] = [];
  if (upstream.ok && commits.ok && parsedCommits.length) {
    const files = await runGit(cwd, ["diff", "--name-status", `HEAD..${upstream.detail}`]);
    parsedFiles = files.ok ? parseNameStatus(files.detail) : [];
  }
  return {
    action,
    upstream: upstream.ok ? upstream.detail : null,
    commits: parsedCommits,
    files: parsedFiles,
    summary: parsedCommits.length
      ? `원격 커밋 ${parsedCommits.length}개를 내 로컬에 반영할 예정입니다.`
      : "받아올 새 커밋이 없습니다.",
  };
}

export function buildSyncImpactSummary(preview: ImpactPreview) {
  const files = preview.files ?? [];
  const commits = preview.commits ?? [];
  const added = files.filter((file) => file.status.startsWith("A")).length;
  const deleted = files.filter((file) => file.status.startsWith("D")).length;
  const changed = files.length - added - deleted;
  return {
    action: preview.action,
    label: preview.action === "pull" ? "Pull" : "Push",
    direction: preview.action === "pull"
      ? `서버 ${preview.upstream ?? "Remote"} → 로컬`
      : `로컬 → 서버 ${preview.upstream ?? "Remote"}`,
    upstream: preview.upstream ?? null,
    summary: preview.summary ?? "",
    commitCount: commits.length,
    fileCount: files.length,
    changed,
    added,
    deleted,
    commits: commits.slice(0, 5),
    files: files.slice(0, 5),
    risk: preview.action === "pull"
      ? "원격 변경이 로컬 작업에 반영됩니다."
      : "로컬 Commit이 공유 Remote에 반영됩니다.",
  };
}

export function formatSyncImpactSummary(summary: ReturnType<typeof buildSyncImpactSummary>): string {
  const commitLines = summary.commits.map((commit) => `• ${commit.id} ${commit.subject}`);
  const fileLines = summary.files.map((file) => `• ${file.status} ${file.path}`);
  return [
    summary.direction,
    summary.summary,
    `커밋 ${summary.commitCount}개`,
    summary.fileCount
      ? `영향 파일 ${summary.fileCount}개 · 변경 ${summary.changed} · 추가 ${summary.added} · 삭제 ${summary.deleted}`
      : "영향 파일 없음",
    commitLines.length ? `\n${summary.action === "pull" ? "받아올 커밋" : "보낼 커밋"}\n${commitLines.join("\n")}${summary.commitCount > 5 ? `\n외 ${summary.commitCount - 5}개` : ""}` : null,
    fileLines.length ? `\n변경 파일 미리보기\n${fileLines.join("\n")}${summary.fileCount > 5 ? `\n외 ${summary.fileCount - 5}개` : ""}` : null,
  ].filter(Boolean).join("\n");
}

export function formatImpactPreview(preview: ImpactPreview): string {
  return formatSyncImpactSummary(buildSyncImpactSummary(preview));
}

export function formatGitStateDelta(before: StateSnapshot, after: StateSnapshot): string {
  const changes: string[] = [];
  if (before.branch !== after.branch) changes.push(`브랜치 ${before.branch ?? "없음"} → ${after.branch ?? "없음"}`);
  if (before.upstream !== after.upstream) changes.push(`추적 Remote ${before.upstream ?? "없음"} → ${after.upstream ?? "없음"}`);
  if (before.tracking && after.tracking && (before.tracking.ahead !== after.tracking.ahead || before.tracking.behind !== after.tracking.behind)) {
    const trackingChanges: string[] = [];
    if (before.tracking.ahead !== after.tracking.ahead) trackingChanges.push(`ahead ${before.tracking.ahead} → ${after.tracking.ahead}`);
    if (before.tracking.behind !== after.tracking.behind) trackingChanges.push(`behind ${before.tracking.behind} → ${after.tracking.behind}`);
    changes.push(`원격 기준 ${trackingChanges.join(", ")}`);
  }
  if (before.dirty !== after.dirty) changes.push(`작업 폴더 ${before.dirty ? "변경 있음" : "깨끗함"} → ${after.dirty ? "변경 있음" : "깨끗함"}`);
  return changes.length ? `상태 변화: ${changes.join(" · ")}` : "상태 변화 없음";
}

export async function runWithGitStateDelta<T extends WorkflowResult>(cwd: string, action: () => Promise<T>): Promise<T> {
  const snapshot = async (): Promise<StateSnapshot> => {
    const state = await getRepositoryState(cwd);
    const root = state.root ?? cwd;
    const [tracking, changes] = await Promise.all([getTrackingStatus(root), getWorkingTreeChanges(root)]);
    return { branch: state.branch, upstream: state.upstream, tracking, dirty: changes.length > 0 };
  };
  const before = await snapshot();
  const result = await action();
  if (!result.ok) return result;
  const after = await snapshot();
  return { ...result, message: `${result.message} ${formatGitStateDelta(before, after)}` };
}
