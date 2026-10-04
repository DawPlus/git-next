import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function classifyTrackingStatus(ahead, behind) {
  if (ahead > 0 && behind > 0) {
    return { kind: "diverged", ahead, behind };
  }

  if (ahead > 0) {
    return { kind: "ahead", ahead, behind };
  }

  if (behind > 0) {
    return { kind: "behind", ahead, behind };
  }

  return { kind: "up-to-date", ahead, behind };
}

export function getPushGuidance(status) {
  if (status.kind === "no-upstream") {
    return {
      allowed: false,
      message: "현재 브랜치에 연결된 원격 브랜치(Upstream)가 없습니다. Git은 어디로 Push해야 하는지 확실히 판단할 수 없어서 Git Next가 작업을 멈췄습니다. 먼저 Remote와 Upstream을 연결한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "behind") {
    return {
      allowed: false,
      message: "원격 브랜치에 아직 내 로컬에 없는 새 커밋이 있습니다. 이 상태에서 바로 Push하면 기준이 달라 Push가 거절되고, 강제 Push를 사용하면 다른 사람의 변경을 덮어쓸 수도 있습니다. 먼저 받기(Pull) 또는 Branch 비교로 원격 변경을 확인한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "diverged") {
    return {
      allowed: false,
      message: "내 로컬과 원격 양쪽에 서로 다른 새 커밋이 생겨 기록이 갈라졌습니다(Diverged). 어느 한쪽을 바로 덮으면 다른 변경을 잃을 수 있어서 Push를 중단했습니다. Branch 비교에서 차이를 확인하고 Merge 또는 Rebase로 기록을 정리한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "unknown") {
    return {
      allowed: false,
      message: "현재 로컬과 원격의 관계를 신뢰할 수 있게 확인하지 못했습니다. 상태를 모른 채 Push하면 예상하지 못한 기록 변경이 생길 수 있어서 작업을 중단했습니다. 새로고침하거나 Git 상세 정보를 확인한 뒤 다시 시도하세요.",
    };
  }

  return {
    allowed: true,
    message:
      status.kind === "ahead"
        ? `원격에 보낼 로컬 커밋이 ${status.ahead}개 있습니다.`
        : "로컬과 원격이 같은 상태입니다.",
  };
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  return stdout.trim();
}

export async function getTrackingStatus(cwd) {
  let upstream;

  try {
    upstream = await git(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
  } catch {
    return {
      kind: "no-upstream",
      ahead: 0,
      behind: 0,
      upstream: null,
    };
  }

  try {
    const raw = await git(cwd, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{u}",
    ]);
    const [aheadRaw = "0", behindRaw = "0"] = raw.split(/\s+/);
    const status = classifyTrackingStatus(Number(aheadRaw), Number(behindRaw));

    return {
      ...status,
      upstream,
    };
  } catch {
    return {
      kind: "unknown",
      ahead: 0,
      behind: 0,
      upstream,
    };
  }
}

export function parseMergeTreeConflictOutput(output) {
  const text = String(output ?? "");
  const files = [...text.matchAll(/CONFLICT \([^)]*\): .*? in (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  return [...new Set(files)];
}

export async function getHeadSafety(cwd) {
  try {
    const branch = await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return { detached: false, branch };
  } catch {
    return { detached: true, branch: null };
  }
}

export async function getWorkingTreeChanges(cwd) {
  const output = await git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
    }));
}

export function getDirtyTreeGuard(action, changes = []) {
  if (changes.length === 0) {
    return {
      level: "safe",
      code: "working-tree-clean",
      message: "로컬 작업 트리가 깨끗합니다.",
      affected: [],
    };
  }

  const protectedActions = new Set([
    "checkout",
    "switch-branch",
    "rebase",
    "reset",
    "hard-reset",
    "discard-changes",
  ]);

  if (!protectedActions.has(action)) {
    return {
      level: "warning",
      code: "working-tree-dirty",
      message: "커밋하지 않은 로컬 변경이 남아 있습니다. 지금 실행하려는 작업이 이 파일들을 직접 덮지는 않더라도 이후 Git 상태를 이해하기 어려워질 수 있습니다. 가능하면 먼저 Commit하거나 Stash로 보관한 뒤 진행하세요.",
      affected: changes.map((change) => change.path),
    };
  }

  return {
    level: "blocked",
    code: "dirty-working-tree",
    message: "커밋하지 않은 로컬 변경이 남아 있습니다. 지금 이 작업을 진행하면 내 수정 내용과 이동하거나 받아올 변경이 겹쳐 파일이 덮이거나 충돌할 수 있어서 Git Next가 중단했습니다. 먼저 Commit하거나 Stash로 현재 작업을 안전하게 보관한 뒤 다시 진행하세요.",
    affected: changes.map((change) => change.path),
  };
}

export async function getInProgressOperation(cwd) {
  const candidates = [
    ["merge", "MERGE_HEAD"],
    ["rebase", "rebase-merge"],
    ["rebase", "rebase-apply"],
    ["cherry-pick", "CHERRY_PICK_HEAD"],
    ["revert", "REVERT_HEAD"],
  ];

  for (const [operation, gitPath] of candidates) {
    try {
      const raw = await git(cwd, ["rev-parse", "--git-path", gitPath]);
      const path = isAbsolute(raw) ? raw : resolve(cwd, raw);
      if (existsSync(path)) {
        return { operation, path };
      }
    } catch {
      // Ignore and continue checking the remaining operation markers.
    }
  }

  return null;
}

export async function detectRemoteHistoryRewrite(cwd) {
  let upstream;
  let before;

  try {
    upstream = await git(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    before = await git(cwd, ["rev-parse", "@{u}"]);
  } catch {
    return { rewritten: false, upstream: null, before: null, after: null };
  }

  try {
    await git(cwd, ["fetch", "--prune"]);
  } catch (error) {
    return {
      rewritten: false,
      upstream,
      before,
      after: null,
      fetchError: String(error?.stderr ?? error?.message ?? error ?? ""),
    };
  }

  let after;
  try {
    after = await git(cwd, ["rev-parse", "@{u}"]);
  } catch {
    return { rewritten: true, upstream, before, after: null };
  }

  if (before === after) {
    return { rewritten: false, upstream, before, after };
  }

  try {
    await git(cwd, ["merge-base", "--is-ancestor", before, after]);
    return { rewritten: false, upstream, before, after };
  } catch {
    return { rewritten: true, upstream, before, after };
  }
}

export async function preflightPushSafety(cwd) {
  const head = await getHeadSafety(cwd);
  if (head.detached) {
    return {
      level: "blocked",
      code: "detached-head",
      message: "현재 브랜치가 아니라 특정 커밋을 직접 보고 있는 Detached HEAD 상태입니다. 이 상태에서 만든 변경은 정상적인 브랜치 흐름에 연결되지 않을 수 있어서 Push를 중단했습니다. 유지할 작업이 있다면 먼저 새 브랜치를 만들거나 기존 브랜치로 이동한 뒤 Push하세요.",
      detail: null,
      affected: [],
    };
  }

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    return {
      level: "blocked",
      code: `${operation.operation}-in-progress`,
      message: `현재 ${operation.operation} 작업이 아직 진행 중입니다. Git이 이전 작업의 결과를 정리하는 중이라 지금 Push하면 미완료 상태를 공유하거나 다음 복구 과정을 더 복잡하게 만들 수 있습니다. 먼저 현재 작업을 계속(Continue)하거나 취소(Abort)해서 끝낸 뒤 Push하세요.`,
      detail: operation.path,
      affected: [],
    };
  }

  const rewrite = await detectRemoteHistoryRewrite(cwd);
  if (rewrite.fetchError) {
    return {
      level: "blocked",
      code: "fetch-failed",
      message: "원격 최신 상태를 확인하지 못해 Push 안전 검사를 완료할 수 없습니다. 네트워크와 Remote 상태를 확인한 뒤 다시 시도하세요.",
      detail: rewrite.fetchError,
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    };
  }
  if (rewrite.rewritten) {
    return {
      level: "blocked",
      code: "remote-history-rewritten",
      message: "원격 브랜치 기록이 마지막 확인 이후 다시 작성된 것으로 보입니다. Rebase 또는 Force Push가 있었을 수 있어 바로 Push하면 다른 기록을 덮을 위험이 있습니다. Compare에서 원격 변경을 확인한 뒤 진행하세요.",
      detail: [rewrite.upstream, rewrite.before, rewrite.after].filter(Boolean).join("\n"),
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    };
  }

  const status = await getTrackingStatus(cwd);
  const guidance = getPushGuidance(status);
  return {
    level: guidance.allowed ? "safe" : "blocked",
    code: status.kind,
    message: guidance.message,
    detail: `추적 상태: ${status.kind}; ahead ${status.ahead}; behind ${status.behind}`,
    affected: status.upstream ? [status.upstream] : [],
    status,
  };
}

export function getDestructiveActionGuard(action, impact = {}) {
  const messages = {
    "hard-reset": "Hard Reset은 로컬 커밋이나 변경 내용을 잃게 만들 수 있습니다.",
    "force-push": "Force Push는 원격 브랜치의 커밋 기록을 덮어쓸 수 있습니다.",
    "delete-branch": "브랜치 삭제는 아직 병합하지 않은 커밋을 잃게 만들 수 있습니다.",
    "discard-changes": "변경 내용 버리기는 커밋하지 않은 파일 변경을 되돌립니다.",
  };

  const message = messages[action];
  if (!message) {
    return {
      level: "blocked",
      code: "unknown-destructive-action",
      message: "영향 범위를 확인할 수 없는 위험 작업은 실행하지 않습니다.",
      detail: null,
      affected: [],
      requiresConfirmation: true,
    };
  }

  return {
    level: "warning",
    code: action,
    message,
    detail: impact.detail ?? null,
    affected: impact.affected ?? [],
    requiresConfirmation: true,
  };
}

export async function preflightPullSafety(cwd, runGit = git) {
  const head = await getHeadSafety(cwd);
  if (head.detached) {
    return {
      level: "blocked",
      code: "detached-head",
      message: "현재 브랜치가 아니라 특정 커밋을 직접 보고 있는 Detached HEAD 상태입니다. Pull은 보통 현재 브랜치에 원격 변경을 반영하는 작업이라 적용 대상을 명확히 할 수 없어 중단했습니다. 먼저 작업할 브랜치를 선택한 뒤 Pull하세요.",
      detail: null,
      affected: [],
    };
  }

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    return {
      level: "blocked",
      code: `${operation.operation}-in-progress`,
      message: `현재 ${operation.operation} 작업이 아직 끝나지 않았습니다. 이 상태에서 Pull을 추가로 실행하면 두 작업의 변경이 섞여 충돌 원인을 파악하기 어려워질 수 있습니다. 먼저 현재 작업을 계속(Continue)하거나 취소(Abort)해서 정리한 뒤 Pull하세요.`,
      detail: operation.path,
      affected: [],
    };
  }

  let changes = [];
  try {
    changes = await getWorkingTreeChanges(cwd);
  } catch (error) {
    return {
      level: "blocked",
      code: "working-tree-check-failed",
      message: "로컬 변경 상태를 확인하지 못해 Pull을 중단했습니다.",
      detail: String(error?.stderr ?? error?.message ?? error ?? ""),
      affected: [],
    };
  }

  const rewrite = await detectRemoteHistoryRewrite(cwd);
  if (rewrite.fetchError) {
    return {
      level: "blocked",
      code: "fetch-failed",
      message: "원격 변경 정보를 가져오지 못해 Pull 안전 검사를 진행할 수 없습니다.",
      detail: rewrite.fetchError,
      affected: [],
    };
  }

  if (rewrite.rewritten) {
    return {
      level: "blocked",
      code: "remote-history-rewritten",
      message: "원격 브랜치의 커밋 기록이 이전에 확인했던 흐름과 달라졌습니다. 누군가 Rebase 또는 Force Push로 원격 기록을 다시 썼을 가능성이 있습니다. 이 상태에서 바로 Pull이나 Push하면 내 커밋이 엉뚱한 기준에 합쳐지거나 다른 기록을 덮을 수 있으니 먼저 그래프와 Branch 비교로 달라진 지점을 확인하세요.",
      detail: [
        rewrite.upstream ? `원격 브랜치: ${rewrite.upstream}` : null,
        rewrite.before ? `이전 위치: ${rewrite.before}` : null,
        rewrite.after ? `현재 위치: ${rewrite.after}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    };
  }

  const tracking = await getTrackingStatus(cwd);
  if (tracking.kind === "no-upstream") {
    return {
      level: "blocked",
      code: "no-upstream",
      message: "현재 브랜치에 연결된 원격 브랜치(Upstream)가 없어 어디에서 변경을 받아와야 하는지 알 수 없습니다. 잘못된 원격을 임의로 선택하지 않도록 Pull을 중단했습니다. 먼저 Remote와 Upstream 연결을 확인한 뒤 다시 Pull하세요.",
      detail: null,
      affected: [],
    };
  }

  let incomingFiles = [];
  try {
    const incomingRaw = await runGit(cwd, ["diff", "--name-only", "HEAD..@{u}"]);
    incomingFiles = incomingRaw ? incomingRaw.split("\n").filter(Boolean) : [];
  } catch (error) {
    return {
      level: "blocked",
      code: "incoming-check-failed",
      message: "원격에서 들어올 파일을 확인하지 못해 Pull 안전 검사를 완료할 수 없습니다.",
      detail: String(error?.stderr ?? error?.message ?? error ?? ""),
      affected: [],
    };
  }

  const localFiles = changes.map((change) => change.path);
  const overlap = localFiles.filter((path) => incomingFiles.includes(path));
  if (overlap.length) {
    return {
      level: "blocked",
      code: "dirty-incoming-overlap",
      message: "로컬에서 아직 Commit하지 않은 파일과 이번 Pull로 들어올 원격 변경 파일이 겹칩니다. 그대로 Pull하면 Git이 로컬 변경을 덮지 못해 중단되거나 충돌이 발생할 수 있어 Safe Guard가 실행 전에 막았습니다. Compare에서 겹치는 파일을 확인한 뒤 Commit 또는 Stash로 보관하고 다시 시도하세요.",
      detail: `로컬 변경 ${localFiles.length}개 · 원격 변경 ${incomingFiles.length}개 · 겹침 ${overlap.length}개`,
      affected: overlap,
    };
  }

  try {
    const output = await runGit(cwd, [
      "merge-tree",
      "--write-tree",
      "--name-only",
      "HEAD",
      "@{u}",
    ]);

    return {
      level: "safe",
      code: "pull-clean",
      message: "Pull 전에 충돌 위험을 확인했습니다.",
      detail: output,
      affected: [],
    };
  } catch (error) {
    const detail = [error?.stdout, error?.stderr, error?.message]
      .filter(Boolean)
      .join("\n")
      .trim();

    if (/unknown option|usage: git merge-tree|not a git command/i.test(detail)) {
      return {
        level: "blocked",
        code: "merge-tree-unsupported",
        message: "현재 Git 버전에서는 Pull 전 충돌 검사를 안전하게 수행할 수 없습니다.",
        detail,
        affected: [],
      };
    }

    const affected = parseMergeTreeConflictOutput(detail);
    if (/CONFLICT|Auto-merging|changed in both/i.test(detail)) {
      return {
        level: "blocked",
        code: "pull-conflict",
        message: "Pull로 들어올 변경과 내 로컬 변경이 같은 파일의 같은 영역을 수정한 것으로 보여 충돌(Conflict) 가능성이 높습니다. 그대로 진행하면 Git이 어느 내용을 남길지 결정하지 못하고 작업이 멈출 수 있습니다. 먼저 충돌 예상 파일을 확인하고 내 변경을 Commit 또는 Stash로 보관한 뒤 Conflict Helper를 사용하세요.",
        detail,
        affected,
      };
    }

    return {
      level: "blocked",
      code: "pull-preflight-failed",
      message: "Pull 전 안전 검사를 완료하지 못했습니다.",
      detail,
      affected: [],
    };
  }
}
