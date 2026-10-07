const syncActionsInFlight = new Set<string>();

function createWebviewMessageHandler({
  vscode,
  host,
  context,
  mode,
  getOptions,
  setOptions,
  getCwd,
  getRepositoryRoot,
  refreshState,
  applyWorkingTreeCacheAction,
  renderPanel,
  recordActivity,
  confirmMutation,
  getOrCreateWebviewPanel,
  setWebviewHtml,
  openGraphPanel,
  openKnowledgePanel,
  openChangesPanel,
  openComparePanel,
  openCommitDetailsPanel,
  openWorkingTreeDiff,
  openBranchWorkspace,
  tagMenu,
  openStashWorkspace,
  toolsMenu,
  commitMenu,
  conflictHelper,
  runInternalGitOperation,
  runSyncAction,
  refreshWebviewHosts,
  getLocale,
  setLocale,
  t,
}) {
  async function runSyncOnce(action: "pull" | "push") {
    const cwd = getCwd();
    if (!cwd) {
      try {
        return await runInternalGitOperation(() => runSyncAction(host, action, mode, getOptions()));
      } finally {
        await host.webview.postMessage({ type: "syncPending", action, pending: false });
      }
    }
    if (syncActionsInFlight.has(cwd)) {
      await host.webview.postMessage({ type: "syncPending", action, pending: false });
      return;
    }

    syncActionsInFlight.add(cwd);
    await host.webview.postMessage({ type: "syncPending", action, pending: true });
    try {
      return await runInternalGitOperation(() => runSyncAction(host, action, mode, getOptions()));
    } finally {
      syncActionsInFlight.delete(cwd);
      await host.webview.postMessage({ type: "syncPending", action, pending: false });
    }
  }

  const handlers = {
    refresh: async () => {
      const cwd = getCwd();
      if (cwd) {
        const { refreshRemoteState } = await import("./git-safety.mjs");
        const refreshed = await refreshRemoteState(cwd);
        if (!refreshed.ok) {
          await renderPanel(host, {
            ok: false,
            level: "warning",
            code: "fetch-failed",
            message: "원격 상태를 갱신하지 못했습니다.",
            detail: refreshed.detail,
          }, mode, getOptions());
          return;
        }
      }
      if (cwd) await refreshState(cwd).catch(() => {});
      await renderPanel(host, null, mode, getOptions());
    },
    openGraph: async () => openGraphPanel(context),
    openGlossary: async () => openKnowledgePanel(context, null, "terms"),
    openKnowledge: async () => openKnowledgePanel(context, null, "terms"),
    openGuide: async (message) => openKnowledgePanel(context, message.guideKey ?? null, "guides"),
    openSafeGuard: async (message) => {
      const { renderSafeGuardDetailsHtml } = await import("./sidebar-view.mjs");
      const { panel, created } = getOrCreateWebviewPanel(
        "gitNext.safeGuard",
        "Git Next · Safe Guard",
        { enableScripts: false, retainContextWhenHidden: true },
      );
      setWebviewHtml(
        panel.webview,
        renderSafeGuardDetailsHtml({ message: message.noticeMessage, detail: message.noticeDetail }),
      );
      if (created) context.subscriptions.push(panel);
    },
    openChanges: async () => openChangesPanel(context),
    openCompare: async () => openComparePanel(context),
    openCommitDetails: async (message) => {
      if (message.commit) await openCommitDetailsPanel(context, message.commit);
    },
    sidebarStage: async (message) => updateSidebarStage(message, true),
    sidebarUnstage: async (message) => updateSidebarStage(message, false),
    sidebarDiff: async (message) => {
      const cwd = getCwd();
      if (cwd && message.path) await openWorkingTreeDiff(cwd, message.path);
    },
    sidebarDiscard: async (message) => {
      const cwd = getCwd();
      if (!cwd || !message.path) return;
      const ok = await confirmMutation({
        action: "파일 변경 되돌리기",
        target: message.path,
        effect: "선택한 파일의 Stage 및 로컬 변경을 버립니다.",
        risk: "버린 변경은 Git Next에서 복구할 수 없을 수 있습니다.",
        level: "warning",
        confirmLabel: "변경 버리기",
      });
      if (!ok) return;
      const workflows = await import("./git-workflows.mjs");
      const root = await getRepositoryRoot(cwd);
      const result = await runInternalGitOperation(
        () => workflows.discardFile(root, message.path, { untracked: message.untracked }),
        { consumeExternalRefresh: true },
      );
      await recordActivity(result);
      await renderPanel(host, result, mode, getOptions());
    },
    sidebarStageAll: async () => updateSidebarStageAll(true),
    sidebarUnstageAll: async () => updateSidebarStageAll(false),
    sidebarCommit: async (message) => {
      const cwd = getCwd();
      if (!cwd) return;
      const root = await getRepositoryRoot(cwd);
      const workflows = await import("./git-workflows.mjs");
      const staged = await workflows.getStagedFiles(root);
      const commitMessage = String(message.message ?? "").trim();
      if (!staged.length) {
        await renderPanel(host, { ok: false, level: "warning", message: "Commit할 Staged 파일이 없습니다." }, mode, getOptions());
        return;
      }
      if (!commitMessage) {
        await renderPanel(host, { ok: false, level: "warning", message: "Commit message를 입력하세요." }, mode, getOptions());
        return;
      }
      const ok = await confirmMutation({
        action: "Commit",
        effect: `Staged 변경사항 ${staged.length}개를 Commit할까요?`,
        risk: "로컬에 기록되며 Push 전까지 원격에는 공유되지 않습니다.",
        confirmLabel: "Commit",
      });
      if (!ok) return;
      const result = await runInternalGitOperation(
        () => workflows.runWithGitStateDelta(
          root,
          () => workflows.commitWithMessage(root, commitMessage),
        ),
        { consumeExternalRefresh: true },
      );
      await recordActivity(result);
      await renderPanel(host, result, mode, getOptions());
      if (result.ok) await host.webview.postMessage({ type: "clearCommitMessage" });
    },
    sidebarUndoCommit: async () => {
      const cwd = getCwd();
      if (!cwd) return;
      const root = await getRepositoryRoot(cwd);
      const workflows = await import("./git-workflows.mjs");
      const undo = await workflows.getUndoContext(root);
      if (undo.headIsInUpstream) {
        await renderPanel(host, {
          ok: false,
          level: "warning",
          message: "마지막 Commit이 이미 Push된 상태라 바로 취소하지 않습니다.",
          detail: "공유된 기록은 지우지 않고 Revert를 사용해주세요.",
        }, mode, getOptions());
        return;
      }
      const ok = await confirmMutation({
        action: "마지막 Commit 취소",
        target: "HEAD",
        effect: "마지막 로컬 Commit만 취소하고 그 변경은 Staged 상태로 되돌립니다. 현재 Staged 변경과 합쳐 한 번에 다시 Commit할 수 있습니다.",
        risk: "아직 Push하지 않은 마지막 Commit에만 사용합니다.",
        level: "warning",
        confirmLabel: "Commit 취소",
      });
      if (!ok) return;
      const result = await runInternalGitOperation(
        () => workflows.runWithGitStateDelta(root, () => workflows.undoLastLocalCommit(root)),
        { consumeExternalRefresh: true },
      );
      await recordActivity(result);
      await renderPanel(host, result, mode, getOptions());
    },
    setGraphOptions: async (message) => updateGraphOptions(message, true),
    graphOptions: async (message) => updateGraphOptions(message, false),
    branchMenu: async () => openBranchWorkspace(context),
    tagMenu: async () => tagMenu(host, mode, getOptions()),
    stashMenu: async () => openStashWorkspace(context),
    changeLanguage: async () => {
      const currentLocale = getLocale();
      const selected = await vscode.window.showQuickPick(
        [
          { label: t("sidebar.languages.ko"), description: currentLocale === "ko" ? "✓" : "", locale: "ko" },
          { label: t("sidebar.languages.en"), description: currentLocale === "en" ? "✓" : "", locale: "en" },
        ],
        { placeHolder: t("sidebar.languagePickerPlaceholder") },
      );
      if (!selected || selected.locale === currentLocale) return;
      setLocale(selected.locale);
      await context.globalState.update("gitNext.locale", selected.locale);
      await refreshWebviewHosts();
    },
    toolsMenu: async (message) => toolsMenu(host, mode, getOptions(), context, message.tool),
    commitMenu: async (message) => commitMenu(host, mode, getOptions(), message.commit),
    operationRecovery: async () => conflictHelper(host, mode, getOptions()),
    pull: async () => runSyncOnce("pull"),
    push: async () => runSyncOnce("push"),
  };

  async function updateSidebarStage(message, stage) {
    const cwd = getCwd();
    if (!cwd || !message.path) return;
    const root = await getRepositoryRoot(cwd);
    const workflows = await import("./git-workflows.mjs");
    const result = await runInternalGitOperation(
      () => stage
        ? workflows.stageFile(root, message.path)
        : workflows.unstageFile(root, message.path),
      { consumeExternalRefresh: true, refresh: "none" },
    );
    if (result.ok) {
      await applyWorkingTreeCacheAction(root, {
        action: stage ? "stage" : "unstage",
        path: message.path,
      });
    }
    await recordActivity(result);
    await renderPanel(host, result, mode, getOptions());
  }

  async function updateSidebarStageAll(stage) {
    const cwd = getCwd();
    if (!cwd) return;
    const root = await getRepositoryRoot(cwd);
    const workflows = await import("./git-workflows.mjs");
    const result = await runInternalGitOperation(
      () => stage ? workflows.stageAll(root) : workflows.unstageAll(root),
      { consumeExternalRefresh: true, refresh: "none" },
    );
    if (result.ok) {
      await applyWorkingTreeCacheAction(root, {
        action: stage ? "stage-all" : "unstage-all",
      });
    }
    await recordActivity(result);
    await renderPanel(host, result, mode, getOptions());
  }

  async function updateGraphOptions(message, graphOnly) {
    if (graphOnly && mode !== "graph") return;
    setOptions({ ...getOptions(), ...(message.options ?? {}) });
    await renderPanel(host, null, mode, getOptions());
  }

  return async function handleWebviewMessage(message) {
    const handler = handlers[message?.type];
    if (!handler) return;
    try {
      await handler(message);
    } catch (error) {
      await renderPanel(host, {
        ok: false,
        level: "blocked",
        message: "Git 작업 처리 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      }, mode, getOptions());
    }
  };
}

module.exports = { createWebviewMessageHandler };
