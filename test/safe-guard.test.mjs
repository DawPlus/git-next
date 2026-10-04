import assert from "node:assert/strict";
import test from "node:test";

import {
  createGuardDecision,
  evaluateSafeguards,
} from "../src/safe-guard.mjs";

test("returns safe when every rule passes", async () => {
  const result = await evaluateSafeguards({
    action: "pull",
    rules: [
      async () => createGuardDecision("safe", "ok-1"),
      async () => createGuardDecision("safe", "ok-2"),
    ],
  });

  assert.equal(result.level, "safe");
  assert.equal(result.canProceed, true);
  assert.deepEqual(result.reasons, ["ok-1", "ok-2"]);
});

test("warning outranks safe and remains overridable", async () => {
  const result = await evaluateSafeguards({
    action: "push",
    rules: [
      async () => createGuardDecision("safe", "ok"),
      async () => createGuardDecision("warning", "주의 필요", { overridable: true }),
    ],
  });

  assert.equal(result.level, "warning");
  assert.equal(result.canProceed, false);
  assert.equal(result.canOverride, true);
});

test("blocked outranks warning and cannot be overridden", async () => {
  const result = await evaluateSafeguards({
    action: "push",
    rules: [
      async () => createGuardDecision("warning", "주의", { overridable: true }),
      async () => createGuardDecision("blocked", "차단", { overridable: false }),
    ],
  });

  assert.equal(result.level, "blocked");
  assert.equal(result.canProceed, false);
  assert.equal(result.canOverride, false);
  assert.deepEqual(result.reasons, ["주의", "차단"]);
});
