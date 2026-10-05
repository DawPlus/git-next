import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const FIELD = "\x1f";
const RECORD = "\x1e";

export function parseCommits(raw) {
  return raw
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [id, parents = "", author = "", authoredAt = "", message = ""] = record.split(FIELD);

      return {
        id,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author,
        authoredAt,
        message,
      };
    });
}

export function parseRefs(raw) {
  return raw
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [fullName, target, upstream = ""] = record.split(FIELD);
      const localPrefix = "refs/heads/";
      const remotePrefix = "refs/remotes/";
      const tagPrefix = "refs/tags/";
      const kind = fullName.startsWith(localPrefix)
        ? "local"
        : fullName.startsWith(tagPrefix)
          ? "tag"
          : "remote";
      const name = fullName.startsWith(localPrefix)
        ? fullName.slice(localPrefix.length)
        : fullName.startsWith(tagPrefix)
          ? fullName.slice(tagPrefix.length)
          : fullName.slice(remotePrefix.length);

      return {
        name,
        fullName,
        target,
        kind,
        upstream: upstream || null,
      };
    });
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  return stdout.trim();
}

async function gitOr(cwd, args, fallback = "") {
  try {
    return await git(cwd, args);
  } catch {
    return fallback;
  }
}

export function parseWorktrees(raw, currentPath) {
  return raw.trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const fields = Object.fromEntries(block.split("\n").map((line) => {
      const index = line.indexOf(" ");
      return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
    }));
    return {
      path: fields.worktree,
      branch: fields.branch?.replace(/^refs\/heads\//, "") ?? null,
      detached: "detached" in fields,
      isCurrent: resolve(fields.worktree) === resolve(currentPath),
    };
  });
}

export async function getLinkedWorktrees(cwd) {
  try {
    const [raw, root] = await Promise.all([
      git(cwd, ["worktree", "list", "--porcelain"]),
      git(cwd, ["rev-parse", "--show-toplevel"]),
    ]);
    return parseWorktrees(raw, root);
  } catch {
    return [];
  }
}

export async function getRepositoryState(cwd, { limit = 100 } = {}) {
  const root = await gitOr(cwd, ["rev-parse", "--show-toplevel"], "");

  if (!root) {
    return {
      kind: "no-repository",
      root: null,
      branch: null,
      upstream: null,
      head: null,
      refs: [],
      commits: [],
    };
  }

  const [branch, upstream, head, refsRaw, commitsRaw] = await Promise.all([
    gitOr(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], ""),
    gitOr(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], ""),
    gitOr(root, ["rev-parse", "--verify", "HEAD"], ""),
    gitOr(
      root,
      [
        "for-each-ref",
        "--format=%(refname)" + FIELD + "%(objectname)" + FIELD + "%(upstream:short)" + RECORD,
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      "",
    ),
    gitOr(
      root,
      [
        "log",
        "--all",
        "--max-count=" + limit,
        "--pretty=format:%H" + FIELD + "%P" + FIELD + "%an" + FIELD + "%aI" + FIELD + "%s" + RECORD,
      ],
      "",
    ),
  ]);

  return {
    kind: "repository",
    root,
    branch: branch || null,
    upstream: upstream || null,
    head: head || null,
    refs: parseRefs(refsRaw),
    commits: parseCommits(commitsRaw),
  };
}
