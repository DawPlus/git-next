import { runGit, parseSubjects } from "./git-command.mjs";
import { getWorkingTreeChanges, parseMergeTreeConflictOutput } from "./git-safety.mjs";

async function resolveCommit(cwd, ref) {
  const result = await runGit(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
  return result.ok ? result.detail : null;
}

export async function getIntegrationPreview(cwd, target) {
  const [targetCommit, currentBranch, mergeBase, incoming, changes] = await Promise.all([
    resolveCommit(cwd, target),
    runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runGit(cwd, ["merge-base", "HEAD", target]),
    runGit(cwd, ["log", "--oneline", `HEAD..${target}`]),
    getWorkingTreeChanges(cwd),
  ]);

  if (!targetCommit) {
    return {
      ok: false,
      target,
      message: "선택한 Git 대상을 확인할 수 없습니다.",
      incomingCommits: [],
      conflictFiles: [],
      dirtyFiles: changes.map(({ path }) => path),
    };
  }

  const conflictCheck = await runGit(cwd, ["merge-tree", "--write-tree", "--name-only", "HEAD", target]);
  const conflictFiles = conflictCheck.ok ? [] : parseMergeTreeConflictOutput(conflictCheck.detail);
  const incomingCommits = incoming.ok ? parseSubjects(incoming.detail) : [];

  return {
    ok: true,
    target,
    targetCommit,
    currentBranch: currentBranch.ok ? currentBranch.detail : null,
    mergeBase: mergeBase.ok ? mergeBase.detail : null,
    incomingCommits,
    dirtyFiles: changes.map(({ path }) => path),
    conflictFiles,
    conflictRisk: conflictFiles.length > 0,
  };
}

export async function getDivergedIntegrationPreview(cwd) {
  const upstream = await runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) {
    return { ok: false, message: "현재 브랜치에 연결된 원격 브랜치를 확인할 수 없습니다." };
  }
  return getIntegrationPreview(cwd, upstream.detail);
}

export function formatIntegrationPreview(preview, strategy) {
  if (!preview?.ok) return preview?.message ?? "통합 미리보기를 만들지 못했습니다.";
  const label = strategy === "rebase" ? "Rebase" : "Merge";
  const commits = preview.incomingCommits.slice(0, 5).map((commit) => `• ${commit.id} ${commit.subject}`);
  return [
    `${label} 대상: ${preview.target}`,
    `들어올 커밋: ${preview.incomingCommits.length}개`,
    preview.mergeBase ? `공통 기준점: ${preview.mergeBase.slice(0, 12)}` : null,
    `예상 대상 tip: ${preview.targetCommit.slice(0, 12)}`,
    preview.dirtyFiles.length ? `미커밋 변경: ${preview.dirtyFiles.length}개` : "미커밋 변경 없음",
    preview.conflictRisk ? `충돌 예상: ${preview.conflictFiles.join(", ")}` : "사전 검사에서 충돌 징후 없음",
    commits.length ? `\n들어올 커밋\n${commits.join("\n")}` : null,
  ].filter(Boolean).join("\n");
}

export async function mergeIntoCurrent(cwd, target) {
  const result = await runGit(cwd, ["merge", "--no-edit", target]);
  return {
    ...result,
    action: "merge",
    message: result.ok
      ? `${target}의 변경을 현재 브랜치에 Merge했습니다.`
      : "Merge가 완료되지 않았습니다. 충돌이 있다면 Conflict Helper에서 계속하거나 취소하세요.",
  };
}

export async function rebaseCurrentOnto(cwd, target) {
  const result = await runGit(cwd, ["rebase", target]);
  return {
    ...result,
    action: "rebase",
    message: result.ok
      ? `현재 브랜치의 로컬 커밋을 ${target} 위로 Rebase했습니다.`
      : "Rebase가 완료되지 않았습니다. 충돌이 있다면 Conflict Helper에서 계속하거나 취소하세요.",
  };
}
