import assert from "node:assert/strict";
import test from "node:test";

import {
  getDestructiveActionGuard,
  getDirtyTreeGuard,
} from "../src/git-safety.mjs";
import { renderGraphHtml } from "../src/graph-view.mjs";

test("destructive actions always require explicit confirmation", () => {
  const guard = getDestructiveActionGuard("force-push", {
    affected: ["origin/main"],
  });

  assert.equal(guard.level, "warning");
  assert.equal(guard.requiresConfirmation, true);
  assert.deepEqual(guard.affected, ["origin/main"]);
  assert.match(guard.message, /원격 브랜치/);
});

test("unknown destructive actions are blocked", () => {
  const guard = getDestructiveActionGuard("unknown-action");

  assert.equal(guard.level, "blocked");
  assert.equal(guard.requiresConfirmation, true);
});

test("dirty working tree blocks risky future actions", () => {
  const changes = [{ status: " M", path: "src/app.js" }];

  assert.equal(getDirtyTreeGuard("pull", changes).level, "warning");
  assert.equal(getDirtyTreeGuard("checkout", changes).level, "blocked");
  assert.equal(getDirtyTreeGuard("rebase", changes).level, "blocked");
  assert.equal(getDirtyTreeGuard("reset", changes).level, "blocked");
  assert.equal(getDirtyTreeGuard("push", changes).level, "warning");
});

test("renders unified Korean Safe Guard labels", () => {
  const html = renderGraphHtml(
    {
      kind: "repository",
      root: "/repo",
      branch: "main",
      upstream: "origin/main",
      head: null,
      refs: [],
      commits: [],
      tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" },
      pullBeforePush: false,
    },
    {
      ok: false,
      level: "blocked",
      message: "작업을 중단했습니다.",
      detail: "technical detail",
    },
  );

  assert.match(html, /차단/);
  assert.match(html, /작업을 중단했습니다/);
  assert.match(html, /Git 상세 정보/);
});
