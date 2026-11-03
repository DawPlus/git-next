import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getPushGuidance } from "../src/git-tracking.mts";
import { explainGitError } from "../src/git-actions.mts";
import { setLocale, t } from "../src/i18n.mts";

const preflight = readFileSync(new URL("../src/git-preflight.mts", import.meta.url), "utf8");

test("preflight in-progress next uses finish/cancel labels not bare Continue/Abort", () => {
  assert.doesNotMatch(preflight, /Continue 또는 Abort/);
  assert.doesNotMatch(preflight, /Continue or Abort/i);
  assert.match(preflight, /guidance\.conflict\.finish|operationFinish|finishLabel|finishOrCancel/);
});

test("push reject and diverged explain copy name a next action", () => {
  setLocale("ko");
  const reject = explainGitError("push", "non-fast-forward");
  assert.match(reject, /Pull|받기|비교|Merge|Rebase/);
  const diverged = explainGitError("pull", "diverged histories");
  assert.match(diverged, /비교|Merge|Rebase|확인/);
});

test("getPushGuidance behind/diverged next points to Pull or compare", () => {
  setLocale("ko");
  const behind = getPushGuidance({ kind: "behind", ahead: 0, behind: 2, upstream: "origin/main" });
  assert.equal(behind.allowed, false);
  assert.match(behind.next, /Pull|받기|비교/);
  const diverged = getPushGuidance({ kind: "diverged", ahead: 1, behind: 2, upstream: "origin/main" });
  assert.match(diverged.next, /비교|Merge|Rebase/);
});

test("retry keys avoid bare Continue/Abort", () => {
  setLocale("ko");
  assert.doesNotMatch(t("guidance.retry.operationInProgress"), /\bContinue\b|\bAbort\b/);
  setLocale("en");
  assert.doesNotMatch(t("guidance.retry.operationInProgress"), /\bContinue\b|\bAbort\b/);
});
