import test from "node:test";
import assert from "node:assert/strict";
import { gitExecutionLimits, runGit } from "../src/git-command.mts";

test("local commands are bounded and network operations have a longer timeout", () => {
  assert.deepEqual(gitExecutionLimits(["status"]), { timeout: 120000, maxBuffer: 33554432 });
  assert.deepEqual(gitExecutionLimits(["fetch"]), { timeout: 600000, maxBuffer: 33554432 });
  assert.deepEqual(gitExecutionLimits(["push"]), gitExecutionLimits(["fetch"]));
});

test("invalid Git subcommand is a bounded failure rather than a throw", async () => {
  const result = await runGit(process.cwd(), ["not-a-git-command"]);
  assert.equal(result.ok, false);
});
