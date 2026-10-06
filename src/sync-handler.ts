const vscode = require("vscode");

function createSyncHandler(core) {
  const {
    getCwd,
    renderPanel,
    getGuideKey,
    confirmMutation,
    guardWorkingState,
    showResult,
    getState,
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
      await new Promise((resolve) => setTimeout(resolve, 400));
      return;
    }
    for (const [index, commit] of visible.entries()) {
      if (token.isCancellationRequested) break;
      progress.report({
        increment: 100 / visible.length,
        message: `${from} ● ━▶ ${to} · ${commit.id.slice(0, 8)} ${commit.subject}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    if (!token.isCancellationRequested && commits.length > visible.length) {
      progress.report({ message: `외 ${commits.length - visible.length}개 커밋 · ${from} → ${to}` });
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  });
}

async function confirmImpactPreview(host, mode, options, cwd, action) {
  const {
    getActionImpactPreview,
    buildSyncImpactSummary,
    formatSyncImpactSummary,
  } = await import("./git-workflows.mjs");
  const preview = await getActionImpactPreview(cwd, action);
  const summary = buildSyncImpactSummary(preview);
  const detail = formatSyncImpactSummary(summary);
  await renderPanel(host, {
    ok: true,
    level: "safe",
    message: `${summary.label} 영향 요약 · ${summary.direction}`,
    detail,
  }, mode, options);
  await showSyncMovementPreview(action, preview);
  return confirmMutation({
    action: summary.label,
    target: summary.direction,
    effect: detail,
    risk: summary.risk,
    confirmLabel: action === "pull" ? "Pull 실행" : "Push 실행",
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
  const protectedGuard = await getProtectedBranchWarning(cwd, "force-push");
  const confirm = await vscode.window.showWarningMessage(
    `${reason}\n\n안전한 강제 Push 대상: ${preview.remote}/${preview.branch}\n확인한 원격 최신 Commit: ${preview.expected.slice(0, 12)}\n실행 직전까지 이 Commit이 그대로일 때만 원격 기록을 로컬 기록으로 바꿉니다. 그 사이 누군가 원격을 변경하면 Git이 자동으로 Push를 취소합니다.${protectedGuard.protected ? `\n\n${protectedGuard.message}` : ""}`,
    { modal: true },
    protectedGuard.protected ? "보호 브랜치 안전한 강제 Push" : "안전한 강제 Push",
  );
  if (!confirm) return;
  const actions = await import("./git-actions.mjs");
  const result = await workflows.runWithGitStateDelta(cwd, () =>
    actions.pushWithForceWithLease(cwd, preview.remote, preview.remoteRef, preview.expected));
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
}

async function offerDivergedResolution(host, mode, options, cwd) {
  const workflows = await import("./git-workflows.mjs");
  const preview: any = await workflows.getDivergedIntegrationPreview(cwd);
  if (!preview.ok) {
    await renderPanel(host, { ok: false, level: "blocked", message: preview.message }, mode, options);
    return;
  }

  const guard = await guardWorkingState(cwd, "merge");
  if (!guard.ok) {
    await renderPanel(host, { ok: false, level: "blocked", message: guard.message, detail: guard.detail }, mode, options);
    return;
  }

  const baseRisk = preview.conflictRisk
    ? "충돌 가능성이 있습니다. 충돌 시 기존 Continue / Abort 흐름에서 정리합니다."
    : "원격 변경을 현재 브랜치에 Merge합니다.";
  const ok = await confirmMutation({
    action: "Diverged Merge",
    target: preview.target,
    effect: workflows.formatIntegrationPreview(preview, "merge"),
    risk: baseRisk,
    level: preview.conflictRisk ? "warning" : "safe",
    confirmLabel: "Merge 실행",
  });
  if (!ok) return;

  const result = await workflows.runWithGitStateDelta(cwd, () =>
    workflows.mergeIntoCurrent(cwd, preview.target));
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
}

async function withNetworkProgress(title, action) {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title,
    cancellable: false,
  }, action);
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
    { getTrackingStatus, isPullUnnecessary, preflightPullSafety, preflightPushSafety },
    { createGuardDecision, evaluateSafeguards },
  ] = await Promise.all([
    import("./git-actions.mjs"),
    import("./git-safety.mjs"),
    import("./safe-guard.mjs"),
  ]);
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
        await vscode.window.showWarningMessage(
          `Pull을 실행하지 않았습니다.\n\n로컬에서 수정한 파일과 원격에서 받아올 파일이 겹칩니다. 그대로 Pull하면 작업이 중단되거나 충돌할 수 있어요.\n\n먼저 Commit하거나 Stash로 현재 작업을 보관한 뒤 다시 Pull해주세요.${preflight.affected?.length ? `\n\n겹치는 파일: ${preflight.affected.join(", ")}` : ""}`,
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

    const freshTracking = await getTrackingStatus(cwd);
    if (isPullUnnecessary(freshTracking)) {
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

    if (!await confirmImpactPreview(host, mode, options, cwd, "pull")) return;
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
    await showResult(host, mode, options, pullResult, pullResult.ok ? null : "blocked");
    if (!pullResult.ok && (await getTrackingStatus(cwd)).kind === "diverged") {
      await offerDivergedResolution(host, mode, options, cwd);
    }
    return;
  }

  const tracking = await getTrackingStatus(cwd);
  if (isPullBeforePushEnabled() && tracking.kind !== "no-upstream") {
    const before = await getTrackingStatus(cwd);
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
      await offerForceWithLease(host, mode, options, cwd, "일반 Push는 원격에 새 커밋이 있어 중단됐습니다. 원격 내용을 확인하고 덮어쓸지 결정하세요.");
    }
    return;
  }

  if (preflight.code === "no-upstream") {
    const remotes = await (await import("./git-workflows.mjs")).listRemotes(cwd);
    if (!remotes.length) {
      await renderPanel(host, {
        ok: false,
        action: "push",
        code: "no-upstream",
        level: "blocked",
        message: "첫 Push를 하려면 먼저 Remote를 등록하세요.",
        detail: "Git 도구에서 Remote를 추가한 뒤 다시 Push하세요.",
        guideKey: await getGuideKey("push", preflight),
      }, mode, options);
      return;
    }

    const selected = await vscode.window.showQuickPick(remotes.map((remote) => ({
      label: remote.name,
      description: remote.pushUrl ?? remote.fetchUrl ?? "",
      remote,
    })), { placeHolder: "첫 Push를 보낼 Remote를 선택하세요." });
    if (!selected) return;

    const state = await getState(cwd);
    const branch = await vscode.window.showInputBox({
      prompt: "Remote에 연결할 브랜치 이름을 확인하세요.",
      value: state.branch ?? "",
      validateInput: async (value) => {
        const result = await (await import("./git-actions.mjs")).validateBranchName(cwd, value);
        return result.ok ? null : result.message;
      },
    });
    if (!branch) return;
    const branchName = branch.trim();

    if (!await confirmMutation({
      action: "첫 Push 설정",
      target: `${state.branch} → ${selected.remote.name}/${branchName}`,
      effect: `현재 브랜치를 Remote에 보내고 이후 Pull/Push의 기본 대상으로 ${selected.remote.name}/${branchName}를 연결합니다.`,
      risk: "현재 브랜치의 커밋이 공유 Remote에 올라갑니다.",
      confirmLabel: "첫 Push 실행",
    })) return;

    const actions = await import("./git-actions.mjs");
    const firstPush = await withNetworkProgress(
      `Git Next · Push · ${selected.remote.name}/${branchName}`,
      async () => (await import("./git-workflows.mjs")).runWithGitStateDelta(
        cwd,
        () => actions.pushWithUpstream(cwd, selected.remote.name, branchName),
      ),
    );
    await showResult(host, mode, options, firstPush, firstPush.ok ? null : "blocked");
    return;
  }

  if (!await confirmImpactPreview(host, mode, options, cwd, "push")) return;
  const workflows = await import("./git-workflows.mjs");
  const result = await withNetworkProgress("Git Next · Push", () =>
    workflows.runWithGitStateDelta(cwd, () => pushRepository(cwd)));
  await showResult(host, mode, options, result, result.ok ? null : "blocked");
  if (!result.ok && /non-fast-forward|rejected/i.test(`${result.detail ?? ""} ${result.message ?? ""}`)) {
    await offerForceWithLease(host, mode, options, cwd, "일반 Push가 Remote에서 거절됐습니다.");
  }
}


  return { runSyncAction, withNetworkProgress, offerDivergedResolution };
}

module.exports = { createSyncHandler };
