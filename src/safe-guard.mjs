export const SAFE_GUARD_RULES = [
  {
    id: "dirty-incoming-overlap",
    title: "Pull 전 겹치는 로컬 변경 차단",
    purpose: "내 로컬 수정 파일과 Remote에서 들어올 파일이 겹치면 먼저 알려줘요.",
    risk: "완화하면 Pull 중 충돌이 발생하거나 Git이 Pull을 멈출 수 있어요.",
    relaxable: true,
  },
  {
    id: "no-upstream",
    title: "Remote 연결이 없는 작업 중단",
    purpose: "Pull/Push 대상 브랜치가 정해지지 않으면 실행을 멈춰요.",
    risk: "올바른 대상을 알 수 없어 완화할 수 없어요.",
    relaxable: false,
  },
  {
    id: "remote-history-rewritten",
    title: "원격 기록 재작성 감지",
    purpose: "Remote 커밋 기록이 바뀐 경우 덮어쓰기 가능성을 알려줘요.",
    risk: "공유 커밋이 사라질 수 있어 세션에서 완화할 수 없어요.",
    relaxable: false,
  },
];

export function listSafeGuardRules(relaxedIds = []) {
  const relaxed = new Set(relaxedIds);
  return SAFE_GUARD_RULES.map((rule) => ({ ...rule, relaxed: relaxed.has(rule.id) }));
}

const PRIORITY = {
  safe: 0,
  warning: 1,
  blocked: 2,
};

export function createGuardDecision(level, message, options = {}) {
  if (!(level in PRIORITY)) {
    throw new Error(`Unknown Safe Guard level: ${level}`);
  }

  return {
    level,
    code: options.code ?? null,
    title: options.title ?? null,
    message,
    detail: options.detail ?? null,
    affected: options.affected ?? [],
    actions: options.actions ?? [],
    overridable: options.overridable ?? level === "warning",
  };
}

export async function evaluateSafeguards({ action, rules, context = {} }) {
  const decisions = [];

  for (const rule of rules) {
    const decision = await rule({ action, ...context });
    if (decision) {
      decisions.push(decision);
    }
  }

  const highest = decisions.reduce(
    (current, decision) =>
      PRIORITY[decision.level] > PRIORITY[current.level] ? decision : current,
    createGuardDecision("safe", "안전 검사를 통과했습니다."),
  );

  return {
    action,
    level: highest.level,
    title: highest.title,
    message: highest.message,
    detail: highest.detail,
    affected: decisions.flatMap((decision) => decision.affected ?? []),
    actions: highest.actions ?? [],
    reasons: decisions.map((decision) => decision.message),
    canProceed: highest.level === "safe",
    canOverride: highest.level === "warning" && highest.overridable !== false,
    decisions,
  };
}
