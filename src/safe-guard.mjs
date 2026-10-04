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
