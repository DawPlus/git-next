import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getTrackingStatus, getWorkingTreeChanges } from "./git-safety.mjs";
import { getRepositoryState } from "./git-state.mjs";

const execFileAsync = promisify(execFile);

async function run(cwd, args) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    });
    return { ok: true, detail: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (error) {
    return {
      ok: false,
      detail: [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export async function listConflictedFiles(cwd) {
  const result = await run(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return result.ok && result.detail ? result.detail.split("\n").filter(Boolean) : [];
}

export async function resolveConflictSide(cwd, path, side) {
  const checkout = await run(cwd, ["checkout", side === "mine" ? "--ours" : "--theirs", "--", path]);
  if (!checkout.ok) {
    return { ...checkout, action: "resolve-conflict", message: "충돌 쪽을 선택하지 못했습니다." };
  }
  const add = await run(cwd, ["add", "--", path]);
  return {
    ...add,
    action: "resolve-conflict",
    message: add.ok
      ? `${path}: ${side === "mine" ? "내 변경" : "들어온 변경"}을 선택하고 해결됨으로 표시했습니다.`
      : "파일을 해결됨으로 표시하지 못했습니다.",
  };
}

export async function continueMerge(cwd) {
  const conflicts = await listConflictedFiles(cwd);
  if (conflicts.length) {
    return {
      ok: false,
      action: "merge-continue",
      message: `아직 충돌 파일이 ${conflicts.length}개 남아 있습니다.`,
      detail: conflicts.join("\n"),
    };
  }
  const result = await run(cwd, ["commit", "--no-edit"]);
  return {
    ...result,
    action: "merge-continue",
    message: result.ok ? "충돌 정리를 반영하고 Merge를 완료했습니다." : "Merge를 완료하지 못했습니다.",
  };
}

export async function abortMerge(cwd) {
  const result = await run(cwd, ["merge", "--abort"]);
  return {
    ...result,
    action: "merge-abort",
    message: result.ok ? "진행 중인 Merge를 취소하고 이전 상태로 돌아갔습니다." : "Merge를 취소하지 못했습니다.",
  };
}

function parseNameStatus(raw) {
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

function parseSubjects(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", ...rest] = line.split(" ");
    return { id, subject: rest.join(" ") };
  });
}

export async function getActionImpactPreview(cwd, action) {
  if (action === "push") {
    const [upstream, commits, files] = await Promise.all([
      run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
      run(cwd, ["log", "--oneline", "@{u}..HEAD"]),
      run(cwd, ["diff", "--name-status", "@{u}..HEAD"]),
    ]);
    const parsedCommits = commits.ok ? parseSubjects(commits.detail) : [];
    const parsedFiles = commits.ok && parsedCommits.length && files.ok ? parseNameStatus(files.detail) : [];
    return {
      action,
      upstream: upstream.ok ? upstream.detail : null,
      commits: parsedCommits,
      files: parsedFiles,
      summary: parsedCommits.length
        ? `원격에 커밋 ${parsedCommits.length}개를 보낼 예정입니다.`
        : "원격에 보낼 새 커밋이 없습니다.",
    };
  }

  const [upstream, commits] = await Promise.all([
    run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run(cwd, ["log", "--oneline", "HEAD..@{u}"]),
  ]);
  const parsedCommits = commits.ok ? parseSubjects(commits.detail) : [];
  let parsedFiles = [];
  if (upstream.ok && commits.ok && parsedCommits.length) {
    const files = await run(cwd, ["diff", "--name-status", `HEAD..${upstream.detail}`]);
    parsedFiles = files.ok ? parseNameStatus(files.detail) : [];
  }
  return {
    action,
    upstream: upstream.ok ? upstream.detail : null,
    commits: parsedCommits,
    files: parsedFiles,
    summary: parsedCommits.length
      ? `원격 커밋 ${parsedCommits.length}개를 내 로컬에 반영할 예정입니다.`
      : "받아올 새 커밋이 없습니다.",
  };
}

export function formatImpactPreview(preview) {
  const added = preview.files.filter((file) => file.status.startsWith("A")).length;
  const deleted = preview.files.filter((file) => file.status.startsWith("D")).length;
  const changed = preview.files.length - added - deleted;
  const direction = preview.action === "pull"
    ? `서버 ${preview.upstream ?? "Remote"} → 로컬`
    : `로컬 → 서버 ${preview.upstream ?? "Remote"}`;
  const commitLines = preview.commits.slice(0, 5).map((commit) => `• ${commit.id} ${commit.subject}`);
  const fileLines = preview.files.slice(0, 5).map((file) => `• ${file.status} ${file.path}`);
  return [
    direction,
    preview.summary,
    preview.files.length ? `영향 파일 ${preview.files.length}개 · 변경 ${changed} · 추가 ${added} · 삭제 ${deleted}` : "영향 파일 없음",
    commitLines.length ? `\n${preview.action === "pull" ? "받아올 커밋" : "보낼 커밋"}\n${commitLines.join("\n")}${preview.commits.length > 5 ? `\n외 ${preview.commits.length - 5}개` : ""}` : null,
    fileLines.length ? `\n변경 파일 미리보기\n${fileLines.join("\n")}${preview.files.length > 5 ? `\n외 ${preview.files.length - 5}개` : ""}` : null,
  ].filter(Boolean).join("\n");
}

export function formatGitStateDelta(before, after) {
  const changes = [];
  if (before.branch !== after.branch) changes.push(`브랜치 ${before.branch ?? "없음"} → ${after.branch ?? "없음"}`);
  if (before.upstream !== after.upstream) changes.push(`추적 Remote ${before.upstream ?? "없음"} → ${after.upstream ?? "없음"}`);
  if (before.tracking && after.tracking && (before.tracking.ahead !== after.tracking.ahead || before.tracking.behind !== after.tracking.behind)) {
    const trackingChanges = [];
    if (before.tracking.ahead !== after.tracking.ahead) trackingChanges.push(`ahead ${before.tracking.ahead} → ${after.tracking.ahead}`);
    if (before.tracking.behind !== after.tracking.behind) trackingChanges.push(`behind ${before.tracking.behind} → ${after.tracking.behind}`);
    changes.push(`원격 기준 ${trackingChanges.join(", ")}`);
  }
  if (before.dirty !== after.dirty) changes.push(`작업 폴더 ${before.dirty ? "변경 있음" : "깨끗함"} → ${after.dirty ? "변경 있음" : "깨끗함"}`);
  return changes.length ? `상태 변화: ${changes.join(" · ")}` : "상태 변화 없음";
}

export async function runWithGitStateDelta(cwd, action) {
  const snapshot = async () => {
    const state = await getRepositoryState(cwd);
    const root = state.root ?? cwd;
    const [tracking, changes] = await Promise.all([getTrackingStatus(root), getWorkingTreeChanges(root)]);
    return { branch: state.branch, upstream: state.upstream, tracking, dirty: changes.length > 0 };
  };
  const before = await snapshot();
  const result = await action();
  if (!result.ok) return result;
  const after = await snapshot();
  return { ...result, message: `${result.message} ${formatGitStateDelta(before, after)}` };
}

export async function compareBranches(cwd, base, other) {
  const [counts, baseOnly, otherOnly, files, mergeBase] = await Promise.all([
    run(cwd, ["rev-list", "--left-right", "--count", `${base}...${other}`]),
    run(cwd, ["log", "--oneline", `${other}..${base}`]),
    run(cwd, ["log", "--oneline", `${base}..${other}`]),
    run(cwd, ["diff", "--name-status", `${base}...${other}`]),
    run(cwd, ["merge-base", base, other]),
  ]);
  const mergeBaseDetails = mergeBase.ok
    ? await run(cwd, ["show", "-s", "--format=%H%x1f%s", mergeBase.detail])
    : { ok: false, detail: "" };
  const [mergeBaseId = null, ...mergeBaseSubjectParts] = mergeBaseDetails.ok ? mergeBaseDetails.detail.split("\x1f") : [];
  const [baseCount = 0, otherCount = 0] = counts.ok ? counts.detail.split(/\s+/).map(Number) : [0, 0];
  return {
    base,
    other,
    mergeBase: mergeBaseId,
    mergeBaseSubject: mergeBaseSubjectParts.join("\x1f"),
    baseCount,
    otherCount,
    baseOnly: baseOnly.ok ? parseSubjects(baseOnly.detail) : [],
    otherOnly: otherOnly.ok ? parseSubjects(otherOnly.detail) : [],
    files: files.ok ? parseNameStatus(files.detail) : [],
  };
}

export function recommendNextAction({ tracking, changes = [], operation = null } = {}) {
  if (operation) {
    return {
      kind: "operation",
      title: `${operation.operation} 작업을 먼저 끝내세요`,
      detail: "계속하거나 취소하기 전에는 다른 Git 작업을 이어가지 않는 게 안전합니다.",
    };
  }
  if (changes.length) {
    return {
      kind: "dirty",
      title: "로컬 변경을 먼저 Commit 또는 Stash하세요",
      detail: "",
    };
  }
  if (tracking?.kind === "behind") {
    return { kind: "pull", title: "원격 변경을 먼저 Pull하세요", detail: `원격이 ${tracking.behind}커밋 앞서 있습니다.` };
  }
  if (tracking?.kind === "diverged") {
    return { kind: "diverged", title: "브랜치 차이를 먼저 확인하세요", detail: "로컬과 원격 양쪽에 서로 다른 커밋이 있습니다." };
  }
  if (tracking?.kind === "ahead") {
    return { kind: "push", title: "Push할 변경이 있습니다", detail: `로컬이 ${tracking.ahead}커밋 앞서 있습니다.` };
  }
  return { kind: "clean", title: "현재 특별히 필요한 Git 작업이 없습니다", detail: "로컬과 원격 상태가 정리되어 있습니다." };
}

export function getGitDoctorFindings({ head, tracking, changes = [], operation = null, remoteRewrite = null } = {}) {
  const findings = [];
  const add = (finding) => findings.push(finding);

  if (operation) {
    add({
      id: "operation",
      state: `${operation.operation} 진행 중`,
      risk: "작업을 끝내기 전에 다른 Git 작업을 실행하면 상태가 더 복잡해질 수 있습니다.",
      recommendation: "충돌 파일과 Continue/Abort 방법을 확인하세요.",
      action: "conflict",
    });
  }
  if (head?.detached) {
    add({
      id: "detached-head",
      state: "Detached HEAD",
      risk: "새 커밋이 브랜치에 연결되지 않을 수 있습니다.",
      recommendation: "작업을 유지하려면 브랜치를 만들고, 아니면 기존 브랜치로 돌아가세요.",
      action: "branch",
      guideKey: "detached-head",
    });
  }

  const trackingFindings = {
    "no-upstream": {
      id: "no-upstream",
      state: "Upstream 없음",
      risk: "Pull 또는 Push의 대상 브랜치를 확인할 수 없습니다.",
      recommendation: "Remote와 추적 브랜치를 확인하세요.",
      action: "remote",
      guideKey: "no-upstream",
    },
    unknown: {
      id: "tracking-unknown",
      state: "원격 추적 상태 확인 불가",
      risk: "로컬과 원격 중 어느 쪽이 앞섰는지 알 수 없습니다.",
      recommendation: "Remote 연결을 확인한 뒤 새로고침하세요.",
      action: "refresh",
    },
    diverged: {
      id: "diverged",
      state: `로컬 ${tracking.ahead}개 앞섬 · 원격 ${tracking.behind}개 앞섬`,
      risk: "양쪽 기록이 갈라져 바로 동기화할 수 없습니다.",
      recommendation: "Branch 비교에서 양쪽 커밋을 확인하세요.",
      action: "compare",
      guideKey: "diverged",
    },
    behind: {
      id: "behind",
      state: `원격이 ${tracking.behind}개 커밋 앞섬`,
      risk: "로컬에 아직 없는 변경이 원격에 있습니다.",
      recommendation: "Pull 전에 변경 파일과 충돌 여부를 확인하세요.",
      action: "pull",
    },
    ahead: {
      id: "ahead",
      state: `로컬이 ${tracking.ahead}개 커밋 앞섬`,
      risk: "현재 커밋은 원격에 아직 공유되지 않았습니다.",
      recommendation: "보낼 커밋을 확인하고 Push하세요.",
      action: "push",
    },
  };
  if (trackingFindings[tracking?.kind]) add(trackingFindings[tracking.kind]);

  if (changes.length) {
    add({
      id: "dirty",
      state: `커밋하지 않은 변경 ${changes.length}개`,
      risk: "전환이나 복구 작업에서 로컬 내용을 잃을 수 있습니다.",
      recommendation: "Source Control에서 변경을 확인하고 Commit 또는 Stash하세요.",
      action: "scm",
    });
  }
  if (remoteRewrite?.rewritten) {
    add({
      id: "remote-rewrite",
      state: "원격 기록이 다시 작성됐을 수 있음",
      risk: "원격 커밋이 이전에 확인한 기록과 달라졌습니다.",
      recommendation: "Push를 멈추고 Compare에서 원격 기록을 확인하세요.",
      action: "compare",
      guideKey: "remote-history-rewritten",
    });
  }

  if (!findings.length) {
    add({
      id: "healthy",
      state: `정상 · ${head?.branch ?? "현재 브랜치"}`,
      risk: "확인된 위험이 없습니다.",
      recommendation: "현재 Git 작업을 계속할 수 있습니다.",
      action: "refresh",
    });
  }
  return findings;
}

export async function getUndoContext(cwd) {
  const [status, upstream] = await Promise.all([
    run(cwd, ["status", "--porcelain=v1"]),
    run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
  ]);
  const pushed = upstream.ok ? await run(cwd, ["merge-base", "--is-ancestor", "HEAD", "@{u}"]) : { ok: false };
  return {
    dirty: Boolean(status.detail),
    hasUpstream: upstream.ok,
    headIsInUpstream: pushed.ok,
  };
}

export async function createRecoveryPoint(cwd, action = "manual") {
  const head = await run(cwd, ["rev-parse", "HEAD"]);
  if (!head.ok) return { ...head, action: "recovery-point", message: "복구 지점을 만들 HEAD를 확인하지 못했습니다." };

  const actionName = String(action).replace(/[^a-zA-Z0-9-]/g, "-");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const name = `git-next-recovery/${actionName}-${stamp}${suffix}`;
    const created = await run(cwd, ["branch", name, head.detail]);
    if (created.ok) {
      return {
        ok: true,
        action: "recovery-point",
        name,
        commit: head.detail,
        message: `복구 지점 '${name}'에 현재 커밋을 보관했습니다. Undo의 복구 지점 메뉴에서 복원할 수 있습니다.`,
      };
    }
    if (!/already exists/i.test(created.detail)) {
      return { ...created, action: "recovery-point", message: "복구 지점을 만들지 못했습니다." };
    }
  }
  return { ok: false, action: "recovery-point", message: "고유한 복구 지점 이름을 만들지 못했습니다." };
}

export async function listRecoveryPoints(cwd) {
  const result = await run(cwd, [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(subject)",
    "refs/heads/git-next-recovery",
  ]);
  if (!result.ok || !result.detail) return [];
  return result.detail.split("\n").filter(Boolean).map((line) => {
    const [name = "", commit = "", subject = ""] = line.split("\t");
    return { name, commit, subject };
  });
}

export async function restoreFile(cwd, path) {
  const result = await run(cwd, ["restore", "--", path]);
  return { ...result, action: "restore-file", message: result.ok ? `${path}의 커밋하지 않은 변경을 되돌렸습니다.` : "파일을 되돌리지 못했습니다." };
}

export async function undoLastLocalCommit(cwd) {
  const result = await run(cwd, ["reset", "--soft", "HEAD~1"]);
  return { ...result, action: "undo-local-commit", message: result.ok ? "마지막 로컬 커밋을 취소하고 변경은 그대로 남겼습니다." : "마지막 커밋을 취소하지 못했습니다." };
}

export async function discardTrackedChanges(cwd) {
  const result = await run(cwd, ["restore", "--staged", "--worktree", "."]);
  return {
    ...result,
    action: "discard-tracked-changes",
    message: result.ok
      ? "추적 중인 파일의 커밋하지 않은 변경을 버렸습니다. 추적되지 않은 새 파일은 그대로 남아 있습니다."
      : "변경을 버리지 못했습니다.",
  };
}

export async function commitWithMessage(cwd, message) {
  const result = await run(cwd, ["commit", "-m", message]);
  return {
    ...result,
    action: "commit",
    message: result.ok ? `커밋을 만들었습니다: ${message}` : "커밋을 만들지 못했습니다.",
  };
}

export async function listReflog(cwd, limit = 30) {
  const result = await run(cwd, ["reflog", `--max-count=${limit}`, "--format=%H%x1f%gd%x1f%gs%x1f%cr"]);
  if (!result.ok || !result.detail) return [];
  return result.detail.split("\n").filter(Boolean).map((line) => {
    const [id, ref, subject, relative] = line.split("\x1f");
    return { id, ref, subject, relative };
  });
}

export async function listRemotes(cwd) {
  const result = await run(cwd, ["remote", "-v"]);
  if (!result.ok || !result.detail) return [];
  const map = new Map();
  for (const line of result.detail.split("\n")) {
    const [name, url, kindRaw = ""] = line.split(/\s+/);
    const kind = kindRaw.replace(/[()]/g, "");
    const item = map.get(name) ?? { name, fetchUrl: null, pushUrl: null };
    if (kind === "fetch") item.fetchUrl = url;
    if (kind === "push") item.pushUrl = url;
    map.set(name, item);
  }
  return [...map.values()];
}

export async function addRemote(cwd, name, url) {
  const result = await run(cwd, ["remote", "add", name, url]);
  return { ...result, action: "remote-add", message: result.ok ? `원격 '${name}'을 추가했습니다.` : "원격을 추가하지 못했습니다." };
}

export async function renameRemote(cwd, oldName, newName) {
  const result = await run(cwd, ["remote", "rename", oldName, newName]);
  return { ...result, action: "remote-rename", message: result.ok ? `원격 '${oldName}'을 '${newName}'으로 바꿨습니다.` : "원격 이름을 바꾸지 못했습니다." };
}

export async function removeRemote(cwd, name) {
  const result = await run(cwd, ["remote", "remove", name]);
  return { ...result, action: "remote-remove", message: result.ok ? `원격 '${name}'을 제거했습니다.` : "원격을 제거하지 못했습니다." };
}

export async function getCommitSuggestion(cwd) {
  const staged = await run(cwd, ["diff", "--cached", "--name-status"]);
  const unstaged = await run(cwd, ["diff", "--name-status"]);
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
    run(cwd, ["diff", "--cached", "--name-status"]),
    run(cwd, ["diff", "--name-status"]),
    run(cwd, ["ls-files", "--others", "--exclude-standard"]),
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
  const result = await run(cwd, ["add", "--", path]);
  return { ...result, action: "stage-file", message: result.ok ? `${path}을(를) Staging했습니다.` : "파일을 Staging하지 못했습니다." };
}

export async function stageAll(cwd) {
  const result = await run(cwd, ["add", "-A"]);
  return { ...result, action: "stage-all", message: result.ok ? "모든 변경사항을 Staging했습니다." : "전체 Staging에 실패했습니다." };
}

export async function unstageFile(cwd, path) {
  const result = await run(cwd, ["restore", "--staged", "--", path]);
  return { ...result, action: "unstage-file", message: result.ok ? `${path}을(를) Staging에서 제외했습니다.` : "파일을 Unstage하지 못했습니다." };
}

export async function unstageAll(cwd) {
  const result = await run(cwd, ["reset"]);
  return { ...result, action: "unstage-all", message: result.ok ? "모든 Staging을 해제했습니다." : "전체 Unstage에 실패했습니다." };
}

export async function discardFile(cwd, path, { untracked = false } = {}) {
  const result = untracked
    ? await run(cwd, ["clean", "-f", "--", path])
    : await run(cwd, ["restore", "--staged", "--worktree", "--", path]);
  return {
    ...result,
    action: "discard-file",
    message: result.ok ? `${path}의 로컬 변경을 버렸습니다.` : "파일 변경을 버리지 못했습니다.",
  };
}

export async function getStagedFiles(cwd) {
  const result = await run(cwd, ["diff", "--cached", "--name-status"]);
  return result.ok ? parseNameStatus(result.detail) : [];
}

export async function refreshRemote(cwd) {
  const result = await run(cwd, ["fetch", "--prune"]);
  return {
    ...result,
    action: "fetch",
    message: result.ok ? "원격 상태를 최신으로 갱신했습니다." : "원격 상태를 갱신하지 못했습니다.",
  };
}

export async function getLocalRemoteComparison(cwd, { refresh = true } = {}) {
  if (refresh) {
    const fetched = await refreshRemote(cwd);
    if (!fetched.ok) return { ok: false, message: fetched.message, detail: fetched.detail, files: [] };
  }

  const upstream = await run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) {
    return { ok: false, message: "현재 브랜치에 연결된 원격 브랜치가 없습니다.", detail: upstream.detail, files: [] };
  }

  const [workspace, outgoing, incoming] = await Promise.all([
    getChangeWorkspace(cwd),
    run(cwd, ["diff", "--name-status", "@{u}..HEAD"]),
    run(cwd, ["diff", "--name-status", "HEAD..@{u}"]),
  ]);

  const localMap = new Map();
  for (const file of [...(outgoing.ok ? parseNameStatus(outgoing.detail) : []), ...workspace.files]) {
    localMap.set(file.path, file.status);
  }
  const remoteMap = new Map((incoming.ok ? parseNameStatus(incoming.detail) : []).map((file) => [file.path, file.status]));
  const paths = [...new Set([...localMap.keys(), ...remoteMap.keys()])].sort();
  const files = paths.map((path) => ({
    path,
    localStatus: localMap.get(path) ?? null,
    remoteStatus: remoteMap.get(path) ?? null,
    scope: localMap.has(path) && remoteMap.has(path)
      ? "both"
      : localMap.has(path)
        ? "local"
        : "remote",
  }));

  return {
    ok: true,
    upstream: upstream.detail,
    files,
    localOnly: files.filter((file) => file.scope === "local"),
    remoteOnly: files.filter((file) => file.scope === "remote"),
    both: files.filter((file) => file.scope === "both"),
  };
}

export async function readGitFile(cwd, ref, path) {
  const result = await run(cwd, ["show", `${ref}:${path}`]);
  return result.ok ? { ok: true, content: result.detail } : { ok: false, content: "", detail: result.detail };
}

export async function getCommitDetails(cwd, commit) {
  const [meta, files] = await Promise.all([
    run(cwd, ["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%B", commit]),
    run(cwd, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", commit]),
  ]);
  if (!meta.ok) {
    return { ok: false, commit, files: [], message: "커밋 정보를 읽지 못했습니다.", detail: meta.detail };
  }

  const [id = commit, parentsRaw = "", author = "", email = "", authoredAt = "", ...messageParts] = meta.detail.split("\x1f");
  return {
    ok: true,
    id,
    parents: parentsRaw.split(/\s+/).filter(Boolean),
    author,
    email,
    authoredAt,
    message: messageParts.join("\x1f").trim(),
    files: files.ok ? parseNameStatus(files.detail) : [],
  };
}

export async function getStashDetails(cwd, ref) {
  const [files, stat, changes] = await Promise.all([
    run(cwd, ["stash", "show", "--include-untracked", "--name-status", ref]),
    run(cwd, ["stash", "show", "--include-untracked", "--stat", ref]),
    getWorkingTreeChanges(cwd),
  ]);
  const parsedFiles = files.ok ? parseNameStatus(files.detail) : [];
  const stashPaths = new Set(parsedFiles.flatMap((file) => [file.path, file.oldPath].filter(Boolean)));
  return {
    ref,
    files: parsedFiles,
    stat: stat.ok ? stat.detail : "",
    overlap: [...new Set(changes.filter((change) => stashPaths.has(change.path)).map((change) => change.path))],
  };
}

export function derivePullRequestUrl(remoteUrl, branch, target = "main") {
  if (!remoteUrl || !branch) return null;
  const github = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (github) {
    return `https://github.com/${github[1]}/${github[2]}/compare/${encodeURIComponent(target)}...${encodeURIComponent(branch)}?expand=1`;
  }
  const gitlab = remoteUrl.match(/gitlab\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i);
  if (gitlab) {
    return `https://gitlab.com/${gitlab[1]}/${gitlab[2]}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}&merge_request[target_branch]=${encodeURIComponent(target)}`;
  }
  return null;
}
