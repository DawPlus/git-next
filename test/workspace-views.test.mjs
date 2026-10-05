import assert from "node:assert/strict";
import test from "node:test";

import {
  renderBranchWorkspace,
  renderChangesWorkspace,
  renderCompareWorkspace,
  renderCommitDetailsWorkspace,
  renderAiDiagnosisWorkspace,
  renderAiHistoryWorkspace,
  renderAiPracticeWorkspace,
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
      { name: "main", kind: "local", upstream: "origin/main" },
      { name: "feature", kind: "local", upstream: null },
      { name: "origin/main", kind: "remote", upstream: null },
    ],
  });
  assert.match(branch, /branch-card/);
  assert.match(branch, />Local</);
  assert.match(branch, />Remote</);
  assert.match(branch, /origin\/main/);
  assert.match(branch, /tracking-link/);
  assert.match(branch, /tracking-signal/);
  assert.match(branch, /prefers-reduced-motion/);
  assert.match(branch, /data-action="track"/);
  assert.match(branch, /data-action="compare"/);
  assert.match(branch, /data-action="switch"/);
  assert.match(branch, /data-action="remote-settings"/);

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

test("AI diagnosis reuses guide styling and exposes learn or rescue paths", () => {
  const html = renderAiDiagnosisWorkspace({
    provider: "codex",
    diagnosis: {
      situation: "Diverged",
      summary: "양쪽에 다른 커밋이 있습니다.",
      risk: "기록을 덮을 수 있습니다.",
      next: "Merge 또는 Rebase",
      guideKey: "diverged",
      animationPreset: "diverged",
      recommendedAction: "merge",
      confidence: "high",
    },
  });
  assert.match(html, /AI Git 진단/);
  assert.match(html, /상태/);
  assert.match(html, /위험/);
  assert.match(html, /다음/);
  assert.match(html, /semantic-diverged/);
  assert.match(html, /직접 해보기/);
  assert.match(html, /AI가 해결/);
  assert.match(html, /진단 기록/);
});

test("AI history and practice stay compact and action-oriented", () => {
  const history = renderAiHistoryWorkspace([{
    id: "d1",
    provider: "codex",
    createdAt: "2026-10-05T00:00:00Z",
    diagnosis: { situation: "Diverged", summary: "갈라짐", next: "Merge", confidence: "high" },
    outcome: { action: "merge", status: "started" },
  }]);
  assert.match(history, /AI 진단 기록/);
  assert.match(history, /Merge/);
  assert.match(history, /open-entry/);

  const practice = renderAiPracticeWorkspace({
    diagnosis: { situation: "Diverged", next: "Merge", animationPreset: "diverged", recommendedAction: "merge" },
    plan: [{ index: 0, text: "차이를 확인해요.", check: "repository-visible" }],
    results: [{ ok: true, message: "확인했습니다." }],
  });
  assert.match(practice, /직접 해보기/);
  assert.match(practice, /상태 확인/);
  assert.match(practice, /✓ 완료/);
  assert.match(practice, /관련 Git 작업 열기/);
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
