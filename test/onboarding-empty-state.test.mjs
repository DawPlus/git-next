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
