export const dialog = {
  confirmMutation: {
    actionLabel: "Action: {action}",
    targetLabel: "Target: {target}",
    effectLabel: "Effect: {effect}",
    riskLabel: "Caution: {risk}",
    worktreeContext: "{count} other worktree(s): {details}",
    safeguardLabel: "Safe Guard: {status}",
    safe: "Verified",
    warning: "Warning",
    blocked: "Blocked",
    defaultConfirmLabel: "Execute",
    detachedHead: "detached HEAD",
  },
  safeguard: {
    relaxPrompt: "Relax {title} until Git Next closes?\nPurpose: {purpose}\nRisk: {risk}",
    relaxConfirmLabel: "Relax for Session",
    cannotRelax: "{title} is a critical safety rule and cannot be relaxed. {risk}",
    dirtyIncomingOverlapWarning: "Relaxed check: Local changes overlap with incoming Pull files. Conflicts or halt may occur during Pull.",
    continuePullButton: "Continue Pull",
    dirtyIncomingOverlapBlocked: "Pull was not executed.\n\nLocal modified files overlap with incoming remote files. Pulling now may halt operations or cause conflicts.\n\nPlease Commit or Stash your current work before pulling again.{overlappingFiles}",
    overlappingFilesLabel: "\n\nOverlapping files: {files}",
  },
};
