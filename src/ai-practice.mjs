const GUIDE_CHECKS = {
  diverged: ["repository-visible", "tracking-not-diverged", "operation-finished"],
  "dirty-pull": ["repository-visible", "working-clean", "tracking-not-behind", "repository-visible", "operation-finished"],
  "merge-in-progress": ["repository-visible", "repository-visible", "repository-visible", "operation-finished"],
  "operation-in-progress": ["repository-visible", "repository-visible", "operation-finished"],
  "no-upstream": ["repository-visible", "has-upstream", "has-upstream"],
  "detached-head": ["repository-visible", "branch-attached", "branch-attached"],
  "stash-before-risk": ["repository-visible", "working-clean", "repository-visible"],
  "push-rejected": ["repository-visible", "working-clean", "tracking-not-behind"],
};

export function buildPracticePlan(guideKey, steps = []) {
  const checks = GUIDE_CHECKS[guideKey] ?? [];
  return steps.map((text, index) => ({
    index,
    text,
    check: checks[index] ?? "repository-visible",
  }));
}

export function evaluatePracticeStep(step, state = {}) {
  const check = step?.check ?? "repository-visible";
  const fail = (message) => ({ ok: false, message });
  const pass = (message) => ({ ok: true, message });

  if (check === "repository-visible") {
    return state.kind === "repository"
      ? pass("현재 저장소 상태를 확인했습니다.")
      : fail("Git 저장소 상태를 읽을 수 없습니다.");
  }
  if (check === "working-clean") {
    return (state.changes ?? []).length === 0
      ? pass("작업 폴더 변경이 정리되었습니다.")
      : fail(`아직 로컬 변경 ${(state.changes ?? []).length}개가 남아 있습니다.`);
  }
  if (check === "tracking-not-diverged") {
    return state.tracking?.kind !== "diverged"
      ? pass("로컬과 원격 기록이 더 이상 Diverged 상태가 아닙니다.")
      : fail("아직 로컬과 원격 기록이 갈라져 있습니다.");
  }
  if (check === "tracking-not-behind") {
    return state.tracking?.kind !== "behind"
      ? pass("원격에서 아직 받아야 할 커밋이 확인되지 않습니다.")
      : fail(`원격이 아직 ${state.tracking?.behind ?? 0}개 커밋 앞서 있습니다.`);
  }
  if (check === "operation-finished") {
    return state.operation
      ? fail(`아직 ${state.operation.operation} 작업이 진행 중입니다.`)
      : pass("진행 중인 Git 작업이 없습니다.");
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
