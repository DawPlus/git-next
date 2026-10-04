import { execFile } from "node:child_process";

import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function classifyTrackingStatus(ahead, behind) {
  if (ahead > 0 && behind > 0) {
    return { kind: "diverged", ahead, behind };
  }

  if (ahead > 0) {
    return { kind: "ahead", ahead, behind };
  }

  if (behind > 0) {
    return { kind: "behind", ahead, behind };
  }

  return { kind: "up-to-date", ahead, behind };
}

export function isPullUnnecessary(tracking) {
  return ["ahead", "up-to-date"].includes(tracking?.kind);
}

export function getPushGuidance(status) {
  if (status.kind === "no-upstream") {
    return {
      allowed: false,
      message: "현재 브랜치에 연결된 원격 브랜치(Upstream)가 없습니다. Git은 어디로 Push해야 하는지 확실히 판단할 수 없어서 Git Next가 작업을 멈췄습니다. 먼저 Remote와 Upstream을 연결한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "behind") {
    return {
      allowed: false,
      message: "원격 브랜치에 아직 내 로컬에 없는 새 커밋이 있습니다. 이 상태에서 바로 Push하면 기준이 달라 Push가 거절되고, 강제 Push를 사용하면 다른 사람의 변경을 덮어쓸 수도 있습니다. 먼저 받기(Pull) 또는 Branch 비교로 원격 변경을 확인한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "diverged") {
    return {
      allowed: false,
      message: "내 로컬과 원격 양쪽에 서로 다른 새 커밋이 생겨 기록이 갈라졌습니다(Diverged). 어느 한쪽을 바로 덮으면 다른 변경을 잃을 수 있어서 Push를 중단했습니다. Branch 비교에서 차이를 확인하고 Merge 또는 Rebase로 기록을 정리한 뒤 다시 Push하세요.",
    };
  }

  if (status.kind === "unknown") {
    return {
      allowed: false,
      message: "현재 로컬과 원격의 관계를 신뢰할 수 있게 확인하지 못했습니다. 상태를 모른 채 Push하면 예상하지 못한 기록 변경이 생길 수 있어서 작업을 중단했습니다. 새로고침하거나 Git 상세 정보를 확인한 뒤 다시 시도하세요.",
    };
  }

  return {
    allowed: true,
    message:
      status.kind === "ahead"
        ? `원격에 보낼 로컬 커밋이 ${status.ahead}개 있습니다.`
        : "로컬과 원격이 같은 상태입니다.",
  };
}

export async function runGitInspection(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  return stdout.trim();
}

export async function getTrackingStatus(cwd) {
  let upstream;

  try {
    upstream = await runGitInspection(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
  } catch {
    return {
      kind: "no-upstream",
      ahead: 0,
      behind: 0,
      upstream: null,
    };
  }

  try {
    const raw = await runGitInspection(cwd, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{u}",
    ]);
    const [aheadRaw = "0", behindRaw = "0"] = raw.split(/\s+/);
    const status = classifyTrackingStatus(Number(aheadRaw), Number(behindRaw));

    return {
      ...status,
      upstream,
    };
  } catch {
    return {
      kind: "unknown",
      ahead: 0,
      behind: 0,
      upstream,
    };
  }
}

export async function inspectCurrentUpstream(cwd) {
  let branch;
  let remote;
  let mergeRef;
  try {
    branch = await runGitInspection(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return { kind: "detached", upstream: null };
  }

  try {
    remote = await runGitInspection(cwd, ["config", "--get", `branch.${branch}.remote`]);
    mergeRef = await runGitInspection(cwd, ["config", "--get", `branch.${branch}.merge`]);
  } catch {
    return { kind: "no-upstream", branch, upstream: null };
  }

  const remoteBranch = mergeRef.replace(/^refs\/heads\//, "");
  const upstream = `${remote}/${remoteBranch}`;
  try {
    await runGitInspection(cwd, ["remote", "get-url", remote]);
  } catch {
    return { kind: "remote-missing", branch, upstream, remote };
  }

  let remoteTip;
  try {
    remoteTip = await runGitInspection(cwd, ["ls-remote", "--heads", remote, `refs/heads/${remoteBranch}`]);
  } catch {
    return { kind: "unknown", branch, upstream, remote };
  }
  if (!remoteTip) return { kind: "remote-branch-missing", branch, upstream, remote };

  let trackingRefExists = true;
  try {
    await runGitInspection(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${remoteBranch}`]);
  } catch {
    trackingRefExists = false;
  }

  return {
    kind: trackingRefExists ? "healthy" : "tracking-ref-missing",
    branch,
    upstream,
    remote,
  };
}

export function parseMergeTreeConflictOutput(output) {
  const text = String(output ?? "");
  const files = [...text.matchAll(/CONFLICT \([^)]*\): .*? in (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  return [...new Set(files)];
}

export async function getHeadSafety(cwd) {
  try {
    const branch = await runGitInspection(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return { detached: false, branch };
  } catch {
    return { detached: true, branch: null };
  }
}

export async function getWorkingTreeChanges(cwd) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  const output = stdout.replace(/\r?\n$/, "");
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
    }));
}
