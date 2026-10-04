import { execFile } from "node:child_process";

import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runGit(cwd, args, env = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    return { ok: true, detail: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (error) {
    return {
      ok: false,
      detail: [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function parseNameStatus(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [status = "", ...parts] = line.split("\t");
    return {
      status,
      oldPath: parts.length > 1 ? parts[0] : null,
      path: parts.at(-1) ?? "",
    };
  });
}

export function parseSubjects(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", ...rest] = line.split(" ");
    return { id, subject: rest.join(" ") };
  });
}
