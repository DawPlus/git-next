const ALLOWED_ACTIONS = new Set([
  "open-guide", "compare", "merge", "rebase", "stash", "pull", "push",
  "continue", "abort", "branch", "remote", "scm",
]);

const GUIDE_PRESETS = new Map([
  ["dirty-pull", "pull"], ["pull-conflict", "conflict"], ["push-rejected", "push"],
  ["diverged", "diverged"], ["no-upstream", "upstream"], ["remote-rewritten", "force-push"],
  ["merge-in-progress", "merge"], ["detached-head", "detached"],
  ["operation-in-progress", "conflict"], ["undo-local-commit", "reset"],
  ["pushed-recovery", "revert"], ["stash-before-risk", "stash"],
  ["fetch-vs-pull", "fetch"], ["merge-vs-rebase", "rebase"], ["partial-stage", "commit"],
  ["wrong-staged-file", "commit"], ["switch-with-changes", "branch"],
  ["stash-apply-vs-pop", "stash"], ["worked-on-wrong-branch", "branch"],
  ["reset-mistake", "reset"], ["remote-branch-gone", "branch"],
]);

function cleanText(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function containsExecutableMarkup(value: unknown): boolean {
  return /<\/?(?:script|style|iframe)|javascript:|```(?:sh|bash|zsh|powershell|cmd)/i.test(String(value ?? ""));
}

export function buildDiagnosisContext(state: any = {}, recentActivity: any = null) {
  const recentFailure = recentActivity?.ok === false
    ? {
        action: cleanText(recentActivity.action, 60),
        code: cleanText(recentActivity.code, 80),
        message: cleanText(recentActivity.message, 220),
      }
    : null;

  return {
    branch: state.branch ?? null,
    upstream: state.upstream ?? null,
    tracking: state.tracking
      ? {
          kind: state.tracking.kind ?? "unknown",
          ahead: Number(state.tracking.ahead ?? 0),
          behind: Number(state.tracking.behind ?? 0),
        }
      : null,
    changedFiles: (state.changes ?? []).slice(0, 30).map((change) => String(change.path ?? "")).filter(Boolean),
    operation: state.operation?.operation ?? null,
    relaxedRules: (state.relaxedRules ?? []).slice(0, 10).map(String),
    recentFailure,
  };
}

export function normalizeDiagnosis(raw: any = {}) {
  const guideKey = GUIDE_PRESETS.has(raw.guideKey) ? raw.guideKey : null;
  return {
    situation: cleanText(raw.situation, 120),
    summary: cleanText(raw.summary, 500),
    risk: cleanText(raw.risk, 500),
    next: cleanText(raw.next, 500),
    guideKey,
    animationPreset: guideKey ? GUIDE_PRESETS.get(guideKey) : "generic",
    recommendedAction: ALLOWED_ACTIONS.has(raw.recommendedAction) ? raw.recommendedAction : null,
    confidence: ["low", "medium", "high"].includes(raw.confidence) ? raw.confidence : "medium",
  };
}

export function validateDiagnosis(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "AI 진단 형식이 올바르지 않습니다." };
  }
  const required = ["situation", "summary", "risk", "next", "recommendedAction", "confidence"];
  if (required.some((key) => !cleanText(raw[key]))) {
    return { ok: false, message: "AI 진단에 필요한 필드가 빠졌습니다." };
  }
  if (!ALLOWED_ACTIONS.has(raw.recommendedAction)) {
    return { ok: false, message: "AI가 Git Next에서 허용하지 않은 작업을 제안했습니다." };
  }
  if (["situation", "summary", "risk", "next"].some((key) => containsExecutableMarkup(raw[key]))) {
    return { ok: false, message: "AI 진단에 실행 가능한 코드가 포함되어 거부했습니다." };
  }
  return { ok: true, value: normalizeDiagnosis(raw) };
}

export function buildDiagnosisPrompt(context: unknown): string {
  return [
    "당신은 Git Next의 Git 상황 진단기입니다.",
    "명령을 실행하지 말고 현재 상태만 진단하세요.",
    "HTML/CSS/JS, 셸 명령, Markdown 코드블록을 반환하지 마세요.",
    "반드시 JSON만 반환하세요.",
    "필드: situation, summary, risk, next, guideKey, recommendedAction, confidence.",
    "confidence는 low | medium | high.",
    "allowedActions: " + [...ALLOWED_ACTIONS].join(", "),
    "context: " + JSON.stringify(context),
  ].join("\n");
}

export const DIAGNOSIS_ACTIONS = Object.freeze([...ALLOWED_ACTIONS]);
export const DIAGNOSIS_GUIDE_PRESETS = Object.freeze(Object.fromEntries(GUIDE_PRESETS));
