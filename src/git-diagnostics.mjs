export function recommendNextAction({ tracking, changes = [], operation = null } = {}) {
  if (operation) {
    return {
      kind: "operation",
      title: `${operation.operation} 작업을 먼저 끝내세요`,
      detail: "계속하거나 취소하기 전에는 다른 Git 작업을 이어가지 않는 게 안전합니다.",
    };
  }
  if (changes.length) {
    return {
      kind: "dirty",
      title: "로컬 변경을 먼저 Commit 또는 Stash하세요",
      detail: "",
    };
  }
  if (tracking?.kind === "behind") {
    return { kind: "pull", title: "원격 변경을 먼저 Pull하세요", detail: `원격이 ${tracking.behind}커밋 앞서 있습니다.` };
  }
  if (tracking?.kind === "diverged") {
    return { kind: "diverged", title: "브랜치 차이를 먼저 확인하세요", detail: "로컬과 원격 양쪽에 서로 다른 커밋이 있습니다." };
  }
  if (tracking?.kind === "ahead") {
    return { kind: "push", title: "Push할 변경이 있습니다", detail: `로컬이 ${tracking.ahead}커밋 앞서 있습니다.` };
  }
  return { kind: "clean", title: "현재 특별히 필요한 Git 작업이 없습니다", detail: "로컬과 원격 상태가 정리되어 있습니다." };
}

export function getGitDoctorFindings({ head, tracking, upstreamState = null, changes = [], operation = null, remoteRewrite = null } = {}) {
  const findings = [];
  const add = (finding) => findings.push(finding);

  if (operation) {
    add({
      id: "operation",
      state: `${operation.operation} 진행 중`,
      risk: "작업을 끝내기 전에 다른 Git 작업을 실행하면 상태가 더 복잡해질 수 있습니다.",
      recommendation: "충돌 파일과 Continue/Abort 방법을 확인하세요.",
      action: "conflict",
    });
  }
  if (head?.detached) {
    add({
      id: "detached-head",
      state: "Detached HEAD",
      risk: "새 커밋이 브랜치에 연결되지 않을 수 있습니다.",
      recommendation: "작업을 유지하려면 브랜치를 만들고, 아니면 기존 브랜치로 돌아가세요.",
      action: "branch",
      guideKey: "detached-head",
    });
  }

  const trackingFindings = {
    "no-upstream": {
      id: "no-upstream",
      state: "Upstream 없음",
      risk: "Pull 또는 Push의 대상 브랜치를 확인할 수 없습니다.",
      recommendation: "Remote와 추적 브랜치를 확인하세요.",
      action: "remote",
      guideKey: "no-upstream",
    },
    unknown: {
      id: "tracking-unknown",
      state: "원격 추적 상태 확인 불가",
      risk: "로컬과 원격 중 어느 쪽이 앞섰는지 알 수 없습니다.",
      recommendation: "Remote 연결을 확인한 뒤 새로고침하세요.",
      action: "refresh",
    },
    diverged: {
      id: "diverged",
      state: `로컬 ${tracking.ahead}개 앞섬 · 원격 ${tracking.behind}개 앞섬`,
      risk: "양쪽 기록이 갈라져 바로 동기화할 수 없습니다.",
      recommendation: "Branch 비교에서 양쪽 커밋을 확인하세요.",
      action: "compare",
      guideKey: "diverged",
    },
    behind: {
      id: "behind",
      state: `원격이 ${tracking.behind}개 커밋 앞섬`,
      risk: "로컬에 아직 없는 변경이 원격에 있습니다.",
      recommendation: "Pull 전에 변경 파일과 충돌 여부를 확인하세요.",
      action: "pull",
    },
    ahead: {
      id: "ahead",
      state: `로컬이 ${tracking.ahead}개 커밋 앞섬`,
      risk: "현재 커밋은 원격에 아직 공유되지 않았습니다.",
      recommendation: "보낼 커밋을 확인하고 Push하세요.",
      action: "push",
    },
  };
  const upstreamFindings = {
    "remote-branch-missing": {
      id: "upstream-gone",
      state: `Remote 브랜치를 찾을 수 없음 · ${upstreamState?.upstream ?? "현재 브랜치"}`,
      risk: "Remote 브랜치가 삭제됐을 수 있습니다. 로컬 브랜치는 아직 남아 있습니다.",
      recommendation: "Branch 정리 후보를 검토하세요. 로컬 브랜치는 자동 삭제하지 않았습니다.",
      action: "branch",
    },
    "tracking-ref-missing": {
      id: "tracking-ref-missing",
      state: `로컬 Remote 추적 정보가 없음 · ${upstreamState?.upstream ?? "현재 브랜치"}`,
      risk: "Remote 브랜치가 남아 있어도 로컬 추적 정보가 오래됐을 수 있습니다.",
      recommendation: "Remote 관리에서 Fetch 및 정리를 실행하세요.",
      action: "fetch",
    },
    "remote-missing": {
      id: "upstream-remote-missing",
      state: `Upstream Remote '${upstreamState?.remote ?? "-"}'을 찾을 수 없음`,
      risk: "연결된 Remote 설정이 제거됐을 수 있습니다.",
      recommendation: "Remote 설정을 확인하거나 다시 추가하세요.",
      action: "remote",
    },
    unknown: {
      id: "upstream-unverified",
      state: `Upstream 상태 확인 불가 · ${upstreamState?.upstream ?? "현재 브랜치"}`,
      risk: "Remote에 연결하지 못해 브랜치 존재 여부를 확인할 수 없습니다.",
      recommendation: "Remote 연결을 확인한 뒤 Fetch 및 정리를 실행하세요.",
      action: "remote",
    },
  };
  if (upstreamFindings[upstreamState?.kind]) {
    add(upstreamFindings[upstreamState.kind]);
  } else if (trackingFindings[tracking?.kind]) {
    add(trackingFindings[tracking.kind]);
  }

  if (changes.length) {
    add({
      id: "dirty",
      state: `커밋하지 않은 변경 ${changes.length}개`,
      risk: "전환이나 복구 작업에서 로컬 내용을 잃을 수 있습니다.",
      recommendation: "Source Control에서 변경을 확인하고 Commit 또는 Stash하세요.",
      action: "scm",
    });
  }
  if (remoteRewrite?.rewritten) {
    add({
      id: "remote-rewrite",
      state: "원격 기록이 다시 작성됐을 수 있음",
      risk: "원격 커밋이 이전에 확인한 기록과 달라졌습니다.",
      recommendation: "Push를 멈추고 Compare에서 원격 기록을 확인하세요.",
      action: "compare",
      guideKey: "remote-history-rewritten",
    });
  }

  if (!findings.length) {
    add({
      id: "healthy",
      state: `정상 · ${head?.branch ?? "현재 브랜치"}`,
      risk: "확인된 위험이 없습니다.",
      recommendation: "현재 Git 작업을 계속할 수 있습니다.",
      action: "refresh",
    });
  }
  return findings;
}

