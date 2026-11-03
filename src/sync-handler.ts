const vscode = require("vscode");
const { traceAsync } = require("./perf-trace.js");

function createSyncHandler(core) {
  const {
    getCwd,
    renderPanel,
    getGuideKey,
    confirmMutation,
    guardWorkingState,
    showResult,
    getState,
    refreshState,
    noteSoftFailure,
    isPullBeforePushEnabled,
    relaxedSafeGuardRules,
  } = core;

async function showSyncMovementPreview(action, preview) {
  const commits = preview.commits ?? [];
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `${action === "push" ? "Push" : "Pull"} 이동 미리보기 · 취소하면 건너뜁니다`,
    cancellable: true,
  }, async (progress, token) => {
    const visible = commits.slice(0, 6);
    const from = action === "push" ? "로컬" : "원격";
    const to = action === "push" ? "원격" : "로컬";
    if (!visible.length) {
      progress.report({ message: preview.summary });
      return;
    }
    for (const commit of visible) {
      if (token.isCancellationRequested) break;
      progress.report({
        increment: 100 / visible.length,
        message: `${from} ● ━▶ ${to} · ${commit.id.slice(0, 8)} ${commit.subject}`,
      });
    }
    if (!token.isCancellationRequested && commits.length > visible.length) {
      progress.report({ message: `외 ${commits.length - visible.length}개 커밋 · ${from} → ${to}` });
    }
  });
}

async function confirmImpactPreview(host, mode, options, cwd, action, beforeSnapshot = null) {
  const {
    getActionImpactPreview,
    buildSyncImpactSummary,
    formatSyncImpactSummary,
  } = await import("./git-workflows.mjs");
  const preview = await traceAsync(`sync:${action}-impact-preview`, cwd, () => getActionImpactPreview(cwd, action, { upstream: beforeSnapshot?.upstream }));
  const summary = buildSyncImpactSummary(preview);
  const detail = formatSyncImpactSummary(summary);
  await renderPanel(host, {
    ok: true,
    level: "safe",
    message: `${summary.label} 영향 요약 · ${summary.direction}`,
    detail,
  }, mode, options);
  await showSyncMovementPreview(action, preview);
  const { t } = await import("./i18n.mjs");
  return confirmMutation({
    action: summary.label,
    target: summary.direction,
    effect: detail,
    risk: summary.risk,
    confirmLabel: action === "pull" ? t("dialog.confirm.pullConfirmLabel") : t("dialog.confirm.pushConfirmLabel"),
  });
}

async function getProtectedBranchWarning(cwd, action) {
  const state = await getState(cwd);
  const { getProtectedBranchGuard } = await import("./git-safety.mjs");
  const patterns = vscode.workspace.getConfiguration("gitNext").get(
    "protectedBranches",
    ["main", "master", "release/*"],
  );
  return getProtectedBranchGuard(action, state.branch, patterns);
}

async function offerForceWithLease(host, mode, options, cwd, reason) {
  const safety = await (await import("./git-safety.mjs")).preflightPushSafety(cwd);
  if (safety.code === "remote-history-rewritten" || safety.code === "fetch-failed") {
    await renderPanel(host, {
      action: "push",
      code: safety.code,
      ok: false,
      level: "blocked",
      message: safety.message,
      detail: safety.detail,
      guideKey: await getGuideKey("push", safety),
    }, mode, options);
    return;
  }
  if (safety.code !== "behind" && safety.code !== "diverged") {
    if (safety.level === "safe") return runSyncAction(host, "push", mode, options);
    await renderPanel(host, { action: "push", code: safety.code, ok: false, level: safety.level, message: safety.message, detail: safety.detail }, mode, options);
    return;
  }

  const workflows = await import("./git-workflows.mjs");
  const preview = await workflows.getForceWithLeasePreview(cwd);
  if (!preview.ok) {
    await renderPanel(host, { action: "push", code: preview.code, ok: false, level: "blocked", message: preview.message, detail: preview.detail }, mode, options);
    return;
  }
  const { t } = await import("./i18n.mjs");
  const protectedGuard = await getProtectedBranchWarning(cwd, "force-push");
  const pullLabel = t("dialog.confirm.pullConfirmLabel");
  const forceLabel = protectedGuard.protected
    ? t("dialog.confirm.protectedForcePushConfirmLabel")
    : t("dialog.confirm.forcePushConfirmLabel");
  const confirm = await vscode.window.showWarningMessage(
    `${reason}\n\n${t("dialog.confirm.forcePushConfirm", {
      remote: preview.remote,
      branch: preview.branch,
      expected: preview.expected.slice(0, 12),
      protectedGuard: protectedGuard.protected ? `\n\n${protectedGuard.message}` : "",
    })}`,
    { modal: true },
    pullLabel,
    forceLabel,
  );
  if (confirm === pullLabel) {
    return runSyncAction(host, "pull", mode, options);
  }
  if (confirm !== forceLabel) return;
  const actions = await import("./git-actions.mjs");
  const result = await workflows.runWithGitStateDelta(cwd, () =>
    actions.pushWithForceWithLease(cwd, preview.remote, preview.remoteRef, preview.expected));
  await refreshState(cwd).catch(() => noteSoftFailure());
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
}

