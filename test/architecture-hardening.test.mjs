import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("multi-repository routing follows active resources and persisted repository choice", () => {
  const core = read("extension-core.js");
  const host = read("webview-host.js");
  assert.match(core, /knownRepositoryRoots/);
  assert.match(core, /activeTextEditor\?\.document\.uri/);
  assert.match(core, /gitNext\.selectedRepositoryRoot/);
  assert.match(host, /api\.repositories/);
  assert.match(host, /onDidOpenRepository/);
  assert.match(host, /onDidCloseRepository/);
});

test("network Git operations surface VS Code progress", () => {
  const sync = read("sync-handler.js");
  const menus = read("git-menu-handlers.js");
  assert.match(sync, /vscode\.window\.withProgress/);
  assert.match(sync, /Git Next · Pull/);
  assert.match(sync, /Git Next · Push/);
  assert.match(menus, /Git Next · Fetch/);
});

test("webviews receive nonce CSP and routine refreshes use postMessage", () => {
  const core = read("extension-core.js");
  assert.match(core, /crypto\.randomBytes/);
  assert.match(core, /Content-Security-Policy/);
  assert.match(core, /script-src 'nonce-\$\{nonce\}'/);
  assert.match(core, /webview\.postMessage\(\{ type: "gitNextRefresh", mainHtml \}\)/);
  assert.match(core, /window\.scrollTo\(scrollX, scrollY\)/);
  assert.match(core, /selectionStart/);
});

test("webview message routing is owned by a focused dispatch module", () => {
  const handler = read("webview-message-handler.js");
  const host = read("webview-host.js");
  assert.match(handler, /const handlers = \{/);
  assert.match(handler, /sidebarDiscard: async/);
  assert.match(handler, /sidebarCommit: async/);
  assert.match(handler, /pull: async/);
  assert.match(host, /createWebviewMessageHandler/);
});

test("shared views use one escapeHtml implementation", () => {
  const shared = read("view-shared.mjs");
  const guide = read("git-guide.mjs");
  const glossary = read("glossary-view.mjs");
  assert.match(shared, /export function escapeHtml/);
  assert.match(guide, /import \{ escapeHtml \} from "\.\/view-shared\.mjs"/);
  assert.match(glossary, /import \{ escapeHtml \} from "\.\/view-shared\.mjs"/);
  assert.doesNotMatch(guide, /function escapeHtml/);
  assert.doesNotMatch(glossary, /function escapeHtml/);
});

test("AI rescue history records terminal outcomes", () => {
  const menus = read("git-menu-handlers.js");
  assert.match(menus, /updateOutcome\("started"\)/);
  assert.match(menus, /updateOutcome\("finished"\)/);
  assert.match(menus, /updateOutcome\("failed"/);
});

test("extension entrypoint stays a small activation shell", () => {
  const extension = read("extension.js");
  const lineCount = extension.trimEnd().split("\n").length;
  assert.ok(lineCount <= 250, `extension.js is ${lineCount} lines`);
  assert.match(extension, /createSyncHandler/);
  assert.match(extension, /createPanelHandlers/);
  assert.match(extension, /createGitMenus/);
  assert.match(extension, /createWebviewHost/);
});
