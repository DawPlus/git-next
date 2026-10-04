import assert from "node:assert/strict";
import test from "node:test";

import { parseCommits, parseRefs } from "../src/git-state.mjs";

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
    "refs/heads/main\x1faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1e",
    "refs/remotes/origin/main\x1fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1e",
  ].join("");

  assert.deepEqual(parseRefs(raw), [
    {
      name: "main",
      fullName: "refs/heads/main",
      target: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "local",
    },
    {
      name: "origin/main",
      fullName: "refs/remotes/origin/main",
      target: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      kind: "remote",
    },
  ]);
});
