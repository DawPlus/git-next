import assert from "node:assert/strict";
import test from "node:test";

import {
  explainGitError,
  validateCommitish,
  validateBranchName,
  validateTagName,
} from "../src/git-actions.mts";
import {
  recommendNextAction,
  getGitDoctorFindings,
  getRetryCheck,
  getUndoRecommendation,
} from "../src/git-diagnostics.mts";
import { listSafeGuardRules, evaluateSafeguards, createGuardDecision } from "../src/safe-guard.mts";
import { setLocale, resetLocale, t } from "../src/i18n.mts";

test.beforeEach(() => {
  resetLocale();
});

test.afterEach(() => {
  resetLocale();
});

test("explainGitError localizes in Korean and English with raw detail intact", () => {
  setLocale("ko");
  const koPush = explainGitError("push", "rejected (non-fast-forward)");
  assert.match(koPush, /원격 브랜치에 아직 받지 않은 변경이 있습니다/);

  const koPullConflict = explainGitError("pull", "CONFLICT (content): Merge conflict in file.txt");
  assert.match(koPullConflict, /충돌이 발생했습니다/);

  setLocale("en");
  const enPush = explainGitError("push", "rejected (non-fast-forward)");
  assert.match(enPush, /Remote branch has changes not yet fetched/i);

  const enPullConflict = explainGitError("pull", "CONFLICT (content): Merge conflict in file.txt");
  assert.match(enPullConflict, /conflicts occurred/i);
});

test("validation errors localize in Korean and English", async () => {
  setLocale("ko");
  const koCommitish = await validateCommitish("/non-existent", "-invalid-flag");
  assert.equal(koCommitish.ok, false);
  assert.equal(koCommitish.message, "Git 대상을 안전하게 확인할 수 없습니다.");

  const koBranch = await validateBranchName("/non-existent", "   ");
  assert.equal(koBranch.ok, false);
  assert.equal(koBranch.message, "브랜치 이름을 입력하세요.");

  const koTag = await validateTagName("/non-existent", "   ");
  assert.equal(koTag.ok, false);
  assert.equal(koTag.message, "태그 이름을 입력하세요.");

  setLocale("en");
  const enCommitish = await validateCommitish("/non-existent", "-invalid-flag");
  assert.equal(enCommitish.ok, false);
  assert.equal(enCommitish.message, "Could not safely verify Git target.");

  const enBranch = await validateBranchName("/non-existent", "   ");
  assert.equal(enBranch.ok, false);
  assert.equal(enBranch.message, "Please enter a branch name.");

  const enTag = await validateTagName("/non-existent", "   ");
  assert.equal(enTag.ok, false);
  assert.equal(enTag.message, "Please enter a tag name.");
});

test("action success and failure templates interpolate named parameters in Korean and English", () => {
  setLocale("ko");
  assert.equal(
    t("actions.tag.createSuccess", { name: "v1.0", target: "HEAD" }),
    "태그 'v1.0'를 만들었습니다. 대상: HEAD",
  );
  assert.equal(
    t("actions.branch.createTrackingSuccess", { name: "feat", remoteRef: "origin/feat" }),
    "원격 'origin/feat'를 추적하는 로컬 브랜치 'feat'를 만들고 전환했습니다.",
  );
  assert.equal(
    t("actions.push.forceWithLeaseSuccess", { commit: "a1b2c3d4" }),
    "확인한 원격 최신 Commit(a1b2c3d4)을 기준으로 안전한 강제 Push를 완료했습니다.",
  );
  assert.equal(
    t("actions.stash.applySuccess", { ref: "stash@{0}" }),
    "stash@{0}의 변경을 작업 폴더에 적용했습니다. Stash 항목은 그대로 남아 있습니다.",
  );

  setLocale("en");
  assert.equal(
    t("actions.tag.createSuccess", { name: "v1.0", target: "HEAD" }),
    "Created tag 'v1.0'. Target: HEAD",
  );
  assert.equal(
    t("actions.branch.createTrackingSuccess", { name: "feat", remoteRef: "origin/feat" }),
    "Created and switched to local branch 'feat' tracking remote 'origin/feat'.",
  );
  assert.equal(
    t("actions.push.forceWithLeaseSuccess", { commit: "a1b2c3d4" }),
    "Safely force-pushed based on verified remote commit (a1b2c3d4).",
  );
  assert.equal(
    t("actions.stash.applySuccess", { ref: "stash@{0}" }),
    "Applied changes from stash@{0} to working folder. Stash entry remains.",
  );
});

