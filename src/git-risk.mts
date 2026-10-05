import { guidanceNotice } from "./git-guidance.mjs";
import type { TrackingStatus, WorkingTreeChange } from "./git-types.mjs";

export type RiskLevel = "low" | "medium" | "high";

export interface InProgressOperation {
  operation: string;
  path?: string;
}

export function getDirtyTreeGuard(action: string, changes: WorkingTreeChange[] = []) {
  if (changes.length === 0) {
    return {
      level: "safe" as const,
      code: "working-tree-clean",
      message: "로컬 작업 트리가 깨끗합니다.",
      affected: [] as string[],
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
    return guidanceNotice({
      level: "warning" as const,
      code: "working-tree-dirty",
      state: `커밋하지 않은 로컬 변경 ${changes.length}개`,
      risk: "지금 실행하려는 작업이 파일을 직접 덮지 않더라도 이후 Git 상태를 이해하기 어려워질 수 있습니다.",
      next: "가능하면 먼저 Commit하거나 Stash로 보관한 뒤 진행하세요.",
      affected: changes.map((change) => change.path),
    });
  }

  return guidanceNotice({
    level: "blocked" as const,
    code: "dirty-working-tree",
    state: `커밋하지 않은 로컬 변경 ${changes.length}개`,
    risk: "이 작업을 진행하면 내 수정 내용과 이동하거나 받아올 변경이 겹쳐 파일이 덮이거나 충돌할 수 있습니다.",
    next: "먼저 Commit하거나 Stash로 현재 작업을 안전하게 보관한 뒤 다시 진행하세요.",
    affected: changes.map((change) => change.path),
  });
}

export function isProtectedBranch(
  branch: string | null | undefined,
  patterns: string[] = ["main", "master", "release/*"],
): boolean {
  const name = String(branch ?? "").trim();
  if (!name) return false;
  return patterns.some((pattern) => pattern.endsWith("/*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern);
}

export function getProtectedBranchGuard(action: string, branch: string | null | undefined, patterns?: string[]) {
  const riskyActions = new Set(["delete-branch", "force-push", "rebase", "reset", "hard-reset"]);
  if (!riskyActions.has(action) || !isProtectedBranch(branch, patterns)) {
    return { protected: false, level: "safe" as const, code: null, message: null };
  }
  return guidanceNotice({
    protected: true,
    level: "warning" as const,
    code: "protected-branch",
    state: `보호 브랜치 '${branch}'`,
    risk: `${action} 작업이 공유 기록이나 기본 브랜치 흐름에 영향을 줄 수 있습니다.`,
    next: "대상 브랜치와 변경 범위를 다시 확인한 뒤 명시적으로 진행하세요.",
  });
}

export function getActionRisk(
  action: string,
  {
    tracking = null,
    changes = [],
    operation = null,
  }: {
    tracking?: TrackingStatus | null;
    changes?: WorkingTreeChange[];
    operation?: InProgressOperation | null;
  } = {},
): { level: RiskLevel; reason: string } {
  if (operation) return { level: "high", reason: `${operation.operation} 작업이 끝나지 않았습니다.` };

  const destructiveReasons: Record<string, string> = {
    "force-push": "원격 커밋 기록을 바꿀 수 있습니다.",
    "hard-reset": "커밋과 파일 변경을 잃을 수 있습니다.",
    "discard-file": "파일의 커밋 전 변경을 버립니다.",
    "discard-changes": "추적 파일의 커밋 전 변경을 버립니다.",
    "delete-branch": "브랜치 커밋을 잃을 수 있습니다.",
  };
  if (destructiveReasons[action]) return { level: "high", reason: destructiveReasons[action] };

  if (action === "push") {
    if (tracking?.kind === "no-upstream") return { level: "medium", reason: "Push할 Remote 연결이 필요합니다." };
    if (tracking && ["behind", "diverged", "unknown"].includes(tracking.kind)) {
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

export function getDestructiveActionGuard(
  action: string,
  impact: { detail?: string | null; affected?: string[] } = {},
) {
  const messages: Record<string, string> = {
    "hard-reset": "Hard Reset은 로컬 커밋이나 변경 내용을 잃게 만들 수 있습니다.",
    "force-push": "Force Push는 원격 브랜치의 커밋 기록을 덮어쓸 수 있습니다.",
    "delete-branch": "브랜치 삭제는 아직 병합하지 않은 커밋을 잃게 만들 수 있습니다.",
    "discard-changes": "변경 내용 버리기는 커밋하지 않은 파일 변경을 되돌립니다.",
  };

  const message = messages[action];
  if (!message) {
    return guidanceNotice({
      level: "blocked" as const,
      code: "unknown-destructive-action",
      state: "영향 범위를 확인할 수 없는 위험 작업",
      risk: "예상하지 못한 Git 기록 또는 파일 변경이 발생할 수 있습니다.",
      next: "지원되는 Git Next 작업으로 다시 선택하세요.",
      detail: null,
      affected: [] as string[],
      requiresConfirmation: true,
    });
  }

  return guidanceNotice({
    level: "warning" as const,
    code: action,
    state: `${action} 실행 전 확인`,
    risk: message,
    next: "영향 대상을 확인하고 필요한 경우에만 실행하세요.",
    detail: impact.detail ?? null,
    affected: impact.affected ?? [],
    requiresConfirmation: true,
  });
}
