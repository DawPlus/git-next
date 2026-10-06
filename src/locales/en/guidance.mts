export const guidance = {
  labels: {
    state: "State: {value}",
    risk: "Risk: {value}",
    next: "Next: {value}",
    stateFallback: "Cannot verify current state.",
    riskFallback: "Cannot read detected risk info.",
    nextFallback: "Please verify current repository state.",
  },
  nextAction: {
    operation: {
      title: "Please finish {operation} operation first.",
      detail: "Resolve current operation with Continue or Abort before next Git action.",
    },
    remoteMissing: {
      title: "Connected remote branch appears to be gone.",
      detail: "Checking branch status first without automatically recreating {upstream}.",
      fallbackUpstream: "remote branch",
    },
    refreshStale: {
      title: "Remote has new changes. Please refresh status.",
      detail: "Refresh remote info via Fetch/Refresh before recalculating Pull/Push status.",
    },
    refreshMissing: {
      title: "Remote tracking info is outdated.",
      detail: "Refresh remote info via Fetch/Refresh before recalculating Pull/Push status.",
    },
    unknown: {
      title: "Cannot verify remote status.",
      detail: "Check connection or network, then refresh again.",
      detailRemote: "Check remote connection and refresh.",
    },
    pullBlockedDirty: {
      title: "Please resolve {count} overlapping local changes before Pull.",
      detail: "{preview} · Commit or Stash before pulling.",
      moreCount: " and {count} more",
    },
    diverged: {
      title: "Local and remote have divergent commits. Start by pulling {behind} commits.",
      detail: "{behind} incoming commit(s) · {ahead} outgoing commit(s) · Git Next will guide if merge is needed.",
    },
    behind: {
      titleWithChanges: "Please Pull before committing.",
      titleNoChanges: "Remote has new commits. Please Pull first.",
      detail: "Remote is ahead by {behind} commit(s).",
    },
    pushDirty: {
      title: "Unpushed commits exist. Please check new changes as well.",
      detail: "{ahead} pending push · {changes} current change(s)",
    },
    push: {
      title: "Commit complete! You have {ahead} unpushed commit(s).",
      detail: "Ready to push.",
    },
    noUpstreamDirty: {
      title: "Please commit changes.",
      detail: "You can link remote branch during first push.",
    },
    firstPush: {
      title: "Not connected to remote yet. First push required.",
      detail: "Pushing will connect current branch to remote.",
    },
    dirty: {
      title: "Please review and commit changes.",
      detail: "Uncommitted changes remain.",
    },
    clean: {
      title: "Local and remote are up to date.",
      detail: "No additional Git actions needed at this time.",
    },
  },
  doctor: {
    operation: {
      state: "{operation} in progress",
      risk: "Running other Git actions before finishing may complicate state.",
      recommendation: "Check conflicted files and Continue/Abort options.",
    },
    detachedHead: {
      state: "Viewing commit not on any branch",
      risk: "New commits made here may be hard to find later.",
      recommendation: "Create a new branch to keep work, or return to an existing branch.",
    },
    noUpstream: {
      state: "No connected remote branch",
      risk: "Cannot determine remote branch to pull from or push to.",
      recommendation: "Connect current branch to remote during first push.",
    },
    trackingUnknown: {
      state: "Cannot determine remote tracking state",
      risk: "Cannot determine whether local or remote is ahead.",
      recommendation: "Check remote repository connection and refresh.",
    },
    diverged: {
      state: "Local ahead by {ahead} · remote ahead by {behind}",
      risk: "Histories have diverged and cannot be directly synced.",
      recommendation: "Review commits on both sides in Branch Compare.",
    },
    behind: {
      state: "Remote ahead by {behind} commit(s)",
      risk: "Remote has changes not yet in local.",
      recommendation: "Check changed files and potential conflicts before pulling.",
    },
    ahead: {
      state: "Local ahead by {ahead} commit(s)",
      risk: "Current commits not yet shared to remote.",
      recommendation: "Review commits to push and Push.",
    },
    upstreamGone: {
      state: "Connected remote branch not found · {upstream}",
      risk: "Remote branch may be deleted. Local branch remains.",
      recommendation: "Check branch cleanup candidates. Local branches are not deleted automatically.",
    },
    trackingRefMissing: {
      state: "Remote tracking ref outdated or missing · {upstream}",
      risk: "Even if remote branch exists, local tracking info may be outdated.",
      recommendation: "Run Fetch in Remote Manager to refresh latest status.",
    },
    trackingRefStale: {
      state: "Remote has un-fetched new changes · {upstream}",
      risk: "Pull/Push counts may be based on stale remote tracking info.",
      recommendation: "Refresh remote info with Fetch, then check Pull/Push status.",
    },
    upstreamRemoteMissing: {
      state: "Configured remote '{remote}' not found",
      risk: "Remote repository config may be deleted or renamed.",
      recommendation: "Check remote repository settings or add it again.",
    },
    upstreamUnverified: {
      state: "Cannot verify connected remote branch status · {upstream}",
      risk: "Cannot verify whether branch exists due to remote connection issue.",
      recommendation: "Check remote connection and run Fetch again.",
    },
    dirty: {
      state: "{count} uncommitted change(s)",
      risk: "Local changes may be lost during switch or recovery operations.",
      recommendation: "Review changes in Source Control and Commit or Stash.",
    },
    remoteRewrite: {
      state: "Remote history may have been rewritten",
      risk: "Remote commits differ from previously observed history.",
      recommendation: "Stop push and review remote history in Compare.",
    },
    healthy: {
      state: "Healthy · {branch}",
      risk: "No detected risks.",
      recommendation: "You can proceed with current Git operations.",
      currentBranchFallback: "current branch",
    },
  },
  retry: {
    dirtyWorkingTree: "Check whether local changes are committed or stashed.",
    noUpstream: "Verify current branch is linked to target remote branch for push.",
    diverged: "Compare incoming remote commits with local commits.",
    operationInProgress: "Continue or abort in-progress Merge/Rebase operation.",
    pull: "Verify working folder and in-progress Git operations before pulling.",
    push: "Check differences between current branch and remote branch before pushing.",
    commit: "Check staged files and commit message again.",
    stashPush: "Check files to stash and stash note again.",
    default: "Check current repository status before retrying action.",
  },
  undo: {
    recoveryLabel: "Create branch from recovery point",
    recoveryReason: "Pre-operation commit is preserved; you can safely restore original state.",
    pushLabel: "Create Revert commit",
    pushReason: "For shared changes, creating an inverse commit is safer than rewriting history.",
    commitLabel: "Undo last local commit",
    commitReason: "For unpushed commits, you can undo commit while keeping file changes.",
    pullLabel: "Create recovery branch from pre-pull position",
    pullReason: "Preserving pre-pull commit as a new branch allows returning if needed.",
    switchBranchLabel: "Create recovery branch from pre-switch position",
    switchBranchReason: "Preserving pre-switch commit as a new branch allows finding it later.",
    deleteBranchLabel: "Restore deleted branch",
    deleteBranchReason: "Find last commit of deleted branch and preserve as a new branch.",
  },
};
