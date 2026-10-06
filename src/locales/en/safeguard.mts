export const safeguard = {
  safe: "Safe",
  warning: "Warning",
  blocked: "Blocked",
  idle: "Idle",
  status: "Status",
  passed: "Passed safety checks.",
  rules: {
    dirtyIncomingOverlap: {
      title: "Block overlapping local changes before Pull",
      purpose: "Warns if locally modified files overlap with incoming remote files.",
      risk: "Relaxing this may cause merge conflicts or halt the pull.",
    },
    noUpstream: {
      title: "Halt operations without remote tracking",
      purpose: "Halts execution if pull/push target branch is not set.",
      risk: "Cannot relax because valid target branch cannot be determined.",
    },
    remoteHistoryRewritten: {
      title: "Detect remote history rewrite",
      purpose: "Alerts to potential overwriting if remote commit history was altered.",
      risk: "Cannot relax in session because shared commits may be lost.",
    },
    protectedBranch: {
      title: "Warn risky actions on protected branches",
      purpose: "Adds protection against force push, delete, or hard reset on protected branches like main/master/release.",
      risk: "Cannot relax in session because default shared branch could be overwritten or deleted.",
    },
  },
};
