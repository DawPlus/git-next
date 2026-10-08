import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkingTreeStatus } from "../src/git-tracking.mts";

test("porcelain -z rename destination is used as the real file path", () => {
  const raw = "R  docs/tickets/archive/2026-10/T-261007-01.md\0docs/tickets/active/T-261007-01.md\0";
  assert.deepEqual(parseWorkingTreeStatus(raw), [{
    status: "R ",
    path: "docs/tickets/archive/2026-10/T-261007-01.md",
  }]);
});

test("porcelain -z keeps spaces, arrow-looking names, and multiple file changes", () => {
  const raw = "?? docs/note -> odd.txt\0 M src/space name.ts\0A  src/a.ts\0";
  assert.deepEqual(parseWorkingTreeStatus(raw), [
    { status: "??", path: "docs/note -> odd.txt" },
    { status: " M", path: "src/space name.ts" },
    { status: "A ", path: "src/a.ts" },
  ]);
});

test("porcelain -z safely consumes copy origin records", () => {
  assert.deepEqual(parseWorkingTreeStatus("C  docs/new.md\0docs/original.md\0"), [
    { status: "C ", path: "docs/new.md" },
  ]);
});
