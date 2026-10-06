import { t } from "./i18n.mjs";

export function recommendNextAction({ tracking, upstreamState = null, changes = [], incomingFiles = [], operation = null }: { tracking?: { kind?: string; ahead?: number; behind?: number } | null; upstreamState?: { kind?: string; upstream?: string | null; remote?: string | null } | null; changes?: Array<{ path?: string }>; incomingFiles?: string[]; operation?: { operation: string } | null } = {}) {
  if (operation) {
    return {
      kind: "operation",
      title: t("guidance.nextAction.operation.title", { operation: operation.operation }),
      detail: t("guidance.nextAction.operation.detail"),
    };
  }

  if (upstreamState?.kind === "remote-branch-missing") {
    return {
      kind: "remote-missing",
      title: t("guidance.nextAction.remoteMissing.title"),
      detail: t("guidance.nextAction.remoteMissing.detail", { upstream: upstreamState.upstream ?? t("guidance.nextAction.remoteMissing.fallbackUpstream") }),
    };
  }

  if (upstreamState?.kind === "tracking-ref-missing" || upstreamState?.kind === "tracking-ref-stale") {
    return {
      kind: "refresh",
      title: upstreamState.kind === "tracking-ref-stale"
        ? t("guidance.nextAction.refreshStale.title")
        : t("guidance.nextAction.refreshMissing.title"),
      detail: upstreamState.kind === "tracking-ref-stale"
        ? t("guidance.nextAction.refreshStale.detail")
        : t("guidance.nextAction.refreshMissing.detail"),
    };
  }

  if (upstreamState?.kind === "remote-missing" || upstreamState?.kind === "unknown") {
    return {
      kind: "unknown",
      title: t("guidance.nextAction.unknown.title"),
      detail: t("guidance.nextAction.unknown.detail"),
    };
  }

  const localPaths = new Set(changes.map((change) => change.path).filter(Boolean));
  const overlap = incomingFiles.filter((path) => localPaths.has(path));
  if ((tracking?.kind === "behind" || tracking?.kind === "diverged") && overlap.length) {
    const preview = `${overlap.slice(0, 3).join(", ")}${overlap.length > 3 ? t("guidance.nextAction.pullBlockedDirty.moreCount", { count: overlap.length - 3 }) : ""}`;
    return {
      kind: "pull-blocked-dirty",
      title: t("guidance.nextAction.pullBlockedDirty.title", { count: overlap.length }),
      detail: t("guidance.nextAction.pullBlockedDirty.detail", { preview }),
    };
  }

  if (tracking?.kind === "diverged") {
    return {
      kind: "pull",
      title: t("guidance.nextAction.diverged.title", { behind: tracking.behind ?? 0 }),
      detail: t("guidance.nextAction.diverged.detail", { behind: tracking.behind ?? 0, ahead: tracking.ahead ?? 0 }),
    };
  }

  if (tracking?.kind === "behind") {
    return {
      kind: "pull",
      title: changes.length
        ? t("guidance.nextAction.behind.titleWithChanges")
        : t("guidance.nextAction.behind.titleNoChanges"),
      detail: t("guidance.nextAction.behind.detail", { behind: tracking.behind }),
    };
  }

  if (tracking?.kind === "ahead") {
    return changes.length
      ? {
          kind: "push-dirty",
          title: t("guidance.nextAction.pushDirty.title"),
          detail: t("guidance.nextAction.pushDirty.detail", { ahead: tracking.ahead, changes: changes.length }),
        }
      : {
          kind: "push",
          title: t("guidance.nextAction.push.title", { ahead: tracking.ahead }),
          detail: t("guidance.nextAction.push.detail"),
        };
  }

  if (tracking?.kind === "no-upstream") {
    return changes.length
      ? {
          kind: "dirty",
          title: t("guidance.nextAction.noUpstreamDirty.title"),
          detail: t("guidance.nextAction.noUpstreamDirty.detail"),
        }
      : {
          kind: "first-push",
          title: t("guidance.nextAction.firstPush.title"),
          detail: t("guidance.nextAction.firstPush.detail"),
        };
  }

  if (tracking?.kind === "unknown") {
    return {
      kind: "unknown",
      title: t("guidance.nextAction.unknown.title"),
      detail: t("guidance.nextAction.unknown.detailRemote"),
    };
  }

  if (changes.length) {
    return {
      kind: "dirty",
      title: t("guidance.nextAction.dirty.title"),
      detail: t("guidance.nextAction.dirty.detail"),
    };
  }

  return {
    kind: "clean",
    title: t("guidance.nextAction.clean.title"),
    detail: t("guidance.nextAction.clean.detail"),
  };
}