async function offerDivergedResolution(host, mode, options, cwd) {
  const workflows = await import("./git-workflows.mjs");
  const preview: any = await workflows.getDivergedIntegrationPreview(cwd);
  if (!preview.ok) {
    await renderPanel(host, { ok: false, level: "blocked", message: preview.message }, mode, options);
    return;
  }

  const { t } = await import("./i18n.mjs");
  const mergeWhy = t("guidance.divergedHint.mergeWhy");
  const selected = await vscode.window.showQuickPick([
    {
      label: "Merge로 합치기",
      description: "더 안전한 기본 선택",
      detail: `${mergeWhy} (${preview.incomingCommits.length}개 커밋 통합)`,
      strategy: "merge",
    },
    {
      label: "Rebase로 정리하기",
      description: "로컬 기록 재작성",
      detail: "원격 최신 커밋 위에 로컬 커밋을 다시 얹습니다. 로컬 커밋 이력을 다시 쓸 수 있어요.",
      strategy: "rebase",
    },
  ], {
    placeHolder: `${mergeWhy} · 갈라진 기록 정리 방식을 선택하세요.`,
  });
  if (!selected) return;

  const guard = await guardWorkingState(cwd, selected.strategy);
  if (!guard.ok) {
    await renderPanel(host, { ok: false, level: "blocked", message: guard.message, detail: guard.detail }, mode, options);
    return;
  }

  const protectedGuard = selected.strategy === "rebase"
    ? await getProtectedBranchWarning(cwd, "rebase")
    : { protected: false, message: "" };

  const baseRisk = preview.conflictRisk
    ? t("guidance.divergedHint.conflictPossible")
    : (selected.strategy === "merge" ? t("guidance.divergedHint.mergeEffect") : "Git 기록 구조가 변경됩니다.");

  const ok = await confirmMutation({
    action: selected.strategy === "merge"
      ? "Diverged Merge"
      : (protectedGuard.protected ? "보호 브랜치 Diverged Rebase" : "Diverged Rebase"),
    target: preview.target,
    effect: workflows.formatIntegrationPreview(preview, selected.strategy),
    risk: protectedGuard.protected ? `${baseRisk} ${protectedGuard.message}\n${mergeWhy}` : `${baseRisk}\n${mergeWhy}`,
    level: preview.conflictRisk || protectedGuard.protected ? "warning" : "safe",
    confirmLabel: selected.strategy === "merge" ? "Merge 실행" : (protectedGuard.protected ? "보호 브랜치 Rebase 실행" : "Rebase 실행"),
  });
  if (!ok) return;

  const result = await workflows.runWithGitStateDelta(cwd, () =>
    selected.strategy === "merge"
      ? workflows.mergeIntoCurrent(cwd, preview.target)
      : workflows.rebaseCurrentOnto(cwd, preview.target));
  await refreshState(cwd).catch(() => noteSoftFailure());
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
}

