import assert from "node:assert/strict";
import test from "node:test";

import {
  filterGraphState,
  layoutGraph,
  renderGraphHtml,
  renderSidebarHtml,
} from "../src/graph-view.mjs";

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
  assert.match(html, /aria-label="그래프"/);
  assert.match(html, /aria-label="Compare"/);
  assert.match(html, /받기 · Pull/);
  assert.match(html, /보내기 · Push/);
  assert.match(html, /Safe Guard/);
  assert.doesNotMatch(html, /aria-label="커밋 그래프"/);
});
