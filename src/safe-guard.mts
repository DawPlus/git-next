import { t } from "./i18n.mjs";

export type GuardLevel = "safe" | "warning" | "blocked";

export interface SafeGuardRuleDefinition {
  id: string;
  title: string;
  purpose: string;
  risk: string;
  relaxable: boolean;
}

export interface GuardDecisionOptions {
  code?: string | null;
  title?: string | null;
  detail?: string | null;
  affected?: string[];
  actions?: string[];
  overridable?: boolean;
}

export interface GuardDecision extends GuardDecisionOptions {
  level: GuardLevel;
  message: string;
  code: string | null;
  title: string | null;
  detail: string | null;
  affected: string[];
  actions: string[];
  overridable: boolean;
}

const RULE_TEMPLATES = [
  {
    id: "dirty-incoming-overlap",
    key: "dirtyIncomingOverlap",
    relaxable: true,
  },
  {
    id: "no-upstream",
    key: "noUpstream",
    relaxable: false,
  },
  {
    id: "remote-history-rewritten",
    key: "remoteHistoryRewritten",
    relaxable: false,
  },
  {
    id: "protected-branch",
    key: "protectedBranch",
    relaxable: false,
  },
];

export function getSafeGuardRules(): SafeGuardRuleDefinition[] {
  return RULE_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    title: t(`safeguard.rules.${tpl.key}.title`),
    purpose: t(`safeguard.rules.${tpl.key}.purpose`),
    risk: t(`safeguard.rules.${tpl.key}.risk`),
    relaxable: tpl.relaxable,
  }));
}

export const SAFE_GUARD_RULES: SafeGuardRuleDefinition[] = new Proxy([] as SafeGuardRuleDefinition[], {
  get(target, prop, receiver) {
    const rules = getSafeGuardRules();
    return Reflect.get(rules, prop, receiver);
  },
});

export function listSafeGuardRules(relaxedIds: string[] = []) {
  const relaxed = new Set(relaxedIds);
  return getSafeGuardRules().map((rule) => ({ ...rule, relaxed: relaxed.has(rule.id) }));
}

const PRIORITY: Record<GuardLevel, number> = {
  safe: 0,
  warning: 1,
  blocked: 2,
};

export function createGuardDecision(
  level: GuardLevel,
  message: string,
  options: GuardDecisionOptions = {},
): GuardDecision {
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

export interface GuardRuleContext {
  action: string;
  [key: string]: unknown;
}

export type GuardRule = (context: GuardRuleContext) => GuardDecision | null | undefined | Promise<GuardDecision | null | undefined>;

export async function evaluateSafeguards({
  action,
  rules,
  context = {},
}: {
  action: string;
  rules: GuardRule[];
  context?: Record<string, unknown>;
}) {
  const decisions: GuardDecision[] = [];

  for (const rule of rules) {
    const decision = await rule({ action, ...context });
    if (decision) decisions.push(decision);
  }

  const highest = decisions.reduce(
    (current, decision) => PRIORITY[decision.level] > PRIORITY[current.level] ? decision : current,
    createGuardDecision("safe", t("safeguard.passed")),
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
