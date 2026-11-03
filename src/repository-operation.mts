import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { open, readFile, realpath, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runGit } from "./git-command.mjs";

const operations = new AsyncLocalStorage<Map<string, { active: boolean }>>();

export async function inspectRepositoryLock(lockPath: string) {
  let pid: number | null = null;
  let startedAt: string | null = null;
  try {
    const data: unknown = JSON.parse(await readFile(lockPath, "utf8"));
    if (data && typeof data === "object") {
      const owner = data as Record<string, unknown>;
      if (Number.isSafeInteger(owner.pid) && (owner.pid as number) > 0) pid = owner.pid as number;
      if (typeof owner.startedAt === "string" && !Number.isNaN(Date.parse(owner.startedAt))) startedAt = owner.startedAt;
    }
  } catch {
    // An incomplete lock must never be treated as safe to delete.
  }
  let processStatus: "running" | "not-running" | "unknown" = "unknown";
  if (pid !== null) {
    try {
      process.kill(pid, 0);
      processStatus = "running";
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") processStatus = "not-running";
    }
  }
  return { lockPath, pid, startedAt, processStatus };
}

export async function withRepositoryOperation<T>(cwd: string, action: () => Promise<T>): Promise<T> {
  const directory = await runGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (!directory.ok) return action();
  const key = await realpath(resolve(cwd, directory.detail));
  if (operations.getStore()?.get(key)?.active) return action();
  const lockPath = join(key, "git-next-operation.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const lockInfo = await inspectRepositoryLock(lockPath);
      throw Object.assign(new Error(lockPath), { code: "repository-busy", lockInfo });
    }
    throw error;
  }
  const owner = { active: true };
  try {
    // A crash leaves the lock for manual recovery; never steal a possibly live operation.
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await operations.run(new Map([...(operations.getStore() ?? []), [key, owner]]), action);
  } finally {
    owner.active = false;
    await lock.close();
    await unlink(lockPath);
  }
}

export async function repositoryFingerprint(cwd: string): Promise<string | null> {
  const commands = [
    ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
    ["ls-files", "--stage", "-z"],
    ["for-each-ref", "--format=%(refname) %(objectname)"],
    ["stash", "list", "--format=%H"],
    ["config", "--local", "--list", "-z"],
  ];
  const results = await Promise.all(commands.map(args => runGit(cwd, args)));
  if (results.some(result => !result.ok)) return null;
  return createHash("sha256").update(JSON.stringify(results.map(result => result.detail))).digest("hex");
}