export function getGitDoctorFindings({ head, tracking, upstreamState = null, changes = [], operation = null, remoteRewrite = null }: { head?: { detached?: boolean; branch?: string | null } | null; tracking?: { kind?: string; ahead?: number; behind?: number } | null; upstreamState?: { kind?: string; upstream?: string | null; remote?: string | null } | null; changes?: Array<{ path?: string }>; operation?: { operation: string } | null; remoteRewrite?: { rewritten?: boolean } | null } = {}) {
  const findings = [];
  const add = (finding) => findings.push(finding);

  if (operation) {
    add({
      id: "operation",
      state: t("guidance.doctor.operation.state", { operation: operation.operation }),
      risk: t("guidance.doctor.operation.risk"),
      recommendation: t("guidance.doctor.operation.recommendation"),
      action: "conflict",
    });
  }
  if (head?.detached) {
    add({
      id: "detached-head",
      state: t("guidance.doctor.detachedHead.state"),
      risk: t("guidance.doctor.detachedHead.risk"),
      recommendation: t("guidance.doctor.detachedHead.recommendation"),
      action: "branch",
      guideKey: "detached-head",
    });
  }

  const fallbackBranch = t("guidance.doctor.healthy.currentBranchFallback");

  const trackingFindings = {
    "no-upstream": {
      id: "no-upstream",
      state: t("guidance.doctor.noUpstream.state"),
      risk: t("guidance.doctor.noUpstream.risk"),
      recommendation: t("guidance.doctor.noUpstream.recommendation"),
      action: "remote",
      guideKey: "no-upstream",
    },
    unknown: {
      id: "tracking-unknown",
      state: t("guidance.doctor.trackingUnknown.state"),
      risk: t("guidance.doctor.trackingUnknown.risk"),
      recommendation: t("guidance.doctor.trackingUnknown.recommendation"),
      action: "refresh",
    },
    diverged: {
      id: "diverged",
      state: t("guidance.doctor.diverged.state", { ahead: tracking?.ahead, behind: tracking?.behind }),
      risk: t("guidance.doctor.diverged.risk"),
      recommendation: t("guidance.doctor.diverged.recommendation"),
      action: "compare",
      guideKey: "diverged",
    },
    behind: {
      id: "behind",
      state: t("guidance.doctor.behind.state", { behind: tracking?.behind }),
      risk: t("guidance.doctor.behind.risk"),
      recommendation: t("guidance.doctor.behind.recommendation"),
      action: "pull",
    },
    ahead: {
      id: "ahead",
      state: t("guidance.doctor.ahead.state", { ahead: tracking?.ahead }),
      risk: t("guidance.doctor.ahead.risk"),
      recommendation: t("guidance.doctor.ahead.recommendation"),
      action: "push",
    },
  };
  const upstreamFindings = {
    "remote-branch-missing": {
      id: "upstream-gone",
      state: t("guidance.doctor.upstreamGone.state", { upstream: upstreamState?.upstream ?? fallbackBranch }),
      risk: t("guidance.doctor.upstreamGone.risk"),
      recommendation: t("guidance.doctor.upstreamGone.recommendation"),
      action: "branch",
    },
    "tracking-ref-missing": {
      id: "tracking-ref-missing",
      state: t("guidance.doctor.trackingRefMissing.state", { upstream: upstreamState?.upstream ?? fallbackBranch }),
      risk: t("guidance.doctor.trackingRefMissing.risk"),
      recommendation: t("guidance.doctor.trackingRefMissing.recommendation"),
      action: "fetch",
    },
    "tracking-ref-stale": {
      id: "tracking-ref-stale",
      state: t("guidance.doctor.trackingRefStale.state", { upstream: upstreamState?.upstream ?? fallbackBranch }),
      risk: t("guidance.doctor.trackingRefStale.risk"),
      recommendation: t("guidance.doctor.trackingRefStale.recommendation"),
      action: "fetch",
    },
    "remote-missing": {
      id: "upstream-remote-missing",
      state: t("guidance.doctor.upstreamRemoteMissing.state", { remote: upstreamState?.remote ?? "-" }),
      risk: t("guidance.doctor.upstreamRemoteMissing.risk"),
      recommendation: t("guidance.doctor.upstreamRemoteMissing.recommendation"),
      action: "remote",
    },
    unknown: {
      id: "upstream-unverified",
      state: t("guidance.doctor.upstreamUnverified.state", { upstream: upstreamState?.upstream ?? fallbackBranch }),
      risk: t("guidance.doctor.upstreamUnverified.risk"),
      recommendation: t("guidance.doctor.upstreamUnverified.recommendation"),
      action: "remote",
    },
  };
  if (upstreamFindings[upstreamState?.kind]) {
    add(upstreamFindings[upstreamState.kind]);
  } else if (trackingFindings[tracking?.kind]) {
    add(trackingFindings[tracking.kind]);
  }

  if (changes.length) {
    add({
      id: "dirty",
      state: t("guidance.doctor.dirty.state", { count: changes.length }),
      risk: t("guidance.doctor.dirty.risk"),
      recommendation: t("guidance.doctor.dirty.recommendation"),
      action: "scm",
    });
  }
  if (remoteRewrite?.rewritten) {
    add({
      id: "remote-rewrite",
      state: t("guidance.doctor.remoteRewrite.state"),
      risk: t("guidance.doctor.remoteRewrite.risk"),
      recommendation: t("guidance.doctor.remoteRewrite.recommendation"),
      action: "compare",
      guideKey: "remote-history-rewritten",
    });
  }

  if (!findings.length) {
    add({
      id: "healthy",
      state: t("guidance.doctor.healthy.state", { branch: head?.branch ?? fallbackBranch }),
      risk: t("guidance.doctor.healthy.risk"),
      recommendation: t("guidance.doctor.healthy.recommendation"),
      action: "refresh",
    });
  }
  return findings;
}

