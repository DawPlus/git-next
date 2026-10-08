import assert from "node:assert/strict";
import test from "node:test";

import {
  filterGraphState,
  layoutGraph,
  renderGraphHtml,
} from "../src/graph-view.mts";
import { renderSidebarHtml } from "../src/sidebar-view.mts";

const commits = [
  { id: "m", parents: ["a", "b"], author: "Min", authoredAt: "2026-10-04T10:00:00+09:00", message: "merge" },
  { id: "a", parents: ["c"], author: "Min", authoredAt: "2026-10-04T09:00:00+09:00", message: "main work" },
  { id: "b", parents: ["c"], author: "Dau", authoredAt: "2026-10-04T08:00:00+09:00", message: "branch work" },
  { id: "c", parents: [], author: "Dau", authoredAt: "2026-10-04T07:00:00+09:00", message: "base" },
];

test("assigns a separate lane to a merged branch", () => {
  const rows = layoutGraph(commits);

  assert.equal(rows[0].lane, 0);
  assert.deepEqual(rows[0].parentLanes, [0, 1]);
  assert.equal(rows[1].lane, 0);
  assert.equal(rows[2].lane, 1);
  assert.equal(rows[3].lane, 0);
});

test("renders branch, refs, commits, and refresh action", () => {
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    head: "m",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "m", kind: "local" },
      { name: "origin/main", fullName: "refs/remotes/origin/main", target: "a", kind: "remote" },
    ],
    commits,
  });

  assert.match(html, /main/);
  assert.match(html, /origin\/main/);
  assert.match(html, /merge/);
  assert.match(html, /data-action="refresh"/);
  assert.match(html, /<svg/);
});

test("renders each graph commit as one metadata line with refs before the action", () => {
  const html = renderGraphHtml({
    kind: "repository", root: "/repo", branch: "main", upstream: "origin/main", head: "m",
    refs: [{ name: "main", fullName: "refs/heads/main", kind: "local", target: "m" }], commits,
  });

  assert.match(html, /class="commit-line"/);
  assert.match(html, /<code class="commit-hash"[^>]*>m<\/code>/);
  assert.match(html, /class="message"[^>]*>merge<\/span>/);
  assert.ok(html.indexOf("class=\"commit-hash\"") < html.indexOf("class=\"message\""));
  assert.match(html, /aria-label="커밋 작업 열기"/);
  assert.doesNotMatch(html, />작업<\/button>/);
  assert.match(html, /class="commit-author"[^>]*>Min<\/span>/);
  assert.match(html, /class="commit-date"[^>]*>2026-10-04 10:00:00<\/time>/);
  assert.ok(html.indexOf("class=\"refs\"") < html.indexOf("class=\"commit-action\""));
});

test("renders multi-lane graph with curved colored merge paths", () => {
  const dense = [
    { id: "h", parents: ["m", "f"], author: "Min", authoredAt: "2026-10-04T12:00:00+09:00", message: "merge feature" },
    { id: "m", parents: ["b"], author: "Min", authoredAt: "2026-10-04T11:00:00+09:00", message: "main" },
    { id: "f", parents: ["b"], author: "Dau", authoredAt: "2026-10-04T10:30:00+09:00", message: "feature" },
    { id: "b", parents: [], author: "Dau", authoredAt: "2026-10-04T10:00:00+09:00", message: "base" },
  ];
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    head: "h",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "h", kind: "local" },
      { name: "feature", fullName: "refs/heads/feature", target: "f", kind: "local" },
    ],
    commits: dense,
  });

  assert.match(html, /class="graph-edge"/);
  assert.match(html, / C /);
  assert.match(html, /graph-node-head/);
  assert.match(html, /--ref-color:/);
});

