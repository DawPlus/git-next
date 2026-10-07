import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { formatStateRiskNext } from "./git-guidance.mjs";
import type { TrackingStatus, WorkingTreeChange } from "./git-types.mjs";
import { traceAsync } from "./perf-trace.js";

const execFileAsync = promisify(execFile);

export function classifyTrackingStatus(ahead: number, behind: number): TrackingStatus {
  if (ahead > 0 && behind > 0) return { kind: "diverged", ahead, behind };
  if (ahead > 0) return { kind: "ahead", ahead, behind };
  if (behind > 0) return { kind: "behind", ahead, behind };
  return { kind: "up-to-date", ahead, behind };
}

export function isPullUnnecessary(tracking: Pick<TrackingStatus, "kind"> | null | undefined): boolean {
  return tracking?.kind === "ahead" || tracking?.kind === "up-to-date";
}

export interface PushGuidance {
  allowed: boolean;
  state: string;
  risk: string;
  next: string;
  message: string;
}

export function getPushGuidance(status: TrackingStatus): PushGuidance {
  const result = (allowed: boolean, state: string, risk: string, next: string): PushGuidance => ({
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

async function runGitInspectionRaw(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

export async function runGitInspection(cwd: string, args: string[]): Promise<string> {
  return traceAsync(`git:${args[0] ?? "unknown"}`, cwd, () => runGitInspectionRaw(cwd, args));
}

export async function refreshRemoteState(cwd: string) {
  try {
    const remotes = (await runGitInspection(cwd, ["remote"]))
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!remotes.length) return { ok: true, skipped: true, detail: "등록된 Remote가 없습니다." };
    await runGitInspection(cwd, ["fetch", "--prune", "--all"]);
    await markCurrentUpstreamFreshFromTracking(cwd);
    return { ok: true, skipped: false, detail: "원격 상태를 갱신했습니다." };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      detail: String(error?.stderr ?? error?.message ?? error ?? ""),
    };
  }
}

export async function getTrackingStatus(cwd: string): Promise<TrackingStatus> {
  let upstream: string;

  try {
    upstream = await runGitInspection(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
  } catch {
    return { kind: "no-upstream", ahead: 0, behind: 0, upstream: null };
  }

  try {
    const raw = await runGitInspection(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    const [aheadRaw = "0", behindRaw = "0"] = raw.split(/\s+/);
    return {
      ...classifyTrackingStatus(Number(aheadRaw), Number(behindRaw)),
      upstream,
    };
  } catch {
    return { kind: "unknown", ahead: 0, behind: 0, upstream };
  }
}

export type UpstreamInspection =
  | { kind: "detached"; upstream: null }
  | { kind: "no-upstream"; branch: string; upstream: null }
  | { kind: "remote-missing" | "unknown" | "remote-branch-missing" | "healthy" | "tracking-ref-missing" | "tracking-ref-stale"; branch: string; upstream: string; remote: string };

async function inspectCurrentUpstreamFresh(cwd: string): Promise<UpstreamInspection> {
  let branch: string;
  let remote: string;
  let mergeRef: string;
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

  let remoteTip: string;
  try {
    remoteTip = await runGitInspection(cwd, ["ls-remote", "--heads", remote, `refs/heads/${remoteBranch}`]);
  } catch {
    return { kind: "unknown", branch, upstream, remote };
  }
  if (!remoteTip) return { kind: "remote-branch-missing", branch, upstream, remote };

  let trackingTip: string;
  try {
    trackingTip = await runGitInspection(cwd, ["rev-parse", `refs/remotes/${remote}/${remoteBranch}`]);
  } catch {
    return { kind: "tracking-ref-missing", branch, upstream, remote };
  }

  const remoteHash = remoteTip.split(/\s+/)[0] ?? "";
  return {
    kind: remoteHash && trackingTip !== remoteHash ? "tracking-ref-stale" : "healthy",
    branch,
    upstream,
    remote,
  };
}

type RemoteFreshnessEntry = {
  inspection: UpstreamInspection;
  updatedAt: number;
};

const remoteFreshnessCache = new Map<string, RemoteFreshnessEntry>();
const remoteFreshnessInFlight = new Map<string, Promise<UpstreamInspection>>();
const DEFAULT_REMOTE_FRESHNESS_MS = 30_000;

function remoteFreshnessKey(cwd: string): string {
  return cwd;
}

async function inspectCurrentUpstreamLocal(cwd: string, useCache = true): Promise<UpstreamInspection> {
  let branch: string;
  let remote: string;
  let mergeRef: string;

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

  try {
    await runGitInspection(cwd, ["rev-parse", `refs/remotes/${remote}/${remoteBranch}`]);
  } catch {
    return { kind: "tracking-ref-missing", branch, upstream, remote };
  }

  if (!useCache) return { kind: "unknown", branch, upstream, remote };

  const cached = remoteFreshnessCache.get(remoteFreshnessKey(cwd));
  if (!cached) return { kind: "unknown", branch, upstream, remote };

  if ("remote" in cached.inspection && cached.inspection.upstream === upstream) {
    return { ...cached.inspection, branch, upstream, remote };
  }
  return { kind: "unknown", branch, upstream, remote };
}

export async function inspectCurrentUpstream(cwd: string): Promise<UpstreamInspection> {
  return inspectCurrentUpstreamLocal(cwd);
}

export async function markCurrentUpstreamFreshFromTracking(
  cwd: string,
  refreshedRemote?: string,
): Promise<UpstreamInspection> {
  const local = await inspectCurrentUpstreamLocal(cwd, false);
  if ("remote" in local && refreshedRemote && local.remote !== refreshedRemote) {
    return inspectCurrentUpstreamLocal(cwd);
  }

  const inspection = local.kind === "unknown"
    ? { ...local, kind: "healthy" as const }
    : local;

  remoteFreshnessCache.set(remoteFreshnessKey(cwd), {
    inspection,
    updatedAt: Date.now(),
  });
  return inspection;
}

export async function refreshCurrentUpstreamState(
  cwd: string,
  { force = false, maxAgeMs = DEFAULT_REMOTE_FRESHNESS_MS }: { force?: boolean; maxAgeMs?: number } = {},
): Promise<UpstreamInspection> {
  const key = remoteFreshnessKey(cwd);
  const cached = remoteFreshnessCache.get(key);

  if (!force && cached && Date.now() - cached.updatedAt < maxAgeMs) {
    return cached.inspection;
  }

  const existing = remoteFreshnessInFlight.get(key);
  if (existing) return existing;

  const pending = inspectCurrentUpstreamFresh(cwd)
    .then((inspection) => {
      remoteFreshnessCache.set(key, { inspection, updatedAt: Date.now() });
      return inspection;
    })
    .finally(() => {
      if (remoteFreshnessInFlight.get(key) === pending) remoteFreshnessInFlight.delete(key);
    });

  remoteFreshnessInFlight.set(key, pending);
  return pending;
}

export function clearRemoteFreshnessCache(cwd?: string): void {
  if (cwd) {
    remoteFreshnessCache.delete(remoteFreshnessKey(cwd));
    return;
  }
  remoteFreshnessCache.clear();
}

export function parseMergeTreeConflictOutput(output: unknown): string[] {
  const text = String(output ?? "");
  const files = [...text.matchAll(/CONFLICT \([^)]*\): .*? in (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return [...new Set(files)];
}

export interface HeadSafety {
  detached: boolean;
  branch: string | null;
}

export async function getHeadSafety(cwd: string): Promise<HeadSafety> {
  try {
    const branch = await runGitInspection(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return { detached: false, branch };
  } catch {
    return { detached: true, branch: null };
  }
}

export async function getIncomingChangedFiles(cwd: string): Promise<string[]> {
  try {
    const raw = await runGitInspection(cwd, ["diff", "--name-only", "HEAD..@{u}"]);
    return raw ? raw.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function getWorkingTreeChanges(cwd: string): Promise<WorkingTreeChange[]> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  const output = stdout.replace(/\r?\n$/, "");
  if (!output) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
    }));
}
