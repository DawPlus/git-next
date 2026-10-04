import assert from "node:assert/strict";
import test from "node:test";

import {
  renderBranchWorkspace,
  renderChangesWorkspace,
  renderCompareWorkspace,
  renderCommitDetailsWorkspace,
  renderKnowledgeCenter,
  renderStashWorkspace,
} from "../src/workspace-views.mjs";

test("changes workspace exposes stage, unstage, compare, commit, and undo", () => {
  const html = renderChangesWorkspace({
    files: [],
    staged: [{ status: "M ", path: "staged.js", staged: true, unstaged: false }],
    unstaged: [{ status: " M", path: "local.js", staged: false, unstaged: true }],
  });

  assert.match(html, /data-action="unstage"/);
  assert.match(html, /data-action="stage"/);
  assert.match(html, /data-action="compare-remote"/);
  assert.match(html, /data-action="commit"/);
  assert.match(html, /data-action="undo-commit"/);
});

test("local remote compare highlights files changed on both sides", () => {
  const html = renderCompareWorkspace({
    ok: true,
    upstream: "origin/main",
    files: [
      { path: "shared.js", scope: "both", localStatus: "M", remoteStatus: "M" },
      { path: "local.js", scope: "local", localStatus: "M", remoteStatus: null },
      { path: "remote.js", scope: "remote", localStatus: null, remoteStatus: "A" },
    ],
  });

  assert.match(html, /양쪽에서 변경/);
  assert.match(html, /shared\.js/);
  assert.match(html, /data-action="open-diff"/);
});

test("commit detail workspace lists changed files and opens before-after diff", () => {
  const html = renderCommitDetailsWorkspace({
    ok: true,
    id: "abcdef123456",
    parents: ["1234567890abcdef"],
    author: "Tester",
    email: "test@example.com",
    authoredAt: "2026-10-04T16:00:00+09:00",
    message: "update app",
    files: [
      { status: "M", path: "app.js", oldPath: null },
      { status: "R100", oldPath: "old.js", path: "new.js" },
    ],
  });

  assert.match(html, /update app/);
  assert.match(html, /app\.js/);
  assert.match(html, /old\.js → new\.js/);
  assert.match(html, /data-action="open-commit-diff"/);
});

test("branch and stash workspaces use visual selection instead of raw picker-only UI", () => {
  const branch = renderBranchWorkspace({
    branch: "main",
    refs: [
      { name: "main", kind: "local" },
      { name: "feature", kind: "local" },
      { name: "origin/main", kind: "remote" },
    ],
  });
  assert.match(branch, /branch-card/);
  assert.match(branch, /data-action="compare"/);
  assert.match(branch, /data-action="switch"/);

  const stash = renderStashWorkspace(
    [{ ref: "stash@{0}", message: "wip", relative: "1 minute ago" }],
    { ref: "stash@{0}", stat: "1 file changed", files: [{ status: "M", path: "app.js" }] },
  );
  assert.match(stash, /data-action="apply"/);
  assert.match(stash, /data-action="pop"/);
  assert.match(stash, /data-action="drop"/);
});

test("knowledge center merges terms and situation guides with top toggle", () => {
  const html = renderKnowledgeCenter({ tab: "guides", selected: "fetch-vs-pull" });
  assert.match(html, /id="knowledge-tab-terms"/);
  assert.match(html, /for="knowledge-tab-terms"/);
  assert.match(html, /id="knowledge-tab-guides"/);
  assert.match(html, /for="knowledge-tab-guides"/);
  assert.match(html, /Fetch와 Pull/);
  assert.match(html, /Merge와 Rebase/);
});
