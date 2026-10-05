import { existsSync } from "node:fs";

import { isAbsolute, resolve } from "node:path";

import { runGitInspection, getTrackingStatus, getHeadSafety, getWorkingTreeChanges, parseMergeTreeConflictOutput, getPushGuidance } from "./git-tracking.mjs";
import { guidanceNotice } from "./git-guidance.mjs";

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
    return guidanceNotice({
      level: "blocked",
      code: "detached-head",
      state: "Detached HEAD 상태",
      risk: "새 커밋이 정상적인 브랜치 흐름에 연결되지 않을 수 있습니다.",
      next: "유지할 작업이 있다면 새 브랜치를 만들거나 기존 브랜치로 이동한 뒤 Push하세요.",
      detail: null,
      affected: [],
    });
  }

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    return guidanceNotice({
      level: "blocked",
      code: `${operation.operation}-in-progress`,
      state: `${operation.operation} 작업 진행 중`,
      risk: "미완료 상태에서 Push하면 복구 과정이 더 복잡해질 수 있습니다.",
      next: "먼저 Continue 또는 Abort로 현재 작업을 끝낸 뒤 Push하세요.",
      detail: operation.path,
      affected: [],
      actions: ["operation-recovery"],
    });
  }

  const rewrite = await detectRemoteHistoryRewrite(cwd);
  if (rewrite.fetchError) {
    return guidanceNotice({
      level: "blocked",
      code: "fetch-failed",
      state: "원격 최신 상태 확인 실패",
      risk: "Remote 상태를 모른 채 Push하면 예상하지 못한 기록 변경이 생길 수 있습니다.",
      next: "네트워크와 Remote 상태를 확인한 뒤 다시 시도하세요.",
      detail: rewrite.fetchError,
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    });
  }
  if (rewrite.rewritten) {
    return guidanceNotice({
      level: "blocked",
      code: "remote-history-rewritten",
      state: "원격 브랜치 기록이 다시 작성된 것으로 보임",
      risk: "바로 Push하면 다른 기록을 덮을 수 있습니다.",
      next: "Compare에서 원격 변경을 확인한 뒤 진행하세요.",
      detail: [rewrite.upstream, rewrite.before, rewrite.after].filter(Boolean).join("\n"),
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    });
  }

  const status = await getTrackingStatus(cwd);
  const guidance = getPushGuidance(status);
  return {
    level: guidance.allowed ? "safe" : "blocked",
    code: status.kind,
    state: guidance.state,
    risk: guidance.risk,
    next: guidance.next,
    message: guidance.message,
    detail: `추적 상태: ${status.kind}; ahead ${status.ahead}; behind ${status.behind}`,
    affected: status.upstream ? [status.upstream] : [],
    status,
  };
}