export function getRetryCheck(activity: { code?: string | null; action?: string | null } = {}) {
  const code = String(activity.code ?? "");
  if (/dirty-working-tree|dirty-incoming-overlap/.test(code)) return t("guidance.retry.dirtyWorkingTree");
  if (/no-upstream/.test(code)) return t("guidance.retry.noUpstream");
  if (/diverged|behind|non-fast-forward/.test(code)) return t("guidance.retry.diverged");
  if (/(?:merge|rebase|cherry-pick|revert|operation)-in-progress/.test(code)) return t("guidance.retry.operationInProgress");
  const checks: Record<string, string> = {
    pull: t("guidance.retry.pull"),
    push: t("guidance.retry.push"),
    commit: t("guidance.retry.commit"),
    "stash-push": t("guidance.retry.stashPush"),
  };
  return (activity.action && checks[activity.action]) ?? t("guidance.retry.default");
}

export function getUndoRecommendation(activity: { ok?: boolean; action?: string; recoveryPoint?: string | null } | null | undefined) {
  if (!activity?.ok) return null;
  if (activity.recoveryPoint) {
    return {
      id: "recovery",
      label: t("guidance.undo.recoveryLabel"),
      reason: t("guidance.undo.recoveryReason"),
      recoveryPoint: activity.recoveryPoint,
    };
  }

  const recommendations: Record<string, { id: string; label: string; reason: string }> = {
    push: {
      id: "pushed",
      label: t("guidance.undo.pushLabel"),
      reason: t("guidance.undo.pushReason"),
    },
    commit: {
      id: "commit",
      label: t("guidance.undo.commitLabel"),
      reason: t("guidance.undo.commitReason"),
    },
    pull: {
      id: "reflog",
      label: t("guidance.undo.pullLabel"),
      reason: t("guidance.undo.pullReason"),
    },
    "switch-branch": {
      id: "reflog",
      label: t("guidance.undo.switchBranchLabel"),
      reason: t("guidance.undo.switchBranchReason"),
    },
    "delete-branch": {
      id: "reflog",
      label: t("guidance.undo.deleteBranchLabel"),
      reason: t("guidance.undo.deleteBranchReason"),
    },
  };
  return (activity.action && recommendations[activity.action]) ?? null;
}
