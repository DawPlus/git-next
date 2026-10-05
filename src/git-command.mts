import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CommitSubject, GitCommandResult, GitEnvironment, NameStatusEntry } from "./git-types.mjs";

const execFileAsync = promisify(execFile);

type ExecFileError = Error & { stdout?: string; stderr?: string };

export async function runGit(
  cwd: string,
  args: string[],
  env: GitEnvironment = {},
): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, ...env },
    });
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