async function withNetworkProgress(title, action) {
  const traceLabel = /Push/i.test(title) ? "sync:push-network" : /Pull/i.test(title) ? "sync:pull-network" : /Fetch/i.test(title) ? "sync:fetch-network" : "sync:network";
  return traceAsync(traceLabel, getCwd(), () => vscode.window.withProgress({

    location: vscode.ProgressLocation.Notification,
    title,
    cancellable: false,
  }, action));
}

async function publishBranch(host, mode, options, cwd, currentBranch) {
  const { t } = await import("./i18n.mjs");
  const { validateCommitish } = await import("./git-actions.mjs");
  const source = await validateCommitish(cwd, `refs/heads/${currentBranch}`);
  if (!source.ok) {
    await renderPanel(host, { ok: false, level: "blocked", code: "no-commits", message: t("guidance.firstPush.noCommits"), detail: t("guidance.firstPush.initialNext") }, mode, options);
    return;
  }
  const operation = await (await import("./git-safety.mjs")).getInProgressOperation(cwd);
  if (operation) {
    await renderPanel(host, { ok: false, level: "blocked", message: t("guidance.firstPush.operationPending") }, mode, options);
    return;
  }
  const workflows = await import("./git-workflows.mjs");
  let remotes = await workflows.listRemotes(cwd);
  if (!remotes.length) {
    const url = await vscode.window.showInputBox({
      prompt: t("guidance.firstPush.remoteUrl"),
      placeHolder: "https://github.com/owner/repo.git",
      validateInput: (value) => value.trim() ? null : t("guidance.firstPush.remoteUrlRequired"),
    });
    if (!url?.trim()) return;
    if (!await confirmMutation({ action: t("guidance.firstPush.registerRemote"), target: `origin · ${url.trim()}`, effect: t("guidance.firstPush.registerEffect"), confirmLabel: t("guidance.firstPush.registerAndContinue") })) return;
    const registered = await workflows.addRemote(cwd, "origin", url.trim());
    if (!registered.ok) { await showResult(host, mode, options, registered, "blocked"); return; }
    remotes = await workflows.listRemotes(cwd);
  }

  const selected = await vscode.window.showQuickPick(remotes.map((remote) => ({
    label: remote.name,
    description: remote.pushUrl ?? remote.fetchUrl ?? "",
    remote,
  })), { placeHolder: "첫 Push를 보낼 Remote를 선택하세요." });
  if (!selected) return;

  const branch = await vscode.window.showInputBox({
    prompt: "Remote에 연결할 브랜치 이름을 확인하세요.",
    value: currentBranch ?? "",
    validateInput: async (value) => {
      const result = await (await import("./git-actions.mjs")).validateBranchName(cwd, value);
      return result.ok ? null : result.message;
    },
  });
  if (!branch) return;
  const branchName = branch.trim();

  if (!await confirmMutation({
    action: "첫 Push 설정",
    target: `${currentBranch} → ${selected.remote.name}/${branchName}`,
    effect: `선택한 로컬 브랜치 ${currentBranch}를 Remote에 보내고 해당 브랜치의 Pull/Push 대상으로 ${selected.remote.name}/${branchName}를 연결합니다.`,
    risk: "선택한 브랜치의 커밋이 공유 Remote에 올라갑니다. 미커밋 변경은 포함되지 않습니다.",
    confirmLabel: "첫 Push 실행",
  })) return;

  const actions = await import("./git-actions.mjs");
  const firstPush = await withNetworkProgress(
    `Git Next · Push · ${selected.remote.name}/${branchName}`,
    async () => (await import("./git-workflows.mjs")).runWithGitStateDelta(
      cwd,
      () => actions.pushWithUpstream(cwd, selected.remote.name, branchName, currentBranch),
    ),
  );
  await refreshState(cwd).catch(() => noteSoftFailure());
  await showResult(host, mode, options, firstPush, firstPush.ok ? null : "blocked");
  return;
}

