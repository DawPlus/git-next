import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CommitSubject, GitCommandResult, GitEnvironment, NameStatusEntry } from "./git-types.mjs";
import { traceAsync } from "./perf-trace.js";

const execFileAsync = promisify(execFile);

// Network operations may legitimately take longer than local inspections.
export function gitExecutionLimits(args: readonly string[]) {
  const command = args[0] ?? "";
  const network = new Set(["fetch", "pull", "push", "clone", "ls-remote"]);
  return {
    timeout: network.has(command) ? 10 * 60_000 : 2 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  };
}

type ExecFileError = Error & { stdout?: string; stderr?: string };

export async function runGit(
  cwd: string,
  args: string[],
  env: GitEnvironment = {},
): Promise<GitCommandResult> {
  const label = `git:${args[0] ?? "unknown"}`;
  try {
    const { stdout, stderr } = await traceAsync(label, cwd, () => execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      ...gitExecutionLimits(args),
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    }));
    return { ok: true, detail: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (error) {
    const failure = error as ExecFileError;
    return {
      ok: false,
      detail: [failure.stdout, failure.stderr, failure.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function parseNameStatus(raw: string): NameStatusEntry[] {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [status = "", ...parts] = line.split("\t");
    return {
      status,
      oldPath: parts.length > 1 ? parts[0] ?? null : null,
      path: parts.at(-1) ?? "",
    };
  });
}

export function parseSubjects(raw: string): CommitSubject[] {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", ...rest] = line.split(" ");
    return { id, subject: rest.join(" ") };
  });
}
