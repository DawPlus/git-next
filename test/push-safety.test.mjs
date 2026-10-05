import assert from "node:assert/strict";
import test from "node:test";

import { classifyTrackingStatus, getPushGuidance, isPullUnnecessary } from "../src/git-safety.mts";
import { renderGraphHtml } from "../src/graph-view.mts";

test("classifies ahead, behind, and diverged tracking states", () => {
  assert.deepEqual(classifyTrackingStatus(2, 0), { kind: "ahead", ahead: 2, behind: 0 });
  assert.deepEqual(classifyTrackingStatus(0, 3), { kind: "behind", ahead: 0, behind: 3 });
  assert.deepEqual(classifyTrackingStatus(2, 3), { kind: "diverged", ahead: 2, behind: 3 });
  assert.deepEqual(classifyTrackingStatus(0, 0), { kind: "up-to-date", ahead: 0, behind: 0 });
});

test("skips Pull only when the tracking ref has no incoming commits", () => {
  assert.equal(isPullUnnecessary({ kind: "ahead", ahead: 2, behind: 0 }), true);
  assert.equal(isPullUnnecessary({ kind: "up-to-date", ahead: 0, behind: 0 }), true);
  assert.equal(isPullUnnecessary({ kind: "behind", ahead: 0, behind: 2 }), false);
  assert.equal(isPullUnnecessary({ kind: "diverged", ahead: 1, behind: 1 }), false);
  assert.equal(isPullUnnecessary({ kind: "no-upstream", ahead: 0, behind: 0 }), false);
});

test("blocks push when remote tracking history is ahead", () => {
  const behind = getPushGuidance({ kind: "behind", ahead: 0, behind: 1, upstream: "origin/main" });
  const diverged = getPushGuidance({ kind: "diverged", ahead: 2, behind: 1, upstream: "origin/main" });

  assert.equal(behind.allowed, false);
  assert.equal(diverged.allowed, false);
  assert.match(diverged.message, /갈라졌/);
});

test("allows push when local branch is only ahead", () => {
  const guidance = getPushGuidance({ kind: "ahead", ahead: 2, behind: 0, upstream: "origin/main" });

  assert.equal(guidance.allowed, true);
});

test("shows tracking status and Git details", () => {
  const html = renderGraphHtml(
    {
      kind: "repository",
      root: "/repo",
      branch: "main",
      upstream: "origin/main",
      head: null,
      refs: [],
      commits: [],
      tracking: { kind: "diverged", ahead: 2, behind: 1, upstream: "origin/main" },
    },
    { ok: false, message: "Blocked", detail: "Tracking state: diverged" },
  );

  assert.match(html, /분기됨/);
  assert.match(html, /↑2 ↓1/);
  assert.match(html, /Git 상세 정보/);
});
