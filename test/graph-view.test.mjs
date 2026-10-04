import assert from "node:assert/strict";
import test from "node:test";

import {
  filterGraphState,
  layoutGraph,
  renderGraphHtml,
} from "../src/graph-view.mjs";
import { renderSidebarHtml } from "../src/sidebar-view.mjs";

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
  assert.match(html, /prefers-reduced-motion/);
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
  assert.match(html, /aria-label="동기화 도움말"/);
  assert.match(html, /받기 · Pull/);
  assert.match(html, /보내기 · Push/);
  assert.match(html, /Safe Guard/);
  assert.doesNotMatch(html, /aria-label="커밋 그래프"/);
});

test("keeps the status hint and Safe Guard compact above collapsible change groups", () => {
  const html = renderSidebarHtml({
    kind: "repository", root: "/repo", branch: "main", upstream: "origin/main", head: "m", refs: [], commits,
    tracking: { kind: "up-to-date", ahead: 0, behind: 0, upstream: "origin/main" }, pullBeforePush: false,
    changes: [{ path: "src/extension.js", status: " M" }],
    nextAction: { title: "로컬 변경을 먼저 Commit 또는 Stash하세요", detail: "" },
  }, { ok: false, level: "warning", message: "확인 필요", detail: "상세 설명" });

  const changesIndex = html.indexOf("class=\"section source-control\"");
  assert.ok(html.indexOf("data-toggle-tools") < changesIndex);
  assert.ok(html.indexOf("class=\"status-hints\"") < html.indexOf("id=\"sidebar-commit-message\""));
  assert.ok(html.indexOf("id=\"sidebar-commit-message\"") < changesIndex);
  assert.ok(html.indexOf("data-action=\"push\"") < changesIndex);
  assert.ok(html.indexOf("class=\"status-hints\"") < changesIndex);
  assert.ok(html.indexOf("class=\"safe-guard\"") === -1);
  assert.doesNotMatch(html, /현재 변경 파일 \d+개가 있습니다/);
  assert.match(html, /class="scm-count">1개<\/span>/);
  assert.match(html, /class="guard-summary warning"/);
  assert.match(html, /class="guard-message-button has-notice"/);
  assert.doesNotMatch(html, />확인 필요</);
  assert.match(html, /<details class="scm-group scm-card" open>/);
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
  assert.match(html, /class="revert-icon"/);
  assert.match(html, /\.guard-message-button svg,[\s\S]*\.hint-mark svg\s*\{[^}]*stroke:\s*currentColor/s);
  assert.match(html, /\.repo-action:hover\s*\{\s*transform:\s*none/);
});
