import assert from "node:assert/strict";
import test from "node:test";

import { parseCommits, parseRefs, parseWorktrees } from "../src/git-state.mts";

test("parses commit graph records", () => {
  const raw = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc\x1fAlice\x1f2026-10-04T10:00:00+09:00\x1fmerge work\x1e",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1f\x1fBob\x1f2026-10-04T09:00:00+09:00\x1finitial\x1e",
  ].join("");

  assert.deepEqual(parseCommits(raw), [
    {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      parents: [
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "cccccccccccccccccccccccccccccccccccccccc",
      ],
      author: "Alice",
      authoredAt: "2026-10-04T10:00:00+09:00",
      message: "merge work",
    },
    {
      id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      parents: [],
      author: "Bob",
      authoredAt: "2026-10-04T09:00:00+09:00",
      message: "initial",
    },
  ]);
});

test("parses local and remote refs", () => {
  const raw = [
    "refs/heads/main\x1faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1forigin/main\x1e",
    "refs/remotes/origin/main\x1fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1f\x1e",
  ].join("");

  assert.deepEqual(parseRefs(raw), [
    {
      name: "main",
      fullName: "refs/heads/main",
      target: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "local",
      upstream: "origin/main",
    },
    {
      name: "origin/main",
      fullName: "refs/remotes/origin/main",
      target: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      kind: "remote",
      upstream: null,
    },
  ]);
});


test("parses linked worktrees, their branches, and the current path", () => {
  const raw = "worktree /repo/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/feature\nHEAD def\nbranch refs/heads/feature\n";
  assert.deepEqual(parseWorktrees(raw, "/repo/feature"), [
    { path: "/repo/main", branch: "main", detached: false, isCurrent: false },
    { path: "/repo/feature", branch: "feature", detached: false, isCurrent: true },
  ]);
});
