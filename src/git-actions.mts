import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { t } from "./i18n.mjs";

const execFileAsync = promisify(execFile);

export function explainGitError(action, detail) {
  const text = String(detail ?? "");

  if (/non-fast-forward|rejected/i.test(text)) {
    return t("actions.explain.nonFastForward");
  }

  if (/no tracking information|no upstream branch|set-upstream/i.test(text)) {
    return t("actions.explain.noTracking");
  }

  if (/not a git repository/i.test(text)) {
    return t("actions.explain.notGitRepo");
  }

  if (/conflict|automatic merge failed|unmerged/i.test(text)) {
    return t("actions.explain.conflict");
  }

  if (action === "pull" && /fast-forward|diverg/i.test(text)) {
    return t("actions.explain.diverged");
  }

  return action === "pull"
    ? t("actions.explain.pullFailed")
    : t("actions.explain.pushFailed");
}

async function run(cwd, args) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    });

    return {
      ok: true,
      detail: [stdout, stderr].filter(Boolean).join("\n").trim(),
    };
  } catch (error) {
    const detail = [error?.stdout, error?.stderr, error?.message]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      ok: false,
      detail,
    };
  }
}

function isSafePositionalValue(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 240
    && !value.startsWith("-")
    && !/[\u0000-\u001f\u007f\s]/.test(value);
}

export function isSafeStashRef(ref) {
  return /^stash@\{\d+\}$/.test(ref ?? "");
}

