import { runGit, parseNameStatus, parseSubjects } from "./git-command.mjs";

import { getTrackingStatus, getWorkingTreeChanges } from "./git-safety.mjs";

import { getRepositoryState } from "./git-state.mjs";

export async function listConflictedFiles(cwd) {
  const result = await runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return result.ok && result.detail ? result.detail.split("\n").filter(Boolean) : [];
}

export async function resolveConflictSide(cwd, path, side) {
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

export async function continueMerge(cwd) {
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

export async function abortMerge(cwd) {
  const result = await runGit(cwd, ["merge", "--abort"]);
  return {
    ...result,
    action: "merge-abort",
    message: result.ok ? "진행 중인 Merge를 취소하고 이전 상태로 돌아갔습니다." : "Merge를 취소하지 못했습니다.",
  };
}

const operationCommands = {
  merge: { continue: ["commit", "--no-edit"], abort: ["merge", "--abort"] },
  rebase: { continue: ["-c", "core.editor=true", "rebase", "--continue"], abort: ["rebase", "--abort"] },
  "cherry-pick": { continue: ["-c", "core.editor=true", "cherry-pick", "--continue"], abort: ["cherry-pick", "--abort"] },
  revert: { continue: ["-c", "core.editor=true", "revert", "--continue"], abort: ["revert", "--abort"] },
};

export function formatOperationActionPreview(operation, action, conflictedFiles = []) {
  const name = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" })[operation] ?? operation;
  const conflicts = `충돌 파일 ${conflictedFiles.length}개`;
  return action === "continue"
    ? `${name}를 계속하면 ${conflicts}의 정리 내용을 반영하고 진행 중인 Git 작업을 이어갑니다.`
    : `${name}를 취소하면 ${conflicts}의 해결 내용은 반영되지 않고 시작 전 위치로 돌아갑니다.`;
}

export async function continueGitOperation(cwd, operation) {
  const command = operationCommands[operation]?.continue;
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
  const label = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" })[operation] ?? operation;
  return {
    ...result,
    action: `${operation}-continue`,
    message: result.ok ? `${label} 작업을 계속했습니다.` : `${label} 작업을 계속하지 못했습니다. 충돌 파일과 Git 상세 정보를 확인하세요.`,
  };
}

export async function abortGitOperation(cwd, operation) {
  const command = operationCommands[operation]?.abort;
  if (!command) return { ok: false, action: `${operation}-abort`, message: "지원하지 않는 Git 작업입니다." };
  const result = await runGit(cwd, command);
  const label = ({ merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" })[operation] ?? operation;
  return {
    ...result,
    action: `${operation}-abort`,
    message: result.ok ? `${label} 작업을 취소하고 시작 전 위치로 돌아갔습니다.` : `${label} 작업을 취소하지 못했습니다. Git 상세 정보를 확인하세요.`,
  };
}


export async function getActionImpactPreview(cwd, action) {
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
  let parsedFiles = [];
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

export function formatImpactPreview(preview) {
  const added = preview.files.filter((file) => file.status.startsWith("A")).length;
  const deleted = preview.files.filter((file) => file.status.startsWith("D")).length;
  const changed = preview.files.length - added - deleted;
  const direction = preview.action === "pull"
    ? `서버 ${preview.upstream ?? "Remote"} → 로컬`
    : `로컬 → 서버 ${preview.upstream ?? "Remote"}`;
  const commitLines = preview.commits.slice(0, 5).map((commit) => `• ${commit.id} ${commit.subject}`);
  const fileLines = preview.files.slice(0, 5).map((file) => `• ${file.status} ${file.path}`);
  return [
    direction,
    preview.summary,
    preview.files.length ? `영향 파일 ${preview.files.length}개 · 변경 ${changed} · 추가 ${added} · 삭제 ${deleted}` : "영향 파일 없음",
    commitLines.length ? `\n${preview.action === "pull" ? "받아올 커밋" : "보낼 커밋"}\n${commitLines.join("\n")}${preview.commits.length > 5 ? `\n외 ${preview.commits.length - 5}개` : ""}` : null,
    fileLines.length ? `\n변경 파일 미리보기\n${fileLines.join("\n")}${preview.files.length > 5 ? `\n외 ${preview.files.length - 5}개` : ""}` : null,
  ].filter(Boolean).join("\n");
}

export function formatGitStateDelta(before, after) {
  const changes = [];
  if (before.branch !== after.branch) changes.push(`브랜치 ${before.branch ?? "없음"} → ${after.branch ?? "없음"}`);
  if (before.upstream !== after.upstream) changes.push(`추적 Remote ${before.upstream ?? "없음"} → ${after.upstream ?? "없음"}`);
  if (before.tracking && after.tracking && (before.tracking.ahead !== after.tracking.ahead || before.tracking.behind !== after.tracking.behind)) {
    const trackingChanges = [];
    if (before.tracking.ahead !== after.tracking.ahead) trackingChanges.push(`ahead ${before.tracking.ahead} → ${after.tracking.ahead}`);
    if (before.tracking.behind !== after.tracking.behind) trackingChanges.push(`behind ${before.tracking.behind} → ${after.tracking.behind}`);
    changes.push(`원격 기준 ${trackingChanges.join(", ")}`);
  }
  if (before.dirty !== after.dirty) changes.push(`작업 폴더 ${before.dirty ? "변경 있음" : "깨끗함"} → ${after.dirty ? "변경 있음" : "깨끗함"}`);
  return changes.length ? `상태 변화: ${changes.join(" · ")}` : "상태 변화 없음";
}

export async function runWithGitStateDelta(cwd, action) {
  const snapshot = async () => {
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
