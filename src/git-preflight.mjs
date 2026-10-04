import { existsSync } from "node:fs";

import { isAbsolute, resolve } from "node:path";

import { runGitInspection, getTrackingStatus, getHeadSafety, getWorkingTreeChanges, parseMergeTreeConflictOutput } from "./git-tracking.mjs";

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
      const raw = await runGitInspection(cwd, ["rev-parse", "--git-path", gitPath]);
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
    upstream = await runGitInspection(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    before = await runGitInspection(cwd, ["rev-parse", "@{u}"]);
  } catch {
    return { rewritten: false, upstream: null, before: null, after: null };
  }

  try {
    await runGitInspection(cwd, ["fetch", "--prune"]);
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
    after = await runGitInspection(cwd, ["rev-parse", "@{u}"]);
  } catch {
    return { rewritten: true, upstream, before, after: null };
  }

  if (before === after) {
    return { rewritten: false, upstream, before, after };
  }

  try {
    await runGitInspection(cwd, ["merge-base", "--is-ancestor", before, after]);
    return { rewritten: false, upstream, before, after };
  } catch {
    return { rewritten: true, upstream, before, after };
  }
}

export async function detectCachedRemoteHistoryRewrite(cwd, runGit = runGitInspection) {
  try {
    const upstream = await runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    const after = await runGit(cwd, ["rev-parse", "@{u}"]);
    const history = await runGit(cwd, ["reflog", "show", "--format=%H", "-n", "2", "@{u}"]);
    const [latest, before] = history.split("\n");
    if (!before || latest !== after) return { rewritten: false, available: false, upstream };

    try {
      await runGit(cwd, ["merge-base", "--is-ancestor", before, after]);
      return { rewritten: false, available: true, upstream, before, after };
    } catch (error) {
      if (error?.code !== 1) return { rewritten: false, available: false, upstream };
      return { rewritten: true, available: true, upstream, before, after };
    }
  } catch {
    return { rewritten: false, available: false, upstream: null };
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

export async function preflightPullSafety(cwd, runGit = runGitInspection) {
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
