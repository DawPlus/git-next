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

export function getActionRisk(action, { tracking = null, changes = [], operation = null } = {}) {
  if (operation) {
    return { level: "high", reason: `${operation.operation} 작업이 끝나지 않았습니다.` };
  }

  const destructiveReasons = {
    "force-push": "원격 커밋 기록을 바꿀 수 있습니다.",
    "hard-reset": "커밋과 파일 변경을 잃을 수 있습니다.",
    "discard-file": "파일의 커밋 전 변경을 버립니다.",
    "discard-changes": "추적 파일의 커밋 전 변경을 버립니다.",
    "delete-branch": "브랜치 커밋을 잃을 수 있습니다.",
  };
  if (destructiveReasons[action]) return { level: "high", reason: destructiveReasons[action] };

  if (action === "push") {
    if (tracking?.kind === "no-upstream") return { level: "medium", reason: "Push할 Remote 연결이 필요합니다." };
    if (["behind", "diverged", "unknown"].includes(tracking?.kind)) {
      return { level: "high", reason: tracking.kind === "unknown" ? "원격 상태를 확인할 수 없습니다." : "로컬과 원격 커밋 차이를 먼저 확인하세요." };
    }
  }

  if (action === "pull") {
    if (tracking?.kind === "diverged") return { level: "high", reason: "로컬과 원격 기록이 갈라졌습니다." };
    if (tracking?.kind === "unknown") return { level: "medium", reason: "원격 상태를 확인할 수 없습니다." };
  }

  const dirtyGuard = getDirtyTreeGuard(action, changes);
  if (dirtyGuard.level === "blocked") return { level: "high", reason: "작업 폴더에 보관하지 않은 변경이 있습니다." };
  if (dirtyGuard.level === "warning") return { level: "medium", reason: "작업 폴더에 커밋하지 않은 변경이 있습니다." };
  return { level: "low", reason: "현재 확인된 위험 신호가 없습니다." };
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
