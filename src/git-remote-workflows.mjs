import { runGit, parseNameStatus } from "./git-command.mjs";

import { getChangeWorkspace } from "./git-change-workflows.mjs";

export async function listRemotes(cwd) {
  const result = await runGit(cwd, ["remote", "-v"]);
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
  const result = await runGit(cwd, ["remote", "add", name, url]);
  return { ...result, action: "remote-add", message: result.ok ? `원격 '${name}'을 추가했습니다.` : "원격을 추가하지 못했습니다." };
}

export async function renameRemote(cwd, oldName, newName) {
  const result = await runGit(cwd, ["remote", "rename", oldName, newName]);
  return { ...result, action: "remote-rename", message: result.ok ? `원격 '${oldName}'을 '${newName}'으로 바꿨습니다.` : "원격 이름을 바꾸지 못했습니다." };
}

export async function removeRemote(cwd, name) {
  const result = await runGit(cwd, ["remote", "remove", name]);
  return { ...result, action: "remote-remove", message: result.ok ? `원격 '${name}'을 제거했습니다.` : "원격을 제거하지 못했습니다." };
}


export async function refreshRemote(cwd) {
  const result = await runGit(cwd, ["fetch", "--prune"]);
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

  const upstream = await runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) {
    return { ok: false, message: "현재 브랜치에 연결된 원격 브랜치가 없습니다.", detail: upstream.detail, files: [] };
  }

  const [workspace, outgoing, incoming] = await Promise.all([
    getChangeWorkspace(cwd),
    runGit(cwd, ["diff", "--name-status", "@{u}..HEAD"]),
    runGit(cwd, ["diff", "--name-status", "HEAD..@{u}"]),
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

export function getPullRequestReadiness({ branch, upstream, tracking, changes = [] }) {
  const ahead = tracking?.ahead ?? 0;
  const behind = tracking?.behind ?? 0;
  const untrackedCount = changes.filter((change) => change.status === "??").length;
  const blockers = [];
  const nextActions = [];

  if (!branch) {
    blockers.push("현재 브랜치를 확인할 수 없습니다.");
    nextActions.push("브랜치 상태를 확인하세요.");
  }
  if (!upstream) {
    blockers.push("현재 브랜치에 연결된 Upstream이 없습니다.");
    nextActions.push("첫 Push에서 Remote와 브랜치를 연결하세요.");
  } else if (["behind", "diverged", "unknown"].includes(tracking?.kind)) {
    blockers.push(tracking.kind === "diverged"
      ? "로컬과 원격 기록이 갈라졌습니다."
      : tracking.kind === "behind"
        ? "원격에 먼저 반영된 커밋이 있습니다."
        : "원격 추적 상태를 확인하지 못했습니다.");
    nextActions.push(tracking.kind === "unknown"
      ? "Remote 연결을 확인하고 새로고침하세요."
      : "Branch 비교에서 차이를 확인하고 동기화하세요.");
  }
  if (upstream && tracking?.kind === "up-to-date" && ahead === 0) {
    blockers.push("PR에 포함할 로컬 커밋이 없습니다.");
    nextActions.push("변경 내용을 Commit한 뒤 Push하세요.");
  }

  const warnings = changes.length
    ? [`작업 폴더에 미커밋 변경 ${changes.length}개가 있습니다. PR에는 포함되지 않습니다.`]
    : [];
  if (untrackedCount) warnings.push(`추적하지 않는 파일 ${untrackedCount}개가 있습니다.`);

  return {
    ready: blockers.length === 0,
    ahead,
    behind,
    tracking: tracking?.kind ?? "unknown",
    upstream: upstream ?? null,
    dirtyCount: changes.length,
    untrackedCount,
    blockers,
    warnings,
    nextActions,
  };
}

export function createPullRequestDraft(branch, commits) {
  if (!commits?.length) return null;
  return {
    title: commits[0].subject || branch,
    body: commits.map((commit) => `- ${commit.subject}`).join("\n"),
  };
}