export async function preflightPullSafety(cwd, runGit = runGitInspection) {
  const head = await getHeadSafety(cwd);
  if (head.detached) {
    return guidanceNotice({
      level: "blocked",
      code: "detached-head",
      state: "Detached HEAD 상태",
      risk: "Pull 변경을 반영할 브랜치 대상을 명확히 할 수 없습니다.",
      next: "먼저 작업할 브랜치를 선택한 뒤 Pull하세요.",
      detail: null,
      affected: [],
    });
  }

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    return guidanceNotice({
      level: "blocked",
      code: `${operation.operation}-in-progress`,
      state: `${operation.operation} 작업 진행 중`,
      risk: "Pull을 겹치면 변경이 섞여 충돌 원인을 파악하기 어려워질 수 있습니다.",
      next: "먼저 Continue 또는 Abort로 현재 작업을 정리한 뒤 Pull하세요.",
      detail: operation.path,
      affected: [],
      actions: ["operation-recovery"],
    });
  }

  let changes = [];
  try {
    changes = await getWorkingTreeChanges(cwd);
  } catch (error) {
    return guidanceNotice({
      level: "blocked",
      code: "working-tree-check-failed",
      state: "로컬 변경 상태 확인 실패",
      risk: "작업 폴더 상태를 모른 채 Pull하면 로컬 변경과 원격 변경의 영향을 판단할 수 없습니다.",
      next: "Git 상태를 다시 확인한 뒤 Pull하세요.",
      detail: String(error?.stderr ?? error?.message ?? error ?? ""),
      affected: [],
    });
  }

  const rewrite = await detectRemoteHistoryRewrite(cwd);
  if (rewrite.fetchError) {
    return guidanceNotice({
      level: "blocked",
      code: "fetch-failed",
      state: "원격 변경 정보 확인 실패",
      risk: "들어올 변경을 모른 채 Pull하면 충돌 가능성을 미리 판단할 수 없습니다.",
      next: "네트워크와 Remote 상태를 확인한 뒤 다시 시도하세요.",
      detail: rewrite.fetchError,
      affected: [],
    });
  }

  if (rewrite.rewritten) {
    return guidanceNotice({
      level: "blocked",
      code: "remote-history-rewritten",
      state: "원격 브랜치 기록이 이전 흐름과 달라짐",
      risk: "바로 Pull이나 Push하면 내 커밋이 잘못된 기준에 합쳐지거나 다른 기록을 덮을 수 있습니다.",
      next: "그래프와 Branch 비교에서 달라진 지점을 먼저 확인하세요.",
      detail: [
        rewrite.upstream ? `원격 브랜치: ${rewrite.upstream}` : null,
        rewrite.before ? `이전 위치: ${rewrite.before}` : null,
        rewrite.after ? `현재 위치: ${rewrite.after}` : null,
      ].filter(Boolean).join("\n"),
      affected: rewrite.upstream ? [rewrite.upstream] : [],
    });
  }

  const tracking = await getTrackingStatus(cwd);
  if (tracking.kind === "no-upstream") {
    return guidanceNotice({
      level: "blocked",
      code: "no-upstream",
      state: "현재 브랜치에 Upstream이 없음",
      risk: "어디에서 변경을 받아와야 하는지 확실히 판단할 수 없습니다.",
      next: "먼저 Remote와 Upstream 연결을 확인한 뒤 다시 Pull하세요.",
      detail: null,
      affected: [],
    });
  }

  let incomingFiles = [];
  try {
    const incomingRaw = await runGit(cwd, ["diff", "--name-only", "HEAD..@{u}"]);
    incomingFiles = incomingRaw ? incomingRaw.split("\n").filter(Boolean) : [];
  } catch (error) {
    return guidanceNotice({
      level: "blocked",
      code: "incoming-check-failed",
      state: "Pull로 들어올 파일 확인 실패",
      risk: "영향 파일을 모른 채 Pull하면 겹침과 충돌 가능성을 판단할 수 없습니다.",
      next: "Remote 상태를 다시 확인한 뒤 Pull하세요.",
      detail: String(error?.stderr ?? error?.message ?? error ?? ""),
      affected: [],
    });
  }

  const localFiles = changes.map((change) => change.path);
  const overlap = localFiles.filter((path) => incomingFiles.includes(path));
  if (overlap.length) {
    return guidanceNotice({
      level: "blocked",
      code: "dirty-incoming-overlap",
      state: `로컬 변경과 원격 변경 파일이 ${overlap.length}개 겹침`,
      risk: "그대로 Pull하면 로컬 변경을 덮지 못해 중단되거나 충돌이 발생할 수 있습니다.",
      next: "Compare에서 겹치는 파일을 확인하고 Commit 또는 Stash로 보관한 뒤 다시 시도하세요.",
      detail: `로컬 변경 ${localFiles.length}개 · 원격 변경 ${incomingFiles.length}개 · 겹침 ${overlap.length}개`,
      affected: overlap,
    });
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
      return guidanceNotice({
        level: "blocked",
        code: "merge-tree-unsupported",
        state: "현재 Git 버전에서 Pull 충돌 미리보기 미지원",
        risk: "충돌 가능성을 안전하게 미리 판단할 수 없습니다.",
        next: "Git 버전을 확인하거나 Compare로 변경을 검토한 뒤 Pull하세요.",
        detail,
        affected: [],
      });
    }

    const affected = parseMergeTreeConflictOutput(detail);
    if (/CONFLICT|Auto-merging|changed in both/i.test(detail)) {
      return guidanceNotice({
        level: "blocked",
        code: "pull-conflict",
        state: "Pull 변경과 로컬 변경의 충돌 가능성이 높음",
        risk: "같은 영역을 수정해 Git이 어느 내용을 남길지 결정하지 못하고 작업이 멈출 수 있습니다.",
        next: "충돌 예상 파일을 확인하고 내 변경을 Commit 또는 Stash로 보관한 뒤 Conflict Helper를 사용하세요.",
        detail,
        affected,
      });
    }

    return guidanceNotice({
      level: "blocked",
      code: "pull-preflight-failed",
      state: "Pull 전 안전 검사 실패",
      risk: "충돌이나 영향 범위를 충분히 확인하지 못했습니다.",
      next: "Git 상세 정보를 확인한 뒤 다시 시도하세요.",
      detail,
      affected: [],
    });
  }
}