test("filters graph by text, ref ancestry, scope, and limit", () => {
  const state = {
    kind: "repository",
    root: "/repo",
    branch: "main",
    head: "m",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "m", kind: "local" },
      { name: "feature", fullName: "refs/heads/feature", target: "b", kind: "local" },
      { name: "origin/main", fullName: "refs/remotes/origin/main", target: "a", kind: "remote" },
      { name: "v1", fullName: "refs/tags/v1", target: "c", kind: "tag" },
    ],
    commits,
  };

  const byText = filterGraphState(state, { query: "branch work", limit: 100 });
  assert.deepEqual(byText.commits.map(({ id }) => id), ["b", "c"]);

  const byRef = filterGraphState(state, { ref: "refs/heads/feature", limit: 100 });
  assert.deepEqual(byRef.commits.map(({ id }) => id), ["b", "c"]);

  const remoteOnly = filterGraphState(state, { scope: "remote", limit: 2 });
  assert.equal(remoteOnly.refs.every((ref) => ref.kind === "remote"), true);
  assert.equal(remoteOnly.commits.length, 2);
});

test("graph focus marks only outgoing, incoming, or both divergent commit ranges", () => {
  const state = {
    kind: "repository",
    branch: "main",
    head: "local",
    upstream: "origin/main",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "local", kind: "local" },
      { name: "origin/main", fullName: "refs/remotes/origin/main", target: "remote", kind: "remote" },
    ],
    commits: [
      { id: "local", parents: ["base"], message: "local commit" },
      { id: "remote", parents: ["base"], message: "remote commit" },
      { id: "base", parents: [], message: "common base" },
    ],
  };

  const focusedIds = (focus) => filterGraphState(state, { focus }).commits.filter((commit) => commit.isFocused).map(({ id }) => id);
  assert.deepEqual(focusedIds("push"), ["local"]);
  assert.deepEqual(focusedIds("pull"), ["remote"]);
  assert.deepEqual(focusedIds("diverged"), ["local", "remote"]);
  assert.deepEqual(filterGraphState(state, { focus: "merge-base", focusCommitId: "base" }).commits.filter((commit) => commit.isFocused).map(({ id }) => id), ["base"]);
  assert.equal(filterGraphState(state, { focus: "diverged" }).commits.length, state.commits.length);
});

test("graph focus highlights a selected commit in its history context", () => {
  const html = renderGraphHtml({
    kind: "repository", root: "/repo", branch: "main", upstream: "origin/main", head: "m",
    refs: [], commits,
  }, null, { focus: "selected-commit", focusCommitId: "a" });

  assert.match(html, /class="commit-row is-focused" data-commit-id="a"/);
  assert.match(html, /선택 커밋 대상 커밋 1개 강조/);
});

test("renders focus controls while retaining a full graph option", () => {
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: "m",
    refs: [],
    commits,
  }, null, { focus: "push" });

  assert.match(html, /id="filter-focus"/);
  assert.match(html, /value="all"[^>]*>전체 그래프/);
  assert.match(html, /value="push"[^>]*selected/);
  assert.match(html, /is-focused/);
});

test("renders compact graph density and filter controls", () => {
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    head: "m",
    refs: [],
    commits,
  }, null, { density: "compact", limit: 25 });

  assert.match(html, /filter-query/);
  assert.match(html, /filter-density/);
  assert.match(html, /is-compact/);
  assert.match(html, /--row-height:42px/);
  assert.match(html, /class="graph-beam"/);
  assert.match(html, /graphBeamFlow/);
  assert.match(html, /data-lane="0"/);
  assert.match(html, /has-active-lane/);
  assert.match(html, /lane-active/);
  assert.doesNotMatch(html, /prefers-reduced-motion/);
  assert.match(html, /data-commit-action/);
});

test("renders icon-led empty state", () => {
  const html = renderGraphHtml({
    kind: "no-repository",
    root: null,
    branch: null,
    upstream: null,
    head: null,
    refs: [],
    commits: [],
  });

  assert.match(html, /class="empty-icon"/);
  assert.match(html, /Git 저장소가 없습니다/);
});

test("renders compact sidebar controls with graph action", () => {
  const html = renderSidebarHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: "m",
    refs: [],
    commits,
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" },
    pullBeforePush: false,
  });

  assert.match(html, /data-action="openGraph"/);
  assert.match(html, /aria-label="그래프 보기"/);
  assert.match(html, /data-action="refresh" aria-label="동기화"/);
  assert.match(html, />Pull<\/span>/);
  assert.match(html, />Push<\/span>/);
  assert.match(html, /class="action-risk low"[^>]*aria-label="위험도 낮음:/);
  assert.match(html, /Safe Guard/);
  assert.doesNotMatch(html, /aria-label="커밋 그래프"/);
});

