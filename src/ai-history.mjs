function compactDiagnosis(diagnosis = {}) {
  return {
    situation: diagnosis.situation ?? "",
    summary: diagnosis.summary ?? "",
    risk: diagnosis.risk ?? "",
    next: diagnosis.next ?? "",
    guideKey: diagnosis.guideKey ?? null,
    animationPreset: diagnosis.animationPreset ?? "generic",
    recommendedAction: diagnosis.recommendedAction ?? null,
    confidence: diagnosis.confidence ?? "medium",
  };
}

export function createDiagnosisHistoryEntry({
  id = `diagnosis-${Date.now()}`,
  repository,
  provider,
  diagnosis,
  now = new Date().toISOString(),
} = {}) {
  return {
    id,
    createdAt: now,
    repository: repository ?? null,
    provider: provider ?? "AI",
    diagnosis: compactDiagnosis(diagnosis),
    outcome: null,
  };
}

export function appendDiagnosisHistory(history = [], entry, max = 50) {
  return [entry, ...history.filter((item) => item?.id !== entry?.id)].slice(0, max);
}

export function updateDiagnosisHistoryOutcome(history = [], id, outcome) {
  return history.map((item) => item?.id === id ? { ...item, outcome } : item);
}
