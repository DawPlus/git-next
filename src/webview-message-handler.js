function createWebviewMessageHandler({
  vscode,
  host,
  context,
  mode,
  getOptions,
  setOptions,
  getCwd,
  getRepositoryRoot,
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
}) {
  const handlers = {
    refresh: async () => renderPanel(host, null, mode, getOptions()),
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
      const result = await workflows.discardFile(root, message.path, { untracked: message.untracked });
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
      const result = await workflows.runWithGitStateDelta(
        root,
        () => workflows.commitWithMessage(root, commitMessage),
      );
      await recordActivity(result);
      await renderPanel(host, result, mode, getOptions());
    },
    setGraphOptions: async (message) => updateGraphOptions(message, true),
    graphOptions: async (message) => updateGraphOptions(message, false),
    branchMenu: async () => openBranchWorkspace(context),
    tagMenu: async () => tagMenu(host, mode, getOptions()),
    stashMenu: async () => openStashWorkspace(context),
    toolsMenu: async (message) => toolsMenu(host, mode, getOptions(), context, message.tool),
    commitMenu: async (message) => commitMenu(host, mode, getOptions(), message.commit),
    operationRecovery: async () => conflictHelper(host, mode, getOptions()),
    pull: async () => runInternalGitOperation(() => runSyncAction(host, "pull", mode, getOptions())),
    push: async () => runInternalGitOperation(() => runSyncAction(host, "push", mode, getOptions())),
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
      { consumeExternalRefresh: true },
    );
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
      { consumeExternalRefresh: true },
    );
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
