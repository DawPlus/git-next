function clean(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function formatStateRiskNext({ state, risk, next } = {}) {
  return [
    `상태: ${clean(state, "현재 상태를 확인할 수 없습니다.")}`,
    `위험: ${clean(risk, "확인된 위험 정보를 읽을 수 없습니다.")}`,
    `다음: ${clean(next, "현재 저장소 상태를 다시 확인하세요.")}`,
  ].join("\n");
}

export function guidanceNotice({ state, risk, next, ...rest } = {}) {
  const normalized = {
    state: clean(state, "현재 상태를 확인할 수 없습니다."),
    risk: clean(risk, "확인된 위험 정보를 읽을 수 없습니다."),
    next: clean(next, "현재 저장소 상태를 다시 확인하세요."),
  };
  return {
    ...rest,
    ...normalized,
    message: formatStateRiskNext(normalized),
  };
}
