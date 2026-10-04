import { runGit, parseNameStatus } from "./git-command.mjs";

export function getCommitMessageHints(message) {
  const [subject = "", ...body] = String(message ?? "").trim().split(/\r?\n/);
  if (!subject) return [];
  const hints = [];
  if (subject.length > 72) hints.push("제목이 길어요. 핵심을 짧게 줄여 보세요.");
  if (subject.length < 8 || /^(update|change|changes|fix|wip|misc|수정|변경|작업)(?:\b|[ :.-]|$)/i.test(subject)) {
    hints.push("무엇을 바꿨는지 드러나는 제목인지 확인해 보세요.");
  }
  if (!body.join("\n").trim()) hints.push("본문이 비어 있어요. 배경이나 영향이 필요하면 한 줄 덧붙이세요.");
  return hints;
}

export function formatStashPreview(changes, message) {
  const files = changes.slice(0, 8).map(({ status = "", path }) => `${status} ${path}`.trim());
  if (changes.length > files.length) files.push(`외 ${changes.length - files.length}개`);
  return [`메모: ${message}`, `포함 파일 ${changes.length}개`, ...files].join("\n");
}

export async function commitWithMessage(cwd, message) {
  const result = await runGit(cwd, ["commit", "-m", message]);
  return {
    ...result,
    action: "commit",
    message: result.ok ? `커밋을 만들었습니다: ${message}` : "커밋을 만들지 못했습니다.",
  };
}

export async function getCommitSuggestion(cwd) {
  const staged = await runGit(cwd, ["diff", "--cached", "--name-status"]);
  const unstaged = await runGit(cwd, ["diff", "--name-status"]);
  const files = parseNameStatus(staged.detail);
  if (!files.length) return { subject: "", files: [] };

  const names = files.map((file) => file.path);
  const prefix = files.some((file) => file.status.startsWith("A"))
    ? "feat"
    : files.every((file) => file.status.startsWith("D"))
      ? "chore"
      : "fix";
  const focus = names.length === 1 ? names[0].split("/").at(-1) : `${names.length} files`;
  return { subject: `${prefix}: update ${focus}`, files };
}

function parsePorcelain(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    const path = line.slice(3).trim().split(" -> ").at(-1);
    return {
      status,
      path,
      staged: status[0] !== " " && status[0] !== "?",
      unstaged: status === "??" || status[1] !== " ",
      untracked: status === "??",
    };
  });
}

export async function getChangeWorkspace(cwd) {
  const [stagedResult, unstagedResult, untrackedResult] = await Promise.all([
    runGit(cwd, ["diff", "--cached", "--name-status"]),
    runGit(cwd, ["diff", "--name-status"]),
    runGit(cwd, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const stagedRows = stagedResult.ok ? parseNameStatus(stagedResult.detail) : [];
  const unstagedRows = unstagedResult.ok ? parseNameStatus(unstagedResult.detail) : [];
  const untrackedPaths = untrackedResult.ok && untrackedResult.detail
    ? untrackedResult.detail.split("\n").filter(Boolean)
    : [];

  const map = new Map();
  const ensure = (path) => {
    const current = map.get(path) ?? {
      path,
      status: "",
      staged: false,
      unstaged: false,
      untracked: false,
    };
    map.set(path, current);
    return current;
  };

  for (const row of stagedRows) {
    const file = ensure(row.path);
    file.staged = true;
    file.status = row.status;
  }
  for (const row of unstagedRows) {
    const file = ensure(row.path);
    file.unstaged = true;
    file.status = file.status || row.status;
  }
  for (const path of untrackedPaths) {
    const file = ensure(path);
    file.unstaged = true;
    file.untracked = true;
    file.status = "??";
  }

  const files = [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    staged: files.filter((file) => file.staged),
    unstaged: files.filter((file) => file.unstaged),
  };
}

export async function stageFile(cwd, path) {
  const result = await runGit(cwd, ["add", "--", path]);
  return { ...result, action: "stage-file", message: result.ok ? `${path}을(를) Staging했습니다.` : "파일을 Staging하지 못했습니다." };
}

export async function stageAll(cwd) {
  const result = await runGit(cwd, ["add", "-A"]);
  return { ...result, action: "stage-all", message: result.ok ? "모든 변경사항을 Staging했습니다." : "전체 Staging에 실패했습니다." };
}

export async function unstageFile(cwd, path) {
  const result = await runGit(cwd, ["restore", "--staged", "--", path]);
  return { ...result, action: "unstage-file", message: result.ok ? `${path}을(를) Staging에서 제외했습니다.` : "파일을 Unstage하지 못했습니다." };
}

export async function unstageAll(cwd) {
  const result = await runGit(cwd, ["reset"]);
  return { ...result, action: "unstage-all", message: result.ok ? "모든 Staging을 해제했습니다." : "전체 Unstage에 실패했습니다." };
}

export async function discardFile(cwd, path, { untracked = false } = {}) {
  const result = untracked
    ? await runGit(cwd, ["clean", "-f", "--", path])
    : await runGit(cwd, ["restore", "--staged", "--worktree", "--", path]);
  return {
    ...result,
    action: "discard-file",
    message: result.ok ? `${path}의 로컬 변경을 버렸습니다.` : "파일 변경을 버리지 못했습니다.",
  };
}

export async function getStagedFiles(cwd) {
  const result = await runGit(cwd, ["diff", "--cached", "--name-status"]);
  return result.ok ? parseNameStatus(result.detail) : [];
}
