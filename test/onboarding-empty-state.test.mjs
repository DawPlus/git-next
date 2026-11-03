import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderGraphHtml } from "../src/graph-view.mts";
import { setLocale } from "../src/i18n.mts";

const handler = readFileSync(new URL("../src/webview-message-handler.ts", import.meta.url), "utf8");

test("no-repository empty state offers open folder and init actions", () => {
  setLocale("ko");
  const html = renderGraphHtml({ kind: "no-repository", commits: [], refs: [], branch: null, upstream: null, tracking: null });
  assert.match(html, /data-action="openWorkspaceFolder"/);
  assert.match(html, /data-action="initRepository"/);
  assert.match(html, /Git 저장소가 없습니다|폴더/);
});

test("zero-commit empty state offers first-commit guide", () => {
  setLocale("ko");
  const html = renderGraphHtml({ kind: "repository", commits: [], refs: [], branch: "main", upstream: null, tracking: null, changes: [] });
  assert.match(html, /data-action="startFirstCommitGuide"/);
  assert.match(html, /data-action="createFirstFile"/);
});

test("init repository requires confirmation before git init", () => {
  assert.match(handler, /initConfirm/);
  assert.match(handler, /\["init"\]/);
  assert.match(handler, /startFirstCommitGuide/);
});

test("createFirstFile shows save-to-stage hint and reopens Git Next", () => {
  assert.match(handler, /createFileHint/);
  assert.match(handler, /gitNext\.open/);
});

test("package contributes viewsWelcome and first-commit command", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(pkg.contributes.viewsWelcome));
  assert.ok(pkg.contributes.viewsWelcome.some((item) => item.view === "gitNext.sidebar"));
  assert.ok(pkg.contributes.commands.some((item) => item.command === "gitNext.startFirstCommitGuide"));
});

test("primary chrome jargon uses beginner labels", async () => {
  const { setLocale, t } = await import("../src/i18n.mts");
  setLocale("ko");
  assert.equal(t("sidebar.detachedHead"), "브랜치 밖 커밋");
  assert.equal(t("sidebar.staged"), "Commit 대기");
  assert.doesNotMatch(t("sidebar.staged"), /^Staged$/);
  setLocale("en");
  assert.equal(t("sidebar.detachedHead"), "Commit outside a branch");
  assert.doesNotMatch(t("sidebar.staged"), /^Staged$/);
});