export function getRetryCheck(activity = {}) {
  const code = String(activity.code ?? "");
  if (/dirty-working-tree|dirty-incoming-overlap/.test(code)) return "로컬 변경을 Commit 또는 Stash했는지 확인하세요.";
  if (/no-upstream/.test(code)) return "Push할 Remote와 Upstream이 연결되어 있는지 확인하세요.";
  if (/diverged|behind|non-fast-forward/.test(code)) return "Remote에서 새로 온 커밋과 로컬 커밋을 비교하세요.";
  if (/(?:merge|rebase|cherry-pick|revert|operation)-in-progress/.test(code)) return "진행 중인 Merge/Rebase 작업을 계속하거나 취소하세요.";
  const checks = {
    pull: "작업 폴더와 진행 중 Git 작업을 확인한 뒤 Pull하세요.",
    push: "Upstream과 로컬/원격 커밋 차이를 확인한 뒤 Push하세요.",
    commit: "Staged 파일과 Commit 메시지를 다시 확인하세요.",
    "stash-push": "보관할 변경 파일과 Stash 메모를 다시 확인하세요.",
  };
  return checks[activity.action] ?? "현재 저장소 상태를 확인한 뒤 작업을 다시 실행하세요.";
}

export function getUndoRecommendation(activity) {
  if (!activity?.ok) return null;
  if (activity.recoveryPoint) {
    return {
      id: "recovery",
      label: "복구 지점에서 브랜치 만들기",
      reason: "작업 전 커밋 위치가 보존되어 있어 원래 상태를 안전하게 되살릴 수 있습니다.",
      recoveryPoint: activity.recoveryPoint,
    };
  }

  const recommendations = {
    push: {
      id: "pushed",
      label: "Revert 커밋 만들기",
      reason: "이미 공유한 변경은 기록을 다시 쓰지 않고 반대 커밋을 추가하는 편이 안전합니다.",
    },
    commit: {
      id: "commit",
      label: "마지막 로컬 Commit 취소",
      reason: "Push 전 커밋이면 파일 변경을 보존한 채 Commit만 취소할 수 있습니다.",
    },
    pull: {
      id: "reflog",
      label: "Reflog에서 이전 위치 보존",
      reason: "Pull 전 커밋 위치를 새 브랜치로 보존하면 현재 기록을 덮지 않습니다.",
    },
    "switch-branch": {
      id: "reflog",
      label: "Reflog에서 이전 위치 보존",
      reason: "전환 전 HEAD를 새 브랜치로 보존하면 커밋을 잃지 않습니다.",
    },
    "delete-branch": {
      id: "reflog",
      label: "Reflog에서 삭제 브랜치 복구",
      reason: "삭제된 브랜치의 마지막 커밋 위치를 찾아 새 브랜치로 보존합니다.",
    },
  };
  return recommendations[activity.action] ?? null;
}