test("recommendNextAction localizes safe, warning, and blocked states in Korean and English", () => {
  // Safe / Clean
  setLocale("ko");
  const koClean = recommendNextAction({ tracking: { kind: "up-to-date" }, changes: [] });
  assert.equal(koClean.title, "로컬과 원격이 최신 상태예요.");

  setLocale("en");
  const enClean = recommendNextAction({ tracking: { kind: "up-to-date" }, changes: [] });
  assert.equal(enClean.title, "Local and remote are up to date.");

  // Blocked / Overlapping dirty files
  setLocale("ko");
  const koBlocked = recommendNextAction({
    tracking: { kind: "behind", behind: 2 },
    changes: [{ path: "app.js" }, { path: "style.css" }],
    incomingFiles: ["app.js", "style.css"],
  });
  assert.match(koBlocked.title, /2개를 먼저 정리해주세요/);

  setLocale("en");
  const enBlocked = recommendNextAction({
    tracking: { kind: "behind", behind: 2 },
    changes: [{ path: "app.js" }, { path: "style.css" }],
    incomingFiles: ["app.js", "style.css"],
  });
  assert.match(enBlocked.title, /resolve 2 overlapping local changes/i);

  // Warning / Diverged
  setLocale("ko");
  const koDiverged = recommendNextAction({ tracking: { kind: "diverged", ahead: 1, behind: 3 } });
  assert.match(koDiverged.title, /Pull 3부터 진행해주세요/);
  assert.match(koDiverged.detail, /받을 Commit 3개 · 보낼 Commit 1개/);

  setLocale("en");
  const enDiverged = recommendNextAction({ tracking: { kind: "diverged", ahead: 1, behind: 3 } });
  assert.match(enDiverged.title, /pulling 3 commits/i);
  assert.match(enDiverged.detail, /3 incoming commit\(s\) · 1 outgoing commit\(s\)/i);
});

test("Safe Guard rules and evaluations localize in Korean and English", async () => {
  setLocale("ko");
  const koRules = listSafeGuardRules();
  const koOverlapRule = koRules.find((r) => r.id === "dirty-incoming-overlap");
  assert.equal(koOverlapRule.title, "Pull 전 겹치는 로컬 변경 차단");
  assert.match(koOverlapRule.purpose, /내 로컬 수정 파일과 Remote에서 들어올 파일이 겹치면/);

  const koEval = await evaluateSafeguards({ action: "test", rules: [] });
  assert.equal(koEval.message, "안전 검사를 통과했습니다.");

  setLocale("en");
  const enRules = listSafeGuardRules();
  const enOverlapRule = enRules.find((r) => r.id === "dirty-incoming-overlap");
  assert.equal(enOverlapRule.title, "Block overlapping local changes before Pull");
  assert.match(enOverlapRule.purpose, /Warns if locally modified files overlap/i);

  const enEval = await evaluateSafeguards({ action: "test", rules: [] });
  assert.equal(enEval.message, "Passed safety checks.");
});

test("getRetryCheck and getUndoRecommendation localize in Korean and English", () => {
  setLocale("ko");
  assert.equal(getRetryCheck({ code: "dirty-working-tree" }), "로컬 변경을 Commit 또는 Stash했는지 확인하세요.");
  assert.equal(getUndoRecommendation({ ok: true, action: "push" }).label, "Revert 커밋 만들기");

  setLocale("en");
  assert.match(getRetryCheck({ code: "dirty-working-tree" }), /Check whether local changes are committed or stashed/i);
  assert.equal(getUndoRecommendation({ ok: true, action: "push" }).label, "Create Revert commit");
});

test("Doctor findings localize in Korean and English", () => {
  setLocale("ko");
  const koFindings = getGitDoctorFindings({
    head: { detached: true },
    tracking: { kind: "diverged", ahead: 2, behind: 4 },
  });
  assert.ok(koFindings.some((f) => f.id === "detached-head" && f.state === "현재 브랜치에 들어가 있지 않은 커밋을 보고 있음"));

  setLocale("en");
  const enFindings = getGitDoctorFindings({
    head: { detached: true },
    tracking: { kind: "diverged", ahead: 2, behind: 4 },
  });
  assert.ok(enFindings.some((f) => f.id === "detached-head" && f.state === "Viewing commit not on any branch"));
});

test("dialog confirmation templates localize in Korean and English", () => {
  setLocale("ko");
  assert.equal(
    t("dialog.confirmMutation.worktreeContext", { count: 2, details: "main · /repo2" }),
    "다른 작업 폴더 2개: main · /repo2",
  );
  assert.equal(t("dialog.confirmMutation.safe"), "확인됨");
  assert.equal(t("dialog.confirmMutation.warning"), "주의");
  assert.equal(t("dialog.confirmMutation.blocked"), "차단");

  setLocale("en");
  assert.equal(
    t("dialog.confirmMutation.worktreeContext", { count: 2, details: "main · /repo2" }),
    "2 other worktree(s): main · /repo2",
  );
  assert.equal(t("dialog.confirmMutation.safe"), "Verified");
  assert.equal(t("dialog.confirmMutation.warning"), "Warning");
  assert.equal(t("dialog.confirmMutation.blocked"), "Blocked");
});