export async function validateCommitish(cwd, value) {
  if (!isSafePositionalValue(value)) {
    return { ok: false, message: t("actions.commitish.unsafe") };
  }
  const result = await run(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${value}^{commit}`]);
  return result.ok
    ? { ok: true, value, commit: result.detail }
    : { ok: false, message: t("actions.commitish.notFound"), detail: result.detail };
}

export async function pullRepository(cwd) {
  const result = await run(cwd, ["pull", "--no-rebase", "--no-edit"]);
  return {
    ...result,
    action: "pull",
    message: result.ok
      ? t("actions.pull.success")
      : explainGitError("pull", result.detail),
  };
}

async function getUpstreamPushArgs(cwd) {
  const branch = await run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok) return null;
  const [remote, mergeRef] = await Promise.all([
    run(cwd, ["config", "--get", `branch.${branch.detail}.remote`]),
    run(cwd, ["config", "--get", `branch.${branch.detail}.merge`]),
  ]);
  if (!remote.ok || !mergeRef.ok || remote.detail === "." || !mergeRef.detail.startsWith("refs/heads/")) return null;
  return ["push", "--", remote.detail, `HEAD:${mergeRef.detail}`];
}

export async function pushRepository(cwd) {
  const result = await run(cwd, await getUpstreamPushArgs(cwd) ?? ["push"]);
  return {
    ...result,
    action: "push",
    message: result.ok ? t("actions.push.success") : explainGitError("push", result.detail),
  };
}

export async function pushWithForceWithLease(cwd, remote, remoteRef, expected) {
  if (!/^refs\/heads\//.test(remoteRef) || !/^[0-9a-f]{40,64}$/i.test(expected)) {
    return { ok: false, action: "force-push", code: "invalid-lease", message: t("actions.push.invalidLease") };
  }
  const result = await run(cwd, ["push", `--force-with-lease=${remoteRef}:${expected}`, remote, `HEAD:${remoteRef}`]);
  const stale = /stale info|remote ref updated since checkout/i.test(result.detail);
  return {
    ...result,
    action: "force-push",
    code: stale ? "lease-mismatch" : result.ok ? null : "push-failed",
    message: result.ok
      ? t("actions.push.forceWithLeaseSuccess", { commit: expected.slice(0, 8) })
      : stale
        ? t("actions.push.leaseMismatch")
        : explainGitError("push", result.detail),
  };
}

export async function pushWithUpstream(cwd, remote, branch) {
  const result = await run(cwd, ["push", "--set-upstream", remote, branch]);
  return {
    ...result,
    action: "push",
    message: result.ok
      ? t("actions.push.pushWithUpstreamSuccess", { remote, branch })
      : /no tracking information|no upstream branch|set-upstream/i.test(result.detail)
        ? t("actions.push.pushWithUpstreamFailed")
        : explainGitError("push", result.detail),
  };
}

export async function fetchPruneRemote(cwd, remote) {
  const result = await run(cwd, ["fetch", "--prune", remote]);
  return {
    ...result,
    action: "fetch-prune",
    message: result.ok
      ? t("actions.fetchPrune.success", { remote })
      : t("actions.fetchPrune.failed"),
  };
}

export async function validateBranchName(cwd, name) {
  if (!name?.trim()) {
    return { ok: false, message: t("actions.branch.enterName") };
  }

  const result = await run(cwd, ["check-ref-format", "--branch", name.trim()]);
  return result.ok
    ? { ok: true, name: name.trim() }
    : { ok: false, message: t("actions.branch.invalidName"), detail: result.detail };
}

export async function validateTagName(cwd, name) {
  if (!name?.trim()) {
    return { ok: false, message: t("actions.tag.enterName") };
  }

  const clean = name.trim();
  const result = await run(cwd, ["check-ref-format", `refs/tags/${clean}`]);
  return result.ok
    ? { ok: true, name: clean }
    : { ok: false, message: t("actions.tag.invalidName"), detail: result.detail };
}

export async function createTag(cwd, name, target = "HEAD") {
  const nameCheck = await validateTagName(cwd, name);
  const targetCheck = await validateCommitish(cwd, target);
  if (!nameCheck.ok || !targetCheck.ok) {
    return { ok: false, action: "create-tag", message: nameCheck.message ?? targetCheck.message };
  }
  const result = await run(cwd, ["tag", "--", nameCheck.name, target]);
  return {
    ...result,
    action: "create-tag",
    message: result.ok
      ? t("actions.tag.createSuccess", { name, target })
      : t("actions.tag.createFailed"),
  };
}

export async function deleteTag(cwd, name) {
  const check = await validateTagName(cwd, name);
  if (!check.ok) return { ok: false, action: "delete-tag", message: check.message };
  const result = await run(cwd, ["tag", "-d", "--", check.name]);
  return {
    ...result,
    action: "delete-tag",
    message: result.ok
      ? t("actions.tag.deleteSuccess", { name })
      : t("actions.tag.deleteFailed"),
  };
}

export async function createBranch(cwd, name, target = "HEAD") {
  const nameCheck = await validateBranchName(cwd, name);
  const targetCheck = await validateCommitish(cwd, target);
  if (!nameCheck.ok || !targetCheck.ok) {
    return { ok: false, action: "create-branch", message: nameCheck.message ?? targetCheck.message };
  }
  const result = await run(cwd, ["branch", "--", nameCheck.name, target]);
  return {
    ...result,
    action: "create-branch",
    message: result.ok
      ? t("actions.branch.createSuccess", { name })
      : t("actions.branch.createFailed"),
  };
}

export async function checkoutBranch(cwd, name) {
  const check = await validateBranchName(cwd, name);
  if (!check.ok) return { ok: false, action: "switch-branch", message: check.message };
  const result = await run(cwd, ["switch", "--", check.name]);
  return {
    ...result,
    action: "switch-branch",
    message: result.ok
      ? t("actions.branch.checkoutSuccess", { name })
      : t("actions.branch.checkoutFailed"),
  };
}

export async function createTrackingBranch(cwd, localName, remoteRef) {
  const localCheck = await validateBranchName(cwd, localName);
  const remoteCheck = await validateCommitish(cwd, remoteRef);
  if (!localCheck.ok || !remoteCheck.ok) {
    return { ok: false, action: "create-tracking-branch", message: localCheck.message ?? remoteCheck.message };
  }
  const result = await run(cwd, ["switch", "-c", localCheck.name, "--track", "--", remoteRef]);
  return {
    ...result,
    action: "create-tracking-branch",
    message: result.ok
      ? t("actions.branch.createTrackingSuccess", { name: localName, remoteRef })
      : t("actions.branch.createTrackingFailed"),
  };
}

export async function renameBranch(cwd, oldName, newName) {
  const [oldCheck, newCheck] = await Promise.all([
    validateBranchName(cwd, oldName),
    validateBranchName(cwd, newName),
  ]);
  if (!oldCheck.ok || !newCheck.ok) {
    return { ok: false, action: "rename-branch", message: oldCheck.message ?? newCheck.message };
  }
  const result = await run(cwd, ["branch", "-m", "--", oldCheck.name, newCheck.name]);
  return {
    ...result,
    action: "rename-branch",
    message: result.ok
      ? t("actions.branch.renameSuccess", { oldName, newName })
      : t("actions.branch.renameFailed"),
  };
}

export async function getBranchDeleteInfo(cwd, name) {
  const merged = await run(cwd, ["merge-base", "--is-ancestor", name, "HEAD"]);
  const count = await run(cwd, ["rev-list", "--count", `HEAD..${name}`]);

  return {
    merged: merged.ok,
    uniqueCommitCount: count.ok ? Number(count.detail || 0) : null,
  };
}

export async function getBranchCleanupCandidates(cwd, { now = Date.now(), staleAfterDays = 90 } = {}) {
  const [current, refs, merged] = await Promise.all([
    run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    run(cwd, ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)%09%(upstream:short)%09%(committerdate:unix)", "refs/heads"]),
    run(cwd, ["branch", "--merged", "HEAD", "--format=%(refname:short)"]),
  ]);
  if (!current.ok || !refs.ok || !merged.ok) {
    return { ok: false, candidates: [], message: t("actions.branch.cleanupCandidatesFailed") };
  }

  const currentName = current.detail.trim();
  const mergedNames = new Set(merged.detail.split("\n").filter(Boolean));
  const cutoff = Math.floor(now / 1000) - staleAfterDays * 86400;
  const candidates = [];
  for (const line of refs.detail.split("\n").filter(Boolean)) {
    const [name, tracking = "", upstream = "", committed = ""] = line.split("\t");
    if (!name || name === currentName) continue;
    const isMerged = mergedNames.has(name);
    const isGone = tracking.includes("[gone]");
    const timestamp = Number(committed);
    const isStale = Number.isFinite(timestamp) && timestamp > 0 && timestamp < cutoff;
    if (!isMerged && !isGone && !isStale) continue;
    const reasons = [];
    if (isMerged) reasons.push(t("actions.branch.reasonMerged"));
    if (isGone) reasons.push(upstream ? t("actions.branch.reasonGoneWithUpstream", { upstream }) : t("actions.branch.reasonGone"));
    if (isStale) reasons.push(t("actions.branch.reasonStale", { days: staleAfterDays }));
    candidates.push({ name, safe: isMerged, reasons, upstream: upstream || null, lastCommitAt: timestamp ? new Date(timestamp * 1000).toISOString() : null });
  }
  return { ok: true, currentBranch: currentName, candidates };
}

export async function deleteBranch(cwd, name, force = false) {
  const check = await validateBranchName(cwd, name);
  if (!check.ok) return { ok: false, action: "delete-branch", message: check.message };
  const result = await run(cwd, ["branch", force ? "-D" : "-d", "--", check.name]);
  return {
    ...result,
    action: "delete-branch",
    message: result.ok
      ? t("actions.branch.deleteSuccess", { name })
      : t("actions.branch.deleteFailed"),
  };
}

export async function listStashes(cwd) {
  const result = await run(cwd, ["stash", "list", "--format=%gd%x1f%gs%x1f%cr"]);
  if (!result.ok || !result.detail) {
    return [];
  }

  return result.detail
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, message = "", relative = ""] = line.split("\x1f");
      return { ref, message, relative };
    });
}

export async function stashPush(cwd, message) {
  const stashMessage = message ?? t("actions.stash.defaultMessage");
  const result = await run(cwd, ["stash", "push", "-u", "-m", stashMessage]);
  return {
    ...result,
    action: "stash-push",
    message: result.ok
      ? t("actions.stash.pushSuccess")
      : t("actions.stash.pushFailed"),
  };
}

export async function stashApply(cwd, ref) {
  if (!isSafeStashRef(ref)) return { ok: false, action: "stash-apply", message: t("actions.stash.invalidRef") };
  const result = await run(cwd, ["stash", "apply", "--", ref]);
  return {
    ...result,
    action: "stash-apply",
    message: result.ok
      ? t("actions.stash.applySuccess", { ref })
      : t("actions.stash.applyFailed"),
  };
}

export async function stashPop(cwd, ref) {
  if (!isSafeStashRef(ref)) return { ok: false, action: "stash-pop", message: t("actions.stash.invalidRef") };
  const result = await run(cwd, ["stash", "pop", "--", ref]);
  return {
    ...result,
    action: "stash-pop",
    message: result.ok
      ? t("actions.stash.popSuccess", { ref })
      : t("actions.stash.popFailed"),
  };
}

export async function stashDrop(cwd, ref) {
  if (!isSafeStashRef(ref)) return { ok: false, action: "stash-drop", message: t("actions.stash.invalidRef") };
  const result = await run(cwd, ["stash", "drop", "--", ref]);
  return {
    ...result,
    action: "stash-drop",
    message: result.ok
      ? t("actions.stash.dropSuccess", { ref })
      : t("actions.stash.dropFailed"),
  };
}

export async function cherryPickCommit(cwd, commit) {
  const check = await validateCommitish(cwd, commit);
  if (!check.ok) return { ok: false, action: "cherry-pick", message: check.message };
  const result = await run(cwd, ["cherry-pick", "--", commit]);
  return {
    ...result,
    action: "cherry-pick",
    message: result.ok
      ? t("actions.cherryPick.success", { commit: commit.slice(0, 7) })
      : t("actions.cherryPick.failed"),
  };
}

export async function revertCommit(cwd, commit) {
  const check = await validateCommitish(cwd, commit);
  if (!check.ok) return { ok: false, action: "revert", message: check.message };
  const result = await run(cwd, ["revert", "--no-edit", "--", commit]);
  return {
    ...result,
    action: "revert",
    message: result.ok
      ? t("actions.revert.success", { commit: commit.slice(0, 7) })
      : t("actions.revert.failed"),
  };
}
