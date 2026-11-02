import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOperationGuard,
  formatOperationActionPreview,
  operationCancelLabel,
  operationFinishLabel,
} from "../src/git-operation-workflows.mts";
import { setLocale } from "../src/i18n.mts";

const menus = readFileSync(new URL("../src/git-menu-handlers.ts", import.meta.url), "utf8");

test("operation finish/cancel labels are beginner task names", () => {
  setLocale("ko");
  assert.equal(operationFinishLabel("merge"), "병합 마무리");
  assert.match(operationCancelLabel("merge"), /병합 취소/);
  setLocale("en");
  assert.equal(operationFinishLabel("merge"), "Finish merge");
  assert.match(operationCancelLabel("rebase"), /Cancel rebase/);
  setLocale("ko");
});

test("operation guard tells beginners what to do next without Continue/Abort jargon", () => {
  setLocale("ko");
  const blocked = buildOperationGuard({ operation: "merge" }, ["app.js"]);
  assert.match(blocked.message, /충돌 파일 1개/);
  assert.doesNotMatch(blocked.message, /\bContinue\b|\bAbort\b/);
  const ready = buildOperationGuard({ operation: "merge" }, []);
  assert.match(ready.message, /병합 마무리/);
  assert.match(formatOperationActionPreview("merge", "continue", []), /병합 마무리/);
});

test("conflict helper opens Merge Editor path and bulk accept with confirmation", () => {
  assert.match(menus, /git\.openMergeEditor/);
  assert.match(menus, /accept-all-mine/);
  assert.match(menus, /accept-all-theirs/);
  assert.match(menus, /operationFinishLabel/);
  assert.match(menus, /keepResolving/);
  assert.doesNotMatch(menus.slice(menus.indexOf("async function conflictHelper"), menus.indexOf("async function undoMenu")), /\bContinue \/ Abort\b/);
});
