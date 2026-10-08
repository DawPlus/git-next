const vscode = require("vscode");

function createWebviewHost(core, panels, menus, sync) {
  const {
    setKnownRepositoryRoots,
    setWebviewHtml,
    getCwd,
    getRepositoryRoot,
    getCachedState,
    refreshState,
    refreshWorkingTreeState,
    applyWorkingTreeCacheAction,
    invalidateSharedStateLoad,
    renderPanel,
    recordActivity,
    confirmMutation,
    getOrCreateWebviewPanel,
    getLocale,
    setLocale,
    t,
  } = core;
  const {
    openKnowledgePanel,
    openChangesPanel,
    openComparePanel,
    openCommitDetailsPanel,
    openWorkingTreeDiff,
    openBranchWorkspace,
    openStashWorkspace,
  } = panels;
  const { tagMenu, toolsMenu, commitMenu, conflictHelper } = menus;
  const { runSyncAction } = sync;

  const liveWebviewHosts = new Set();
  let externalGitRefreshTimer = null;
  let externalGitRefreshInFlight = false;
  let internalGitOperationDepth = 0;
  let externalGitRefreshPending = false;
  const externalGitRefreshRoots = new Set();
  const recentInternalStageRoots = new Map();
  const gitRepositoriesByRoot = new Map();

  function markInternalStage(root) {
    if (root) recentInternalStageRoots.set(root, Date.now());
  }

  async function isUnchangedInternalStageEcho(root) {
    const marker = recentInternalStageRoots.get(root);
    if (!marker || Date.now() - marker > 1000) return false;
    const cwd = getCwd();
    const cached = getCachedState(cwd);
    if (!cached || cached.kind !== "repository" || cached.root !== root) return false;
    const head = gitRepositoriesByRoot.get(root)?.state?.HEAD;
    if (!head || head.commit !== cached.head || head.name !== cached.branch) return false;
    try {
      const { getWorkingTreeChanges } = await import("./git-safety.mjs");
      const actual = await getWorkingTreeChanges(root);
      const signature = (changes) => JSON.stringify(changes.map(({ path, status }) => [path, status]).sort((a, b) => a[0].localeCompare(b[0])));
      return signature(actual) === signature(cached.changes ?? []);
    } catch {
      return false;
    }
  }

  function scheduleExternalGitRefresh(root = null) {
    if (root) externalGitRefreshRoots.add(root);
    if (internalGitOperationDepth > 0) {
      externalGitRefreshPending = true;
      return;
    }
    if (externalGitRefreshInFlight) return;
    if (externalGitRefreshTimer) clearTimeout(externalGitRefreshTimer);
    externalGitRefreshTimer = setTimeout(async () => {
      externalGitRefreshTimer = null;
      externalGitRefreshInFlight = true;
      try {
        const roots = [...externalGitRefreshRoots];
        externalGitRefreshRoots.clear();
        const results = await Promise.allSettled(roots.map(async (item) => {
          if (await isUnchangedInternalStageEcho(item)) return false;
          await refreshState(item, { maxAgeMs: 250 });
          return true;
        }));
        // An echoed Stage event already reflected in the snapshot needs no second DOM replacement.
        if (!roots.length || results.some((result) => result.status !== "fulfilled" || result.value !== false)) {
          await Promise.allSettled(
            [...liveWebviewHosts].map(({ host, mode, getOptions }) =>
              renderPanel(host, null, mode, getOptions())),
          );
        }
      } finally {
        externalGitRefreshInFlight = false;
        if (externalGitRefreshRoots.size) scheduleExternalGitRefresh();
      }
    }, 180);
  }

  async function runInternalGitOperation(action, { consumeExternalRefresh = false, refresh = "full" } = {}) {
    const cwd = getCwd();
    invalidateSharedStateLoad(cwd);
    internalGitOperationDepth += 1;
    try {
      return await action();
    } finally {
      invalidateSharedStateLoad(cwd);
      if (cwd) {
        if (refresh === "working-tree") await refreshWorkingTreeState(cwd).catch(() => {});
        else if (refresh !== "none") await refreshState(cwd).catch(() => {});
      }
      internalGitOperationDepth -= 1;
      if (internalGitOperationDepth === 0 && externalGitRefreshPending) {
        externalGitRefreshPending = false;
        if (!consumeExternalRefresh) scheduleExternalGitRefresh(cwd);
      }
    }
  }

  async function refreshWebviewHosts() {
    await Promise.allSettled(
      [...liveWebviewHosts].map(({ host, mode, getOptions }) =>
        renderPanel(host, null, mode, getOptions())),
    );
  }

  async function registerBuiltInGitStateRefresh(context) {
    try {
      const extension = vscode.extensions.getExtension("vscode.git");
      if (!extension) return;
      const exports = extension.isActive ? extension.exports : await extension.activate();
      const api = exports?.getAPI?.(1);
      if (!api) return;

      const observed = new WeakSet();
      const refreshRepositoryRoots = () => {
        setKnownRepositoryRoots(
          (api.repositories ?? []).map((repository) => repository.rootUri?.fsPath).filter(Boolean),
        );
      };
      const observeRepository = (repository) => {
        if (!repository || observed.has(repository)) return;
        observed.add(repository);
        refreshRepositoryRoots();
        const root = repository.rootUri?.fsPath;
        if (root) {
          gitRepositoriesByRoot.set(root, repository);
          void refreshState(root).catch(() => {});
          void import("./git-safety.mjs")
            .then(({ refreshCurrentUpstreamState }) => refreshCurrentUpstreamState(root))
            .catch(() => {});
        }
        const disposable = repository.state?.onDidChange?.(() => scheduleExternalGitRefresh(root));
        if (disposable) context.subscriptions.push(disposable);
      };

      refreshRepositoryRoots();
      for (const repository of api.repositories ?? []) observeRepository(repository);
      if (api.onDidOpenRepository) {
        context.subscriptions.push(api.onDidOpenRepository((repository) => {
          observeRepository(repository);
          scheduleExternalGitRefresh();
        }));
      }
      if (api.onDidCloseRepository) {
        context.subscriptions.push(api.onDidCloseRepository(() => {
          refreshRepositoryRoots();
          scheduleExternalGitRefresh();
        }));
      }
    } catch {
      // Manual refresh remains available when the built-in Git API cannot be used.
    }
  }

  async function initializeWebviewHost(host, context, mode, initialOptions = {}) {
    host.webview.options = { enableScripts: true };
    setWebviewHtml(host.webview, "<p>Git 정보를 불러오는 중입니다...</p>");
    let options = mode === "graph"
      ? { density: "compact", query: "", ref: "", scope: "all", focus: "all", limit: 50, ...initialOptions }
      : {};
    const liveHost = { host, mode, getOptions: () => options };
    liveWebviewHosts.add(liveHost);
    const disposed = host.onDidDispose?.(() => liveWebviewHosts.delete(liveHost));
    if (disposed) context.subscriptions.push(disposed);

    const { createWebviewMessageHandler } = require("./webview-message-handler.js");
    const handleMessage = createWebviewMessageHandler({
      vscode,
      host,
      context,
      mode,
      getOptions: () => options,
      setOptions: (next) => { options = next; },
      getCwd,
      getRepositoryRoot,
      getCachedState,
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
      markInternalStage,
      runSyncAction,
      refreshWebviewHosts,
      getLocale,
      setLocale,
      t,
    });
    const messages = host.webview.onDidReceiveMessage(handleMessage);
    context.subscriptions.push(messages);

    try {
      await renderPanel(host, null, mode, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWebviewHtml(host.webview, `<p>Git 저장소 정보를 읽지 못했습니다.</p><pre>${message}</pre>`);
    }
  }

  async function openGraphPanel(context, initialOptions = {}) {
    const { panel, created } = getOrCreateWebviewPanel(
      "gitNext.graph",
      "Git Next · 그래프",
      { enableScripts: true, retainContextWhenHidden: true },
    );
    if (!created) {
      await panel.webview.postMessage({ type: "setGraphOptions", options: initialOptions });
      return;
    }
    await initializeWebviewHost(panel, context, "graph", initialOptions);
  }

  return {
    registerBuiltInGitStateRefresh,
    initializeWebviewHost,
    openGraphPanel,
  };
}

module.exports = { createWebviewHost };
