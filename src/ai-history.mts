function compactDiagnosis(diagnosis: any = {}) {
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
}: { id?: string; repository?: string | null; provider?: string; diagnosis?: any; now?: string } = {}) {
  return {
    id,
    createdAt: now,
    repository: repository ?? null,
    provider: provider ?? "AI",
    diagnosis: compactDiagnosis(diagnosis),
    outcome: null,
  };
}

export function appendDiagnosisHistory(history: any[] = [], entry: any, max = 50) {
  return [entry, ...history.filter((item) => item?.id !== entry?.id)].slice(0, max);
}

export function updateDiagnosisHistoryOutcome(history: any[] = [], id: string, outcome: any) {
  return history.map((item) => item?.id === id ? { ...item, outcome } : item);
}