test("keeps the status hint and Safe Guard compact above collapsible change groups", () => {
  const html = renderSidebarHtml({
    kind: "repository", root: "/repo", branch: "main", upstream: "origin/main", head: "m", refs: [], commits,
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" }, pullBeforePush: false,
    changes: [{ path: "src/extension.js", status: " M" }],
    nextAction: { kind: "dirty", title: "로컬 변경을 먼저 Commit 또는 Stash하세요", detail: "" },
  }, { ok: false, level: "warning", message: "확인 필요", detail: "상세 설명" });

  const changesIndex = html.indexOf("class=\"section source-control\"");
  assert.ok(html.indexOf("data-toggle-tools") < changesIndex);
  assert.ok(html.indexOf("class=\"status-hints\"") < html.indexOf("id=\"sidebar-commit-message\""));
  assert.ok(html.indexOf("id=\"sidebar-commit-message\"") < changesIndex);
  assert.match(html, /data-action="sidebarUndoCommit"/);
  assert.match(html, /마지막 Commit 취소/);
  assert.ok(html.indexOf("data-action=\"push\"") < changesIndex);
  assert.ok(html.indexOf("class=\"status-hints\"") < changesIndex);
  assert.ok(html.indexOf("class=\"safe-guard\"") === -1);
  assert.doesNotMatch(html, /현재 변경 파일 \d+개가 있습니다/);
  assert.match(html, /class="scm-count">1개<\/span>/);
  assert.match(html, /class="guard-summary warning"/);
  assert.match(html, /class="guard-message-button"/);
  assert.match(html, /class="guard-hint"/);
  assert.match(html, /로컬 변경을 먼저 Commit 또는 Stash하세요/);
  assert.match(html, /class="guard-recommendation-label">다음 추천<\/span>/);
  assert.match(html, /class="guard-next-action"[^>]*data-action="sidebarStageAll"[^>]*title="현재 상태에서 추천하는 다음 행동: 전체 Stage"[^>]*>전체 Stage<\/button>/);
  assert.match(html, /class="guard-hint"[^>]*data-tooltip="로컬 변경을 먼저 Commit 또는 Stash하세요"/);
  assert.doesNotMatch(html, /class="guard-state"/);
  assert.match(html, /<details class="scm-group scm-card" data-area="(?:staged|unstaged)" open>/);
  assert.match(html, /<summary class="scm-group-head">/);
  assert.match(html, /class="file-actions"/);
  const fileActions = html.slice(html.indexOf("class=\"file-actions\""));
  assert.ok(fileActions.indexOf("data-action=\"sidebarDiscard\"") < fileActions.indexOf("data-action=\"sidebarStage\""));
  const fileRow = html.slice(html.indexOf("data-action=\"sidebarDiff\""), html.indexOf("class=\"file-actions\""));
  assert.ok(fileRow.indexOf("class=\"status") < fileRow.indexOf("class=\"file-icon\""));
  assert.ok(fileRow.indexOf("class=\"file-icon\"") < fileRow.indexOf("class=\"path\""));
  assert.match(html, /\.scm-folder > summary\s*\{[^}]*min-height:\s*24px[^}]*padding-right:\s*2px/s);
  assert.match(html, /\.scm-file\s*\{[^}]*min-height:\s*24px[^}]*padding:\s*0 2px/s);
  assert.match(html, /\.scm-file \.mini-action,\s*\.folder-action\s*\{[^}]*width:\s*20px[^}]*height:\s*20px[^}]*padding:\s*0/s);
  assert.doesNotMatch(html, /\.scm-file \.stage-control,[\s\S]{0,220}background:/);
  assert.match(html, /button\.closest\("\.scm-group-head"\)/);
  assert.match(html, /\.scm-file\s*\{[^}]*min-height:\s*24px/s);
  assert.match(html, /\.scm-groups\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(html, /\.scm-group\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1 1 0/s);
  assert.match(html, /\.scm-group\[open\]::details-content\s*\{[^}]*display:\s*flex[^}]*min-height:\s*0/s);
  assert.match(html, /\.scm-group:not\(\[open\]\)\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(html, /\.changes-mini\s*\{[^}]*flex:\s*1 1 0[^}]*min-height:\s*0[^}]*height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(html, /\.changes-mini\s*\{[^}]*align-content:\s*start/s);
  assert.match(html, /class="revert-icon"/);
  assert.match(html, /\.guard-message-button svg\s*\{[^}]*stroke:\s*currentColor/s);
  assert.match(html, /\.guard-summary\s*\{[^}]*border:\s*0/s);
  assert.match(html, /\.guard-hint\s*\{[^}]*text-align:\s*right/s);
  assert.match(html, /\.repo-action:hover\s*\{\s*transform:\s*none/);
  assert.match(html, /\.repo-actions \.tool-toggle\s*\{[^}]*place-items:\s*center[^}]*padding:\s*0/s);
  assert.match(html, /class="action-risk medium"[^>]*title="작업 폴더에 커밋하지 않은 변경이 있습니다\./);
});


