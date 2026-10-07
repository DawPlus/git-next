import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runWithGitStateDelta } from "../src/git-operation-workflows.mts";

const exec = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await exec("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function repo() {
  const cwd = await mkdtemp(join(tmpdir(), "git-next-state-reuse-"));
  await git(cwd, "init", "-q", "-b", "main");
  await git(cwd, "config", "user.email", "test@example.com");
  await git(cwd, "config", "user.name", "Git Next Test");
  await writeFile(join(cwd, "app.txt"), "base\n");
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "base");
  return cwd;
}

test("pre-action snapshot reuse still refreshes state after mutation", async () => {
  const cwd = await repo();
  const beforeSnapshot = {
    branch: "main",
    upstream: null,
    tracking: { kind: "no-upstream", ahead: 0, behind: 0, upstream: null },
    dirty: false,
  };

  const result = await runWithGitStateDelta(
    cwd,
    async () => {
      await appendFile(join(cwd, "app.txt"), "changed\n");
      return { ok: true, message: "완료" };
    },
    { beforeSnapshot },
  );

  assert.equal(result.message, "완료 상태 변화: 작업 폴더 깨끗함 → 변경 있음");
});
