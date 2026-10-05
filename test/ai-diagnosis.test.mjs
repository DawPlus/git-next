import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDiagnosisContext,
  buildDiagnosisPrompt,
  normalizeDiagnosis,
  validateDiagnosis,
} from "../src/ai-diagnosis.mts";

test("buildDiagnosisContext keeps Git diagnosis input compact", () => {
  const context = buildDiagnosisContext({
    root: "/repo",
    branch: "feature/login",
    upstream: "origin/feature/login",
    tracking: { kind: "diverged", ahead: 2, behind: 1 },
    changes: [{ path: "src/a.js" }, { path: "src/b.js" }],
    operation: { operation: "rebase", path: "/repo/.git/rebase-merge" },
    relaxedRules: ["작업 폴더 겹침"],
  }, { action: "push", ok: false, code: "diverged", message: "Push blocked" });

  assert.deepEqual(context, {
    branch: "feature/login",
    upstream: "origin/feature/login",
    tracking: { kind: "diverged", ahead: 2, behind: 1 },
    changedFiles: ["src/a.js", "src/b.js"],
    operation: "rebase",
    relaxedRules: ["작업 폴더 겹침"],
    recentFailure: { action: "push", code: "diverged", message: "Push blocked" },
  });
});

test("validateDiagnosis accepts allowed guide/action values and maps known animation", () => {
  const result = validateDiagnosis({
    situation: "diverged",
    summary: "양쪽에 다른 커밋이 있습니다.",
    risk: "기록을 덮을 수 있습니다.",
    next: "Merge 또는 Rebase를 선택하세요.",
    guideKey: "diverged",
    recommendedAction: "merge",
    confidence: "high",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.animationPreset, "diverged");
});

test("normalizeDiagnosis falls back to generic card for unknown guide presets", () => {
  const result = normalizeDiagnosis({
    situation: "custom-case",
    summary: "설명",
    risk: "주의",
    next: "확인",
    guideKey: "made-up",
    recommendedAction: "open-guide",
    confidence: "medium",
  });

  assert.equal(result.guideKey, null);
  assert.equal(result.animationPreset, "generic");
});

test("validateDiagnosis rejects arbitrary actions and executable content", () => {
  assert.equal(validateDiagnosis({
    situation: "diverged",
    summary: "<script>alert(1)</script>",
    risk: "risk",
    next: "next",
    guideKey: "diverged",
    recommendedAction: "shell",
    confidence: "high",
  }).ok, false);
});

test("buildDiagnosisPrompt requires JSON only and allowed Git Next actions", () => {
  const prompt = buildDiagnosisPrompt({ branch: "main", tracking: { kind: "behind", ahead: 0, behind: 2 }, changedFiles: [] });
  assert.match(prompt, /JSON만/);
  assert.match(prompt, /allowedActions/);
  assert.match(prompt, /behind/);
});
