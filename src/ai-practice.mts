import { t } from "./i18n.mjs";

const GUIDE_CHECKS = {
  diverged: ["manual-review", "tracking-not-diverged", "operation-finished"],
  "dirty-pull": ["manual-review", "working-clean", "tracking-not-behind", "manual-review", "operation-finished"],
  "merge-in-progress": ["manual-review", "manual-review", "manual-review", "operation-finished"],
  "operation-in-progress": ["manual-review", "manual-review", "operation-finished"],
  "no-upstream": ["manual-review", "has-upstream", "has-upstream"],
  "detached-head": ["manual-review", "branch-attached", "branch-attached"],
  "stash-before-risk": ["manual-review", "working-clean", "manual-review"],
  "push-rejected": ["manual-review", "working-clean", "tracking-not-behind"],
};

export function buildPracticePlan(guideKey: string, steps: string[] = []) {
  const checks = GUIDE_CHECKS[guideKey] ?? [];
  return steps.map((text, index) => ({
    index,
    text,
    check: checks[index] ?? "manual-review",
  }));
}

export function evaluatePracticeStep(step: any, state: any = {}, { manualConfirmed = false } = {}) {
  const check = step?.check ?? "manual-review";
  const fail = (message) => ({ ok: false, message });
  const pass = (message) => ({ ok: true, message, verifiedBy: "git" });

  if (state.kind !== "repository") return fail("Git 저장소 상태를 읽을 수 없습니다.");
  if (check === "manual-review") {
    if (manualConfirmed) return { ok: true, message: t("guidance.practice.selfDone"), verifiedBy: "self" };
    return fail(t("guidance.verification.manualReview"));
  }

  if (check === "repository-visible") {
    return state.kind === "repository"
      ? pass("현재 저장소 상태를 확인했습니다.")
      : fail("Git 저장소 상태를 읽을 수 없습니다.");
  }
  if (check === "working-clean") {
    return Array.isArray(state.changes) && state.changes.length === 0
      ? pass("작업 폴더 변경이 정리되었습니다.")
      : fail(`아직 로컬 변경 ${(state.changes ?? []).length}개가 남아 있습니다.`);
  }
  if (check === "tracking-not-diverged") {
    return ["ahead", "behind", "up-to-date"].includes(state.tracking?.kind)
      ? pass("로컬과 원격 기록이 더 이상 Diverged 상태가 아닙니다.")
      : fail(t("guidance.verification.trackingUnverified"));
  }
  if (check === "tracking-not-behind") {
    return ["ahead", "up-to-date"].includes(state.tracking?.kind) && !(state.tracking?.behind > 0)
      ? pass("원격에서 아직 받아야 할 커밋이 확인되지 않습니다.")
      : fail(t("guidance.verification.incomingUnverified"));
  }
  if (check === "operation-finished") {
    return state.operation === null
      ? pass("진행 중인 Git 작업이 없습니다.")
      : fail(t("guidance.verification.operationUnverified"));
  }
  if (check === "has-upstream") {
    return state.upstream
      ? pass(`현재 브랜치가 원격 브랜치 ${state.upstream}와 연결되어 있습니다.`)
      : fail("현재 브랜치에 연결된 원격 브랜치가 아직 없습니다.");
  }
  if (check === "branch-attached") {
    return state.branch
      ? pass(`현재 ${state.branch} 브랜치에 연결되어 있습니다.`)
      : fail("현재 브랜치에 들어가 있지 않은 커밋을 보고 있습니다.");
  }
  return fail("지원하지 않는 상태 확인 단계입니다.");
}
