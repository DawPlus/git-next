import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const runtimeSource = [
  "extension.js",
  "extension-core.js",
  "sync-handler.js",
  "git-menu-handlers.js",
  "panel-handlers.js",
  "ai-panel-handlers.js",
  "webview-host.js",
  "webview-message-handler.js",
].map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).join("\n");

test("registers Git Next open command activation", () => {
  assert.equal(packageJson.main, "./dist/extension.js");
  assert.ok(packageJson.activationEvents.includes("onCommand:gitNext.open"));
  assert.ok(packageJson.activationEvents.includes("onCommand:gitNext.fileHistory"));
  assert.ok(packageJson.contributes.commands.some(({ command }) => command === "gitNext.fileHistory"));
  assert.ok(packageJson.contributes.commands.some(({ command }) => command === "gitNext.open"));
});

test("refreshes open Git Next views when VS Code Source Control changes Git state", () => {
  const source = runtimeSource;
  assert.match(source, /vscode\.extensions\.getExtension\("vscode\.git"\)/);
  assert.match(source, /repository\.state\?\.onDidChange\?\.\(scheduleExternalGitRefresh\)/);
  assert.match(source, /api\.onDidOpenRepository/);
  assert.match(source, /liveWebviewHosts/);
  assert.match(source, /renderPanel\(host, null, mode, getOptions\(\)\)/);
  assert.match(source, /internalGitOperationDepth/);
  assert.match(source, /externalGitRefreshPending/);
  assert.match(source, /runInternalGitOperation\(\(\) => runSyncAction/);
  assert.match(source, /Git 작업 처리 중 오류가 발생했습니다/);
  assert.match(source, /consumeExternalRefresh/);
  assert.match(source, /workflows\.stageFile\(root, message\.path\)/);
  assert.match(source, /workflows\.unstageFile\(root, message\.path\)/);
  assert.match(source, /\{ consumeExternalRefresh: true \}/);
});

test("registers a visible Git Next activity-bar webview", () => {
  const extensionPath = new URL("../src/extension.js", import.meta.url);
  assert.equal(existsSync(extensionPath), true);

  const source = runtimeSource;
  assert.match(source, /registerCommand\(["']gitNext\.open["']/);
  assert.match(source, /registerCommand\(["']gitNext\.fileHistory["']/);
  assert.match(source, /workflows\.getFileHistory\(root, filePath\)/);
  assert.match(source, /focusCommitIds: history\.map/);
  assert.match(source, /registerWebviewViewProvider/);
  assert.match(source, /gitNext\.sidebar/);
  assert.match(source, /const serverRef = state\.upstream \?\? "HEAD"/);
  assert.match(source, /\[서버 · \$\{serverRef\} · 변경 전\]/);
  assert.match(source, /\[로컬 · 현재 파일 · 변경 후\]/);
  assert.match(source, /"vscode\.diff"/);
  assert.match(source, /sidebarDiscard: async \(message\)/);
  assert.match(source, /Git Doctor/);
  assert.match(source, /async function gitDoctor\(/);
  assert.match(source, /async function showStatefulResult\(host, mode, options, cwd, action\)/);
  assert.match(source, /function getOrCreateWebviewPanel\(/);
  assert.match(source, /existing\.reveal\(vscode\.ViewColumn\.One\)/);
  assert.match(source, /runWithGitStateDelta\(cwd, action\)/);
  assert.match(source, /runWithGitStateDelta\(cwd, \(\) => workflows\.commitWithMessage/);
  assert.match(source, /preflight\.code === "no-upstream"/);
  assert.match(source, /workflows\.mjs"\)\)\.listRemotes\(cwd\)/);
  assert.match(source, /actions\.pushWithUpstream\(cwd, selected\.remote\.name, branchName\)/);
  assert.match(source, /workflows\.getPullRequestReadiness\(state\)/);
  assert.match(source, /workflows\.createPullRequestDraft\(branch, preview\?\.commits/);
  assert.match(source, /safety\.inspectCurrentUpstream\(cwd\)/);
  assert.match(source, /actions\.fetchPruneRemote\(cwd, selected\.r\.name\)/);
  assert.match(source, /getUndoRecommendation\(item\)/);
  assert.match(source, /undoMenu\(host, mode, options, recommendation\.id, item\.recoveryPoint\)/);
  assert.match(source, /async function detachedHeadGuide\(/);
  assert.match(source, /현재 커밋을 브랜치로 보존/);
  assert.match(source, /기존 브랜치로 돌아가기/);
  assert.match(source, /selected\.finding\.id === "detached-head"/);
  assert.match(source, /safety\.getInProgressOperation\(cwd\)/);
  assert.match(source, /workflows\.formatOperationActionPreview\(operation\.operation, "continue", files\)/);
  assert.match(source, /workflows\.continueGitOperation\(cwd, operation\.operation\)/);
  assert.match(source, /workflows\.abortGitOperation\(cwd, operation\.operation\)/);
  assert.match(source, /workflows\.getCommitContainment\(cwd, commit, target\.ref\)/);
  assert.match(source, /focus: "selected-commit", focusCommitId: commit/);
  assert.match(source, /id: "recovery"/);
  assert.ok(source.indexOf('workflows.createRecoveryPoint(cwd, "undo-local-commit")') < source.indexOf("workflows.undoLastLocalCommit(cwd)"));
  assert.ok(packageJson.activationEvents.includes("onView:gitNext.sidebar"));
  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].id, "gitNext");
  assert.equal(packageJson.contributes.views.gitNext[0].id, "gitNext.sidebar");
});

test("shows a skippable commit movement preview before sync confirmation", () => {
  const source = runtimeSource;
  assert.match(source, /async function showSyncMovementPreview\(/);
  assert.match(source, /vscode\.ProgressLocation\.Notification/);
  assert.match(source, /cancellable: true/);
  assert.match(source, /preview\.commits/);
  assert.ok(source.indexOf("await showSyncMovementPreview(action, preview)") < source.indexOf("return confirmMutation({", source.indexOf("async function confirmImpactPreview")));
});

test("requires an explicit stash message choice and confirms included files", () => {
  const source = runtimeSource;
  assert.match(source, /async function promptStashMessage\(/);
  assert.match(source, /기본 메모로 빠르게 저장/);
  assert.match(source, /validateInput: \(value\) => value\.trim\(\)/);
  assert.equal((source.match(/formatStashPreview\(changes, (?:message|memo)\)/g) ?? []).length, 1);
});


test("includes sibling worktree details in mutation confirmation", () => {
  const source = runtimeSource;
  assert.match(source, /const \{ getLinkedWorktrees \} = await import/);
  assert.match(source, /다른 작업 폴더 \$\{others\.length\}개/);
  assert.match(source, /worktrees: await getLinkedWorktrees\(state\.root\)/);
});


test("exposes partial-stage guidance from Git Doctor and Git tools", () => {
  const source = runtimeSource;
  assert.match(source, /finding: \{ id: "partial-stage", guideKey: "partial-stage" \}/);
  assert.match(source, /selected\.finding\.id === "partial-stage"/);
  assert.match(source, /id: "partial-stage"/);
});


test("passes live repository state to the glossary center", () => {
  const source = runtimeSource;
  assert.match(source, /renderKnowledgeCenter\(\{ tab: selected \? "guides" : tab, selected, state \}\)/);
});


test("shows advisory message hints beside editable commit drafts", () => {
  const source = runtimeSource;
  assert.match(source, /workflows\.getCommitMessageHints\(suggestion\.subject\)/);
  assert.match(source, /무시하고 그대로 진행해도 됩니다/);
  assert.match(source, /value: suggestion\.subject/);
});


test("records blocked actions with retry checks and re-runs guarded flows", () => {
  const source = runtimeSource;
  assert.match(source, /retryCheck,\n      recoveryPoint/);
  assert.match(source, /if \(notice\?\.ok === false\) await recordActivity\(notice\)/);
  assert.match(source, /async function retryTimelineAction\(/);
  assert.match(source, /return runSyncAction\(host, item\.action, mode, options\)/);
  assert.match(source, /재시도 전 확인:/);
  assert.match(source, /확인 후 다시 시도/);
});

test("relaxes only the session-scoped overlap check and protects history rewrites", () => {
  const source = runtimeSource;
  assert.match(source, /const relaxedSafeGuardRules = new Set\(\)/);
  assert.match(source, /selected\.rule\.risk/);
  assert.match(source, /세션 동안 완화/);
  assert.match(source, /relaxedSafeGuardRules\.has\("dirty-incoming-overlap"\)/);
  assert.match(source, /rule\.relaxable/);
  assert.match(source, /모든 규칙 기본값으로 복원/);
});

test("serializes branch mutations and explains dirty branch switching", () => {
  const source = runtimeSource;
  assert.match(source, /let branchMutationRunning = false/);
  assert.match(source, /다른 브랜치 작업을 처리 중이에요/);
  assert.match(source, /커밋하지 않은 변경 .*개도 함께 이동합니다/);
  assert.match(source, /Git이 자동으로 이동을 중단합니다/);
  assert.match(source, /after\.branch !== message\.branch/);
  assert.match(source, /runBranchMutation\(\(\) => actions\.createBranch/);
  assert.match(source, /runBranchMutation\(\(\) => actions\.renameBranch/);
  assert.match(source, /runBranchMutation\(\(\) => actions\.deleteBranch/);
  assert.match(source, /runBranchMutation\(\(\) => workflows\.runWithGitStateDelta\(cwd, \(\) => workflows\.mergeIntoCurrent/);
  assert.match(source, /void vscode\.window\.showInformationMessage\(`\'\$\{message\.branch\}\' 브랜치로 이동했어요/);
});

test("branch workspace refreshes when VS Code Git branch state changes", () => {
  const source = runtimeSource;
  assert.match(source, /repository\.state\.onDidChange/);
  assert.match(source, /branchRefreshTimer = setTimeout/);
  assert.match(source, /gitStateDisposable\?\.dispose/);
});

test("offers Force-with-lease only after a rejected or blocked regular Push", () => {
  const source = runtimeSource;
  assert.match(source, /async function offerForceWithLease\(/);
  assert.match(source, /getForceWithLeasePreview\(cwd\)/);
  assert.match(source, /확인한 원격 최신 Commit: \$\{preview\.expected\.slice\(0, 12\)\}/);
  assert.match(source, /누군가 원격을 변경하면 Git이 자동으로 Push를 취소합니다/);
  assert.match(source, /actions\.pushWithForceWithLease\(cwd, preview\.remote, preview\.remoteRef, preview\.expected\)/);
  assert.match(source, /preflight\.code === "diverged"/);
  assert.match(source, /offerDivergedResolution/);
  assert.match(source, /preflight\.code === "behind"/);
  assert.match(source, /result\.detail \?\? ""\} \$\{result\.message/);
  assert.match(source, /safety\.code === "remote-history-rewritten"/);
});
