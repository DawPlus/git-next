import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDiagnosisHistory,
  createDiagnosisHistoryEntry,
  updateDiagnosisHistoryOutcome,
} from "../src/ai-history.mts";

test("history entry keeps diagnosis metadata without raw prompts", () => {
  const entry = createDiagnosisHistoryEntry({
    id: "d1",
    repository: "/repo",
    provider: "codex",
    diagnosis: {
      situation: "diverged",
      summary: "갈라짐",
      risk: "주의",
      next: "Merge",
      guideKey: "diverged",
      animationPreset: "diverged",
      recommendedAction: "merge",
      confidence: "high",
    },
    now: "2026-10-05T00:00:00.000Z",
  });
  assert.equal(entry.id, "d1");
  assert.equal(entry.repository, "/repo");
  assert.equal(entry.diagnosis.summary, "갈라짐");
  assert.equal("prompt" in entry, false);
});

test("history is newest-first and bounded", () => {
  const next = appendDiagnosisHistory(
    [{ id: "old-1" }, { id: "old-2" }],
    { id: "new" },
    2,
  );
  assert.deepEqual(next.map((item) => item.id), ["new", "old-1"]);
});

test("history outcome updates only the selected record", () => {
  const history = [{ id: "a", outcome: null }, { id: "b", outcome: null }];
  const next = updateDiagnosisHistoryOutcome(history, "b", {
    action: "merge",
    status: "started",
  });
  assert.equal(next[0].outcome, null);
  assert.deepEqual(next[1].outcome, { action: "merge", status: "started" });
});
