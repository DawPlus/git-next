import test from "node:test";
import assert from "node:assert/strict";

import { buildPracticePlan, evaluatePracticeStep } from "../src/ai-practice.mts";

test("diverged guide creates observable practice expectations", () => {
  const plan = buildPracticePlan("diverged", [
    "그래프에서 차이를 확인해요.",
    "Merge 또는 Rebase를 선택해요.",
    "충돌을 정리해요.",
  ]);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].check, "manual-review");
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

test("unknown and diverged tracking cannot complete synchronization practice", () => {
  for (const tracking of [undefined, { kind: "unknown" }, { kind: "no-upstream" }, { kind: "diverged", behind: 2 }]) {
    assert.equal(evaluatePracticeStep({ check: "tracking-not-behind" }, { kind: "repository", tracking }).ok, false);
    assert.equal(evaluatePracticeStep({ check: "tracking-not-diverged" }, { kind: "repository", tracking }).ok, false);
  }
  for (const check of ["working-clean", "operation-finished", "tracking-not-behind"]) {
    assert.equal(evaluatePracticeStep({ check }, { kind: "no-repository" }).ok, false);
  }
});

test("unobservable practice steps stay unverified instead of completing on repository presence", () => {
  for (const key of ["pull-conflict", "remote-rewritten", "unknown-guide"]) {
    const plan = buildPracticePlan(key, ["inspect", "preserve", "resolve", "commit"]);
    for (const step of plan) {
      assert.equal(evaluatePracticeStep(step, { kind: "repository" }).ok, false);
    }
  }
});


test("self confirmation is explicit and cannot bypass Git checks", () => {
  const repository = { kind: "repository", tracking: { kind: "diverged", behind: 1 } };
  const step = { check: "manual-review" };
  assert.equal(evaluatePracticeStep(step, repository).ok, false);
  const result = evaluatePracticeStep(step, repository, { manualConfirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.verifiedBy, "self");
  assert.equal(evaluatePracticeStep({ check: "tracking-not-behind" }, repository, { manualConfirmed: true }).ok, false);
});

test("practice shows separate manual and Git controls and completion labels", async () => {
  const { renderAiPracticeWorkspace } = await import("../src/workspace-views.mts");
  for (const locale of ["ko", "en"]) {
    const html = renderAiPracticeWorkspace({ locale, plan: [
      { index: 0, text: "Read", check: "manual-review" },
      { index: 1, text: "Pull", check: "tracking-not-behind" },
    ], results: [{ ok: true, verifiedBy: "self" }, { ok: true, verifiedBy: "git" }] });
    assert.match(html, /data-action="confirm-step" data-index="0"/);
    assert.match(html, /data-action="check-step" data-index="1"/);
    assert.match(html, locale === "ko" ? /직접 확인 완료/ : /Self-confirmed/);
    assert.match(html, locale === "ko" ? /Git 상태 확인 완료/ : /Git state verified/);
    assert.match(html, locale === "ko" ? /원격 변경을 모두 받은 상태/ : /All remote changes received/);
  }
});
