import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("registers Git Next open command activation", () => {
  assert.equal(packageJson.main, "./dist/extension.js");
  assert.ok(packageJson.activationEvents.includes("onCommand:gitNext.open"));
  assert.ok(packageJson.contributes.commands.some(({ command }) => command === "gitNext.open"));
});

test("registers a visible Git Next activity-bar webview", () => {
  const extensionPath = new URL("../src/extension.js", import.meta.url);
  assert.equal(existsSync(extensionPath), true);

  const source = readFileSync(extensionPath, "utf8");
  assert.match(source, /registerCommand\(["']gitNext\.open["']/);
  assert.match(source, /registerWebviewViewProvider/);
  assert.match(source, /gitNext\.sidebar/);
  assert.match(source, /const serverRef = state\.upstream \?\? "HEAD"/);
  assert.match(source, /\[서버 · \$\{serverRef\} · 변경 전\]/);
  assert.match(source, /\[로컬 · 현재 파일 · 변경 후\]/);
  assert.match(source, /"vscode\.diff"/);
  assert.match(source, /message\?\.type === "sidebarDiscard"/);
  assert.match(source, /Git Doctor/);
  assert.match(source, /async function gitDoctor\(/);
  assert.match(source, /async function showStatefulResult\(host, mode, options, cwd, action\)/);
  assert.match(source, /runWithGitStateDelta\(cwd, action\)/);
  assert.match(source, /runWithGitStateDelta\(cwd, \(\) => workflows\.commitWithMessage/);
  assert.match(source, /id: "recovery"/);
  assert.ok(source.indexOf('workflows.createRecoveryPoint(cwd, "undo-local-commit")') < source.indexOf("workflows.undoLastLocalCommit(cwd)"));
  assert.ok(packageJson.activationEvents.includes("onView:gitNext.sidebar"));
  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].id, "gitNext");
  assert.equal(packageJson.contributes.views.gitNext[0].id, "gitNext.sidebar");
});
