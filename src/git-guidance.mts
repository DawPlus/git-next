import { t } from "./i18n.mjs";

export interface StateRiskNext {
  state?: unknown;
  risk?: unknown;
  next?: unknown;
}

export interface GuidanceNoticeInput extends StateRiskNext {
  [key: string]: unknown;
}

function clean(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function formatStateRiskNext({ state, risk, next }: StateRiskNext = {}): string {
  return [
    t("guidance.labels.state", { value: clean(state, t("guidance.labels.stateFallback")) }),
    t("guidance.labels.risk", { value: clean(risk, t("guidance.labels.riskFallback")) }),
    t("guidance.labels.next", { value: clean(next, t("guidance.labels.nextFallback")) }),
  ].join("\n");
}

export function guidanceNotice<T extends GuidanceNoticeInput = GuidanceNoticeInput>(
  { state, risk, next, ...rest }: T = {} as T,
): Omit<T, "state" | "risk" | "next"> & Required<StateRiskNext> & { message: string } {
  const normalized = {
    state: clean(state, t("guidance.labels.stateFallback")),
    risk: clean(risk, t("guidance.labels.riskFallback")),
    next: clean(next, t("guidance.labels.nextFallback")),
  };
  return {
    ...rest,
    ...normalized,
    message: formatStateRiskNext(normalized),
  } as Omit<T, "state" | "risk" | "next"> & Required<StateRiskNext> & { message: string };
}
