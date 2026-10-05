import test from "node:test";
import assert from "node:assert/strict";

import { buildPracticePlan, evaluatePracticeStep } from "../src/ai-practice.mjs";

test("diverged guide creates observable practice expectations", () => {
  const plan = buildPracticePlan("diverged", [
    "그래프에서 차이를 확인해요.",
    "Merge 또는 Rebase를 선택해요.",
    "충돌을 정리해요.",
  ]);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].check, "repository-visible");
  assert.equal(plan[1].check, "tracking-not-diverged");
  assert.equal(plan[2].check, "operation-finished");
});

test("practice checks real repository state", () => {
  assert.equal(evaluatePracticeStep({ check: "tracking-not-diverged" }, {
    kind: "repository",
    tracking: { kind: "diverged" },
  }).ok, false);

  assert.equal(evaluatePracticeStep({ check: "tracking-not-diverged" }, {
    kind: "repository",
    tracking: { kind: "ahead" },
  }).ok, true);

  assert.equal(evaluatePracticeStep({ check: "operation-finished" }, {
    kind: "repository",
    operation: null,
  }).ok, true);
});

test("generic practice step still verifies repository availability", () => {
  assert.equal(evaluatePracticeStep({ check: "repository-visible" }, { kind: "repository" }).ok, true);
  assert.equal(evaluatePracticeStep({ check: "repository-visible" }, { kind: "no-repository" }).ok, false);
});
