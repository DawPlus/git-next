import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
      const [fullName, target] = record.split(FIELD);
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
        "--format=%(refname)" + FIELD + "%(objectname)" + RECORD,
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
