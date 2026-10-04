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
  assert.match(html, /data-action="back-to-graph"/);
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

test("Stash preview distinguishes overlapping file paths from confirmed conflicts", () => {
  const html = renderStashWorkspace([], {
    ref: "stash@{0}",
    stat: "app.txt | 1 +",
    files: [{ status: "M", path: "app.txt" }],
    overlap: ["app.txt"],
  });

  assert.match(html, /겹치는 파일 1개: app\.txt/);
  assert.match(html, /실제 충돌이 확정된 것은 아닙니다/);
});

test("knowledge center merges terms and situation guides with top toggle", () => {
  const html = renderKnowledgeCenter({ tab: "guides", selected: "fetch-vs-pull" });
  assert.match(html, /id="knowledge-tab-terms"/);
  assert.match(html, /for="knowledge-tab-terms"/);
  assert.match(html, /id="knowledge-tab-guides"/);
  assert.match(html, /for="knowledge-tab-guides"/);
  assert.match(html, /Fetch와 Pull/);
  assert.match(html, /Merge와 Rebase/);
  assert.match(html, /잘못된 파일을 Stage했어요/);
  assert.match(html, /다른 브랜치로 이동이 안 돼요/);
  assert.match(html, /Reset을 잘못해서 Commit이 사라진 것 같아요/);
  assert.match(html, /이럴 때/);
  assert.match(html, /이렇게 해보세요/);
  assert.match(html, /팀원이 Push했다고 하는데/);
  assert.match(html, /class="guide-visual incoming"/);
  assert.match(html, /class="guide-visual push"/);
  assert.match(html, /class="guide-visual split"/);
});


test("knowledge center shows scenario state, risk, next action, and matching hint", () => {
  const html = renderKnowledgeCenter({ tab: "guides", state: { tracking: { kind: "diverged" }, changes: [] } });
  assert.match(html, /상황별 시나리오/);
  assert.match(html, /현재 저장소와 비슷해요/);
  assert.match(html, /양쪽에 서로 다른 새 커밋/);
  assert.match(html, /위험/);
  assert.match(html, /다음 행동/);
  assert.match(html, /원격 브랜치가 사라짐/);
});


test("knowledge terms show live repository examples and keep generic examples", () => {
  const html = renderKnowledgeCenter({ tab: "terms", state: { kind: "repository", branch: "feature", head: "abcdef1234567890", upstream: "origin/feature", tracking: { kind: "ahead", ahead: 2, behind: 0 }, changes: [] } });
  assert.match(html, /현재 저장소/);
  assert.match(html, /origin\/feature로 보낼 커밋 2개/);
  assert.match(html, /main ↔ origin\/main/);
});