test("Safe Guard color follows the recommended next action before any manual check", () => {
  const base = {
    kind: "repository", root: "/repo", branch: "main", upstream: "origin/main", head: "m", refs: [], commits,
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" }, pullBeforePush: false, changes: [],
  };

  const push = renderSidebarHtml({ ...base, nextAction: { kind: "push", title: "Push해도 됩니다.", detail: "" } });
  assert.match(push, /class="guard-summary safe"/);

  const pull = renderSidebarHtml({ ...base, nextAction: { kind: "pull", title: "Pull을 먼저 진행해주세요.", detail: "" } });
  assert.match(pull, /class="guard-summary warning"/);

  const blocked = renderSidebarHtml({ ...base, nextAction: { kind: "diverged", title: "정리가 필요해요.", detail: "" } });
  assert.match(blocked, /class="guard-summary blocked"/);
});

test("tag focus highlights release points while keeping branch refs visible", () => {
  const state = {
    kind: "repository", root: "/repo", branch: "main", head: "m",
    refs: [
      { name: "main", fullName: "refs/heads/main", target: "m", kind: "local" },
      { name: "v1.0.0", fullName: "refs/tags/v1.0.0", target: "a", kind: "tag" },
    ], commits,
  };
  const focused = filterGraphState(state, { focus: "tags", limit: 100 });
  assert.deepEqual(focused.refs.map(({ name }) => name), ["main", "v1.0.0"]);
  assert.deepEqual(focused.commits.filter(({ isFocused }) => isFocused).map(({ id }) => id), ["a"]);
  const html = renderGraphHtml(state, null, { focus: "tags" });
  assert.match(html, /value="tags"[^>]*selected/);
  assert.match(html, /태그 · 릴리스/);
});


test("shows linked worktree context only when sibling worktrees exist", () => {
  const state = {
    kind: "repository", root: "/repo", branch: "main", head: "m", refs: [], commits,
    worktrees: [
      { path: "/repo", branch: "main", isCurrent: true },
      { path: "/repo-feature", branch: "feature", isCurrent: false },
    ],
  };
  assert.match(renderGraphHtml(state), /다른 작업 폴더 1개.*feature.*\/repo-feature/);
  assert.match(renderSidebarHtml(state), /다른 작업 폴더 1개.*feature.*\/repo-feature/);
  assert.doesNotMatch(renderGraphHtml({ ...state, worktrees: state.worktrees.slice(0, 1) }), /다른 작업 폴더/);
});

test("keeps relaxed Safe Guard rules visible in graph and sidebar", () => {
  const state = { kind: "repository", root: "/repo", branch: "main", refs: [], commits, relaxedRules: ["Pull 전 겹치는 로컬 변경 차단"] };
  assert.match(renderGraphHtml(state), /세션 동안 완화된 보호.*Pull 전 겹치는 로컬 변경 차단/);
  assert.match(renderSidebarHtml(state), /세션 동안 완화된 보호.*Pull 전 겹치는 로컬 변경 차단/);
});
