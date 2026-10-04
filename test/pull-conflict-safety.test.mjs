import assert from "node:assert/strict";
import test from "node:test";

import { parseMergeTreeConflictOutput } from "../src/git-safety.mjs";

test("parses conflict file names from merge-tree output", () => {
  const files = parseMergeTreeConflictOutput(
    "CONFLICT (content): Merge conflict in src/app.js\nCONFLICT (add/add): Merge conflict in README.md",
  );

  assert.deepEqual(files, ["src/app.js", "README.md"]);
});
