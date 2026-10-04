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
  assert.match(source, /const serverLabel = state\.upstream \? `\[서버\] \$\{serverRef\}`/);
  assert.match(source, /\$\{serverLabel\} ↔ \[로컬\] \$\{path\}/);
  assert.match(source, /message\?\.type === "sidebarDiscard"/);
  assert.ok(packageJson.activationEvents.includes("onView:gitNext.sidebar"));
  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].id, "gitNext");
  assert.equal(packageJson.contributes.views.gitNext[0].id, "gitNext.sidebar");
});
