import { execFile } from "node:child_process";

import { promisify } from "node:util";
import { formatStateRiskNext } from "./git-guidance.mjs";

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
  const result = (allowed, state, risk, next) => ({
    allowed,
    state,
    risk,
    next,
    message: formatStateRiskNext({ state, risk, next }),
  });

  if (status.kind === "no-upstream") {
    return result(
      false,
      "현재 브랜치에 연결된 원격 브랜치가 없습니다.",
      "어느 원격 브랜치로 Push할지 정할 수 없습니다.",
      "첫 Push에서 현재 브랜치를 원격 브랜치와 연결해주세요.",
    );
  }

  if (status.kind === "behind") {
    return result(
      false,
      `원격이 ${status.behind}개 커밋 앞서 있습니다.`,
      "바로 Push하면 거절될 수 있고 강제 Push는 다른 사람의 변경을 덮을 수 있습니다.",
      "먼저 받기(Pull) 또는 Branch 비교로 원격 변경을 확인하세요.",
    );
  }

  if (status.kind === "diverged") {
    return result(
      false,
      `로컬 ${status.ahead}개 · 원격 ${status.behind}개 커밋이 서로 갈라졌습니다.`,
      "어느 한쪽을 바로 덮으면 다른 변경을 잃을 수 있습니다.",
      "Branch 비교 후 Merge 또는 Rebase로 기록을 정리하세요.",
    );
  }

  if (status.kind === "unknown") {
    return result(
      false,
      "로컬과 원격의 관계를 확인할 수 없습니다.",
      "상태를 모른 채 Push하면 예상하지 못한 기록 변경이 생길 수 있습니다.",
      "새로고침하거나 Git 상세 정보를 확인한 뒤 다시 시도하세요.",
    );
  }

  return result(
    true,
    status.kind === "ahead"
      ? `원격에 보낼 로컬 커밋이 ${status.ahead}개 있습니다.`
      : "로컬과 원격이 같은 상태입니다.",
    "확인된 Push 차단 위험이 없습니다.",
    "보낼 커밋과 대상을 확인한 뒤 Push할 수 있습니다.",
  );
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