async function runSyncAction(host, action, mode = "graph", options = {}) {
  const cwd = getCwd();
  if (!cwd) {
    await renderPanel(host, {
      ok: false,
      level: "blocked",
      message: "Pull 또는 Push를 사용하려면 먼저 Git 저장소를 여세요.",
    }, mode, options);
    return;
  }

  const [
    { pullRepository, pushRepository },
    { getTrackingStatus, isPullUnnecessary, preflightPullSafety: rawPreflightPullSafety, preflightPushSafety: rawPreflightPushSafety },
    { createGuardDecision, evaluateSafeguards },
  ] = await Promise.all([
    import("./git-actions.mjs"),
    import("./git-safety.mjs"),
    import("./safe-guard.mjs"),
  ]);
  const preflightPullSafety = (targetCwd) => traceAsync("sync:pull-preflight", targetCwd, () => rawPreflightPullSafety(targetCwd));
  const preflightPushSafety = (targetCwd) => traceAsync("sync:push-preflight", targetCwd, () => rawPreflightPushSafety(targetCwd));

  if (action === "pull") {
    const preflight = await preflightPullSafety(cwd);
    const guard = await evaluateSafeguards({
      action: "pull",
      rules: [
        async () => createGuardDecision(preflight.level as "safe" | "warning" | "blocked", preflight.message, {
          code: preflight.code,
          detail: preflight.detail,
          affected: preflight.affected,
          overridable: false,
        }),
      ],
    });

    const relaxedOverlap = !guard.canProceed
      && preflight.code === "dirty-incoming-overlap"
      && relaxedSafeGuardRules.has("dirty-incoming-overlap");
    if (relaxedOverlap) {
      const proceed = await vscode.window.showWarningMessage(
        "완화한 검사: 로컬 변경 파일과 Pull 대상 파일이 겹칩니다. Pull 중 Conflict가 생기거나 작업이 멈출 수 있습니다.",
        { modal: true },
        "이번 Pull 계속",
      );
      if (!proceed) return;
    }
    if (!guard.canProceed && !relaxedOverlap) {
      if (preflight.code === "dirty-incoming-overlap") {
        const { t } = await import("./i18n.mjs");
        const overlappingFiles = preflight.affected?.length
          ? t("dialog.safeguard.overlappingFilesLabel", { files: preflight.affected.join(", ") })
          : "";
        await vscode.window.showWarningMessage(
          t("dialog.safeguard.dirtyIncomingOverlapBlocked", { overlappingFiles }),
          { modal: true },
        );
      }
      const detail = [
        guard.affected?.length ? `영향 파일/참조: ${guard.affected.join(", ")}` : null,
        guard.detail,
      ].filter(Boolean).join("\n");
      await renderPanel(host, {
        action: "pull",
        code: preflight.code,
        ok: false,
        level: guard.level,
        message: guard.message,
        detail,
        guideKey: await getGuideKey("pull", {
          code: preflight.code,
          detail,
          message: guard.message,
        }),
      }, mode, options);
      if (preflight.code === "diverged") {
        await offerDivergedResolution(host, mode, options, cwd);
      }
      return;
    }

    const freshTracking = preflight.beforeSnapshot?.tracking ?? await getTrackingStatus(cwd);
    if (isPullUnnecessary(freshTracking)) {
      await (await import("./stash-flow.mjs")).markStashPulled(cwd);
      await refreshState(cwd);
      await renderPanel(host, {
        action: "pull",
        ok: true,
        level: "safe",
        message: freshTracking.kind === "ahead"
          ? "원격에서 받을 새 커밋은 없습니다. 로컬에만 아직 Push하지 않은 커밋이 있습니다."
          : "이미 원격과 동기화된 상태입니다.",
      }, mode, options);
      return;
    }

    if (!await confirmImpactPreview(host, mode, options, cwd, "pull", preflight.beforeSnapshot)) return;
    const pullResult = await withNetworkProgress("Git Next · Pull", async () =>
      (await import("./git-workflows.mjs")).runWithGitStateDelta(cwd, () => pullRepository(cwd)));
    if (pullResult.ok) {
      const stashes = await (await import("./git-actions.mjs")).listStashes(cwd);
      if (stashes.length) {
        pullResult.message = `${pullResult.message} Stash가 ${stashes.length}개 남아 있습니다.`;
        pullResult.detail = [
          pullResult.detail,
          `Pull 전에 작업을 Stash했다면 Stash 화면에서 Pop으로 다시 꺼내세요. 현재 맨 위 항목은 ${stashes[0].ref}입니다.`,
        ].filter(Boolean).join("\n");
        void vscode.window.showInformationMessage(
          `Pull 완료 · Stash ${stashes.length}개 보관 중. Pull 전에 넣어둔 작업이라면 Stash에서 Pop으로 복원하세요.`,
        );
      }
    }
    await refreshState(cwd).catch(() => noteSoftFailure());
    await showResult(host, mode, options, pullResult, pullResult.ok ? null : "blocked");
    if (!pullResult.ok && (await getTrackingStatus(cwd)).kind === "diverged") {
      await offerDivergedResolution(host, mode, options, cwd);
    }
    return;
  }

  const pullBeforePush = isPullBeforePushEnabled();
  const tracking = pullBeforePush ? await getTrackingStatus(cwd) : null;
  if (pullBeforePush && tracking?.kind !== "no-upstream") {
    const before = tracking;
    const preflight = await preflightPullSafety(cwd);
    if (preflight.level !== "safe") {
      const detail = [
        `업데이트 전 상태: ${before.kind}; ahead ${before.ahead}; behind ${before.behind}`,
        preflight.detail,
      ].filter(Boolean).join("\n");
      const message = `Push 전 Pull 안전 검사에서 중단했습니다. ${preflight.message}`;
      await renderPanel(host, {
        action: "push",
        code: preflight.code,
        ok: false,
        level: preflight.level,
        message,
        detail,
        guideKey: await getGuideKey("pull", {
          code: preflight.code,
          detail,
          message,
        }),
      }, mode, options);
      if (preflight.code === "diverged") {
        await offerDivergedResolution(host, mode, options, cwd);
      }
      return;
    }

    const pullResult = await withNetworkProgress("Git Next · Push 전 Pull", () => pullRepository(cwd));
    await refreshState(cwd).catch(() => noteSoftFailure());
    if (!pullResult.ok) {
      await showResult(host, mode, options, pullResult, "blocked");
      return;
    }
  }

  const preflight = await preflightPushSafety(cwd);
  if (preflight.level !== "safe" && preflight.code !== "no-upstream") {
    await renderPanel(host, {
      action: "push",
      code: preflight.code,
      ok: false,
      level: preflight.level,
      message: preflight.message,
      detail: preflight.detail,
      guideKey: await getGuideKey("push", preflight),
    }, mode, options);
    if (preflight.code === "diverged") {
      await offerDivergedResolution(host, mode, options, cwd);
      return;
    }
    if (preflight.code === "behind") {
      {
        const { t } = await import("./i18n.mjs");
        await offerForceWithLease(host, mode, options, cwd, t("guidance.pushRejectHint.behind"));
      }
    }
    return;
  }

  if (preflight.code === "no-upstream") {
    const branch = preflight.beforeSnapshot?.branch ?? (await getState(cwd)).branch;
    return publishBranch(host, mode, options, cwd, branch);
  }

  if (!await confirmImpactPreview(host, mode, options, cwd, "push", preflight.beforeSnapshot)) return;
  const workflows = await import("./git-workflows.mjs");
  const result = await withNetworkProgress("Git Next · Push", () =>
    workflows.runWithGitStateDelta(cwd, () => pushRepository(cwd)));
  await refreshState(cwd).catch(() => noteSoftFailure());
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
  if (!result.ok && /non-fast-forward|rejected/i.test(`${result.detail ?? ""} ${result.message ?? ""}`)) {
    {
      const { t } = await import("./i18n.mjs");
      await offerForceWithLease(host, mode, options, cwd, t("guidance.pushRejectHint.rejected"));
    }
  }
}


  return { publishBranch, runSyncAction, withNetworkProgress, offerDivergedResolution };
}

module.exports = { createSyncHandler };
