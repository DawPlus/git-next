const vscode = require("vscode");
const { createAiPanelHandlers } = require("./ai-panel-handlers.js");
const { traceAsync } = require("./perf-trace.js");

function createPanelHandlers(core, getMenus) {
  const {
    getCwd,
    getState,
    refreshState,
    refreshWorkingTreeState,
    applyWorkingTreeCacheAction,
    getOrCreateWebviewPanel,
    renderPatchableWebview,
    setWebviewHtml,
    recordActivity,
    confirmMutation,
    guardWorkingState,
  } = core;
  const askName = (...args) => getMenus().askName(...args);
  async function promptStashMessage() {
    const choice = await vscode.window.showQuickPick([
      { label: "메모 작성", id: "custom", description: "나중에 알아보기 쉬운 내용을 입력합니다." },
      { label: "기본 메모로 빠르게 저장", id: "default", description: "Git Next 임시 저장" },
    ], { placeHolder: "Stash 메모를 선택하세요." });
    if (!choice) return undefined;
    if (choice.id === "default") return "Git Next 임시 저장";
    return vscode.window.showInputBox({
      prompt: "Stash 내용을 알아볼 수 있게 짧게 적어 주세요.",
      placeHolder: "예: 로그인 오류 수정 전 상태",
      validateInput: (value) => value.trim() ? null : "Stash 메모를 입력하세요.",
    });
  }
  function stashActionConfirmation(preview, action) {
    const isPop = action === "pop";
    const overlap = preview.overlap ?? [];
    return {
      action: isPop ? "Stash Pop" : "Stash Apply",
      target: preview.ref,
      effect: isPop ? "Stash 변경을 적용하고 성공하면 항목을 제거합니다." : "Stash 변경을 적용하고 항목은 유지합니다.",
      risk: overlap.length
        ? `현재 변경과 같은 파일 ${overlap.length}개가 있습니다. 파일 단위 겹침이며 실제 충돌 여부는 적용 후 Git이 판단합니다.\n${overlap.join(", ")}`
        : "현재 로컬 변경과 겹치는 파일 경로가 없습니다. 실제 충돌 여부는 Git이 판단합니다.",
      level: overlap.length ? "warning" : "safe",
      confirmLabel: isPop ? "Pop" : "Apply",
    };
  }
  const diffDocumentContents = new Map();
  const commitDetailsByPanel = new WeakMap();
  let diffDocumentId = 0;
  const { openAiDiagnosisPanel, openAiPracticePanel, openAiHistoryPanel } = createAiPanelHandlers(
    core,
    getMenus,
    openGuidePanel,
  );

async function openChangesPanel(context) {
  const { renderChangesWorkspace } = await import("./workspace-views.mjs");
  const workflows = await import("./git-workflows.mjs");
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.changes",
    "Git Next · 변경사항",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  if (!created) return;

  let notice = null;
  let changesRefreshTimer = null;
  let gitStateDisposable = null;
  let changesMutationRunning = false;
  let internalChangesQuietUntil = 0;

  const sameWorkingTreeChanges = (left = [], right = []) => {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index]?.status !== right[index]?.status || left[index]?.path !== right[index]?.path) return false;
    }
    return true;
  };
  const toChangeWorkspace = (changes = []) => {
    const files = changes.map((change) => {
      const rawStatus = String(change.status ?? "  ").padEnd(2, " ");
      const path = String(change.path ?? "").split(" -> ").at(-1) ?? "";
      const untracked = rawStatus === "??";
      const staged = !untracked && rawStatus[0] !== " ";
      const unstaged = untracked || rawStatus[1] !== " ";
      return {
        path,
        status: untracked ? "?" : (unstaged ? rawStatus[1] : rawStatus[0]).trim(),
        staged,
        unstaged,
        untracked,
      };
    });
    return {
      staged: files.filter((file) => file.staged),
      unstaged: files.filter((file) => file.unstaged),
      files,
    };
  };
  const refresh = async () => {
    const cwd = getCwd();
    const state = cwd ? await getState(cwd) : null;
    await renderPatchableWebview(
      panel.webview,
      state?.kind === "repository"
        ? renderChangesWorkspace(toChangeWorkspace(state.changes ?? []), notice)
        : renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, { message: "Git 저장소가 없습니다." }),
    );
  };

  try {
    const extension = vscode.extensions.getExtension("vscode.git");
    const exports = extension?.isActive ? extension.exports : await extension?.activate();
    const api = exports?.getAPI?.(1);
    const cwd = getCwd();
    const repository = (api?.repositories ?? []).find((item) => item.rootUri?.fsPath === cwd);
    if (repository?.state?.onDidChange) {
      gitStateDisposable = repository.state.onDidChange(() => {
        if (changesMutationRunning || Date.now() < internalChangesQuietUntil) return;
        if (changesRefreshTimer) clearTimeout(changesRefreshTimer);
        changesRefreshTimer = setTimeout(async () => {
          changesRefreshTimer = null;
          const currentCwd = getCwd();
          if (!currentCwd) {
            await refresh();
            return;
          }
          const before = await getState(currentCwd).catch(() => null);
          const after = await refreshWorkingTreeState(currentCwd).catch(() => null);
          if (!before || !after || !sameWorkingTreeChanges(before.changes ?? [], after.changes ?? [])) {
            await refresh();
          }
        }, 100);
      });
    }
  } catch {
    // Manual refresh remains available when the built-in Git API cannot be used.
  }

  panel.onDidDispose(() => {
    if (changesRefreshTimer) clearTimeout(changesRefreshTimer);
    gitStateDisposable?.dispose?.();
  });

  const reconcileWorkingTreeAfterQuietPeriod = () => {
    if (changesRefreshTimer) clearTimeout(changesRefreshTimer);
    changesRefreshTimer = setTimeout(async () => {
      changesRefreshTimer = null;
      const currentCwd = getCwd();
      if (!currentCwd) return;
      const before = await getState(currentCwd).catch(() => null);
      const after = await refreshWorkingTreeState(currentCwd).catch(() => null);
      if (!before || !after || !sameWorkingTreeChanges(before.changes ?? [], after.changes ?? [])) {
        await refresh();
      }
    }, 500);
  };

  const runChangesMutation = async (action) => {
    changesMutationRunning = true;
    try {
      return await action();
    } finally {
      changesMutationRunning = false;
      internalChangesQuietUntil = Date.now() + 450;
      reconcileWorkingTreeAfterQuietPeriod();
    }
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    notice = null;

    if (message?.type === "refresh") {
      await refreshWorkingTreeState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "compare-remote") {
      await openComparePanel(context);
      return;
    }
    if (message?.type === "compare-file") {
      const comparison = await workflows.getLocalRemoteComparison(cwd);
      const row = comparison.files?.find((file) => file.path === message.path);
      if (!row) {
        vscode.window.showInformationMessage("Remote와 비교할 변경을 찾지 못했습니다.");
        return;
      }
      await openLocalRemoteDiff(cwd, comparison.upstream, row.path);
      return;
    }
    if (message?.type === "stage" || message?.type === "unstage") {
      const result = await runChangesMutation(() => message.type === "stage"
        ? workflows.stageFile(cwd, message.path)
        : workflows.unstageFile(cwd, message.path));
      notice = result;
      if (result.ok) {
        await applyWorkingTreeCacheAction(cwd, {
          action: message.type === "stage" ? "stage" : "unstage",
          path: message.path,
        });
        await recordActivity(result);
        return;
      }
      await recordActivity(result);
      await refreshWorkingTreeState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "stage-all" || message?.type === "unstage-all") {
      const result = await runChangesMutation(() => message.type === "stage-all"
        ? workflows.stageAll(cwd)
        : workflows.unstageAll(cwd));
      notice = result;
      if (result.ok) {
        await applyWorkingTreeCacheAction(cwd, {
          action: message.type === "stage-all" ? "stage-all" : "unstage-all",
        });
        await recordActivity(result);
        return;
      }
      await recordActivity(result);
      await refreshWorkingTreeState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "discard") {
      const ok = await confirmMutation({
        action: "파일 변경 되돌리기",
        target: message.path,
        effect: "현재 로컬 변경을 버립니다.",
        risk: "버린 변경은 Git Next에서 복구할 수 없을 수 있습니다.",
        level: "warning",
        confirmLabel: "변경 버리기",
      });
      if (!ok) return;
      const result = await workflows.discardFile(cwd, message.path, { untracked: message.untracked });
      notice = result;
      await recordActivity(result);
      await refreshWorkingTreeState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "commit") {
      const staged = await workflows.getStagedFiles(cwd);
      if (!staged.length) {
        notice = { ok: false, message: "Commit할 Staged 파일이 없습니다." };
        return refresh();
      }
      const commitMessage = String(message.message ?? "").trim();
      if (!commitMessage) {
        notice = { ok: false, message: "Commit message를 입력하세요." };
        return refresh();
      }
      const ok = await confirmMutation({
        action: "Commit",
        effect: `Staged 변경사항 ${staged.length}개를 Commit할까요?`,
        risk: "로컬에 기록되며 Push 전까지 원격에는 공유되지 않습니다.",
        confirmLabel: "Commit",
      });
      if (!ok) return;
      const result = await workflows.runWithGitStateDelta(cwd, () => workflows.commitWithMessage(cwd, commitMessage));
      notice = result;
      await recordActivity(result);
      await refreshState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "undo-commit") {
      const undo = await workflows.getUndoContext(cwd);
      if (undo.headIsInUpstream) {
        notice = { ok: false, message: "마지막 Commit이 이미 원격에 올라가 있어 바로 취소하면 기록이 꼬일 수 있어요. 기존 기록은 남기고 ‘되돌리기(Revert)’를 사용해주세요." };
        return refresh();
      }
      const ok = await confirmMutation({
        action: "마지막 로컬 Commit 취소",
        target: "HEAD",
        effect: "Commit만 취소하고 변경은 Staged 상태로 남깁니다.",
        risk: "아직 Push하지 않은 Commit에만 사용하세요.",
        level: "warning",
        confirmLabel: "Commit 취소",
      });
      if (!ok) return;
      const result = await workflows.runWithGitStateDelta(cwd, () => workflows.undoLastLocalCommit(cwd));
      notice = result;
      await recordActivity(result);
      await refreshState(cwd).catch(() => {});
      return refresh();
    }
  });

  await refresh();
  context.subscriptions.push(panel);
}

async function openLocalRemoteDiff(cwd, upstream, path) {
  const workflows = await import("./git-workflows.mjs");
  const remote = await workflows.readGitFile(cwd, upstream, path);
  const localUri = vscode.Uri.file(require("node:path").join(cwd, path));
  let localDoc;
  try {
    localDoc = await vscode.workspace.openTextDocument(localUri);
  } catch {
    localDoc = await vscode.workspace.openTextDocument({ content: "", language: "plaintext" });
  }
  const remoteDoc = await vscode.workspace.openTextDocument({
    content: remote.ok ? remote.content : "",
    language: localDoc.languageId,
  });
  await vscode.commands.executeCommand(
    "vscode.diff",
    remoteDoc.uri,
    localDoc.uri,
    `${path} · Remote ↔ Local`,
  );
}

async function openWorkingTreeDiff(cwd, path) {
  const workflows = await import("./git-workflows.mjs");
  const state = await (await import("./git-state.mjs")).getRepositoryState(cwd);
  const root = state.root ?? cwd;
  const serverRef = state.upstream ?? "HEAD";
  const before = state.upstream || state.head
    ? await workflows.readGitFile(root, serverRef, path)
    : { ok: false, content: "" };
  let after;
  try {
    after = await vscode.workspace.openTextDocument(vscode.Uri.file(require("node:path").join(root, path)));
  } catch {
    after = await vscode.workspace.openTextDocument({ content: "", language: "plaintext" });
  }
  const sourceLabel = state.upstream
    ? `[서버 · ${serverRef} · 변경 전]`
    : `[기준 커밋 · ${String(state.head ?? "HEAD").slice(0, 7)} · 변경 전]`;
  const remoteUri = createDiffDocumentUri(sourceLabel, path, before.ok ? before.content : "");
  const localUri = createDiffDocumentUri("[로컬 · 현재 파일 · 변경 후]", path, after.getText());
  await vscode.commands.executeCommand(
    "vscode.diff",
    remoteUri,
    localUri,
    `${path} · ${state.upstream ? `서버 ${serverRef}` : "기준 커밋"} 변경 전 → 로컬 현재 파일`,
  );
}

function createDiffDocumentUri(label, path, content) {
  const id = String(++diffDocumentId);
  diffDocumentContents.set(id, content);
  if (diffDocumentContents.size > 80) {
    diffDocumentContents.delete(diffDocumentContents.keys().next().value);
  }
  return vscode.Uri.from({ scheme: "git-next-diff", path: `/${label}/${path}`, query: id });
}

async function openComparePanel(context) {
  const { renderCompareWorkspace } = await import("./workspace-views.mjs");
  const workflows = await import("./git-workflows.mjs");
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.compare",
    "Git Next · Local ↔ Remote",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  if (!created) return;
  let comparison = null;
  const refresh = async () => {
    const cwd = getCwd();
    comparison = cwd
      ? await workflows.getLocalRemoteComparison(cwd)
      : { ok: false, message: "Git 저장소가 없습니다.", files: [] };
    setWebviewHtml(panel.webview, renderCompareWorkspace(comparison));
  };
  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    if (message?.type === "refresh") return refresh();
    if (message?.type === "open-diff" && message.path && comparison?.upstream) {
      await openLocalRemoteDiff(cwd, comparison.upstream, message.path);
    }
  });
  await refresh();
  context.subscriptions.push(panel);
}

async function openBranchWorkspace(context) {
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.branches",
    "Git Next · Branch",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  if (!created) return;
  setWebviewHtml(panel.webview, "<p>브랜치 정보를 불러오는 중입니다...</p>");
  const [{ renderBranchWorkspace }, actions, workflows, safety] = await Promise.all([
    import("./workspace-views.mjs"),
    import("./git-actions.mjs"),
    import("./git-workflows.mjs"),
    import("./git-safety.mjs"),
  ]);
  let branchMutationRunning = false;
  const runBranchMutation = async (action) => {
    if (branchMutationRunning) {
      void vscode.window.showInformationMessage("다른 브랜치 작업을 처리 중이에요. 잠시 후 다시 시도해주세요.");
      return { skipped: true };
    }
    branchMutationRunning = true;
    try {
      return await action();
    } finally {
      const cwd = getCwd();
      if (cwd) await refreshState(cwd).catch(() => {});
      branchMutationRunning = false;
    }
  };
  const refresh = async () => {
    const cwd = getCwd();
    const state = cwd ? await getState(cwd) : { refs: [], branch: null, upstream: null, tracking: null };
    setWebviewHtml(panel.webview, renderBranchWorkspace(state));
  };

  let branchRefreshTimer = null;
  let gitStateDisposable = null;
  try {
    const extension = vscode.extensions.getExtension("vscode.git");
    const exports = extension?.isActive ? extension.exports : await extension?.activate();
    const api = exports?.getAPI?.(1);
    const cwd = getCwd();
    const repository = (api?.repositories ?? []).find((item) => item.rootUri?.fsPath === cwd);
    if (repository?.state?.onDidChange) {
      gitStateDisposable = repository.state.onDidChange(() => {
        if (branchRefreshTimer) clearTimeout(branchRefreshTimer);
        branchRefreshTimer = setTimeout(() => {
          branchRefreshTimer = null;
          const cwd = getCwd();
          if (!cwd) {
            void refresh();
            return;
          }
          void refreshState(cwd, { maxAgeMs: 250 }).then(refresh).catch(() => refresh());
        }, 80);
      });
    }
  } catch {
    // Manual refresh after Git Next actions still keeps this view usable.
  }

  panel.onDidDispose(() => {
    if (branchRefreshTimer) clearTimeout(branchRefreshTimer);
    gitStateDisposable?.dispose?.();
  });
  const createTrackingBranchFromRemote = async (cwd, remoteRef) => {
    const operation = await safety.getInProgressOperation(cwd);
    if (operation) {
      await vscode.window.showWarningMessage(`현재 ${operation.operation} 작업이 진행 중이에요. 먼저 그 작업을 끝낸 뒤 브랜치를 만들어주세요.`);
      return false;
    }
    const changes = await safety.getWorkingTreeChanges(cwd);
    const defaultName = remoteRef.includes("/") ? remoteRef.slice(remoteRef.indexOf("/") + 1) : remoteRef;
    const name = await vscode.window.showInputBox({
      prompt: "추적할 로컬 브랜치 이름",
      value: defaultName,
      ignoreFocusOut: true,
      validateInput: async (value) => {
        const check = await actions.validateBranchName(cwd, value);
        return check.ok ? null : check.message;
      },
    });
    if (!name) return false;
    const ok = await confirmMutation({
      action: "원격 브랜치를 로컬로 가져오기",
      target: `${remoteRef} → ${name}`,
      effect: "원격 브랜치를 기준으로 새 로컬 브랜치를 만들고 서로 연결합니다. 생성 후 이 로컬 브랜치로 이동합니다.",
      risk: changes.length
        ? `커밋하지 않은 변경 ${changes.length}개도 새 브랜치로 함께 이동합니다. 대상 브랜치의 파일과 겹쳐 덮어쓸 위험이 있으면 Git이 자동으로 이동을 중단합니다.`
        : "",
      confirmLabel: "로컬 브랜치 만들기",
    });
    if (!ok) return false;
    const result = await runBranchMutation(() => workflows.runWithGitStateDelta(cwd, () => actions.createTrackingBranch(cwd, name, remoteRef)));
    if (result?.skipped) return false;
    void (result.ok ? vscode.window.showInformationMessage(result.message) : vscode.window.showWarningMessage(result.message));
    return result.ok;
  };

  const syncCurrentBranch = async (cwd, state, selectedBranch = null, selectedKind = null) => {
    if (selectedKind === "local" && selectedBranch && selectedBranch !== state.branch) {
      await vscode.window.showInformationMessage(`동기화는 현재 작업 중인 브랜치 '${state.branch ?? "없음"}'에서 진행합니다. '${selectedBranch}'을 동기화하려면 먼저 그 브랜치로 이동해주세요.`);
      return;
    }

    const tracking = state.tracking ?? await safety.getTrackingStatus(cwd);
    if (tracking.kind === "up-to-date") {
      await vscode.window.showInformationMessage("현재 로컬 브랜치와 원격 브랜치가 이미 같은 상태예요.");
      return;
    }
    if (tracking.kind === "diverged") {
      const choice = await vscode.window.showWarningMessage(
        "로컬과 원격에 서로 다른 새 Commit이 있어 자동 동기화하지 않았어요. 먼저 차이를 확인한 뒤 Merge 또는 Rebase가 필요합니다.",
        "비교 열기",
      );
      if (choice === "비교 열기") await openComparePanel(context);
      return;
    }
    if (tracking.kind === "unknown") {
      await vscode.window.showWarningMessage("원격 상태를 확인할 수 없어요. 먼저 원격 새로고침을 실행해주세요.");
      return;
    }

    if (tracking.kind === "no-upstream") {
      const remotes = await workflows.listRemotes(cwd);
      if (!remotes.length) {
        await vscode.window.showWarningMessage("연결된 원격 저장소가 없어요. 먼저 원격 저장소를 등록해주세요.");
        return;
      }
      const selected = remotes.length === 1
        ? remotes[0]
        : (await vscode.window.showQuickPick(remotes.map((remote) => ({ label: remote.name, description: remote.pushUrl ?? remote.fetchUrl, remote })), { placeHolder: "첫 Push를 보낼 원격 저장소를 선택하세요." }))?.remote;
      if (!selected || !state.branch) return;
      const ok = await confirmMutation({
        action: "첫 Push",
        target: `${selected.name}/${state.branch}`,
        effect: "현재 로컬 브랜치를 원격에도 만들고 서로 연결합니다. 이후에는 Push/Pull 대상이 자동으로 정해집니다.",
        confirmLabel: "원격에도 만들기",
      });
      if (!ok) return;
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Git Next · 동기화 · 첫 Push",
        cancellable: false,
      }, () => workflows.runWithGitStateDelta(cwd, () => actions.pushWithUpstream(cwd, selected.name, state.branch)));
      await vscode.window.showInformationMessage(result.message);
      return;
    }

    const action = tracking.kind === "ahead" ? "push" : tracking.kind === "behind" ? "pull" : null;
    if (!action) {
      await vscode.window.showInformationMessage("현재 상태에서는 자동 동기화할 작업이 없습니다.");
      return;
    }

    const preflight = action === "push"
      ? await safety.preflightPushSafety(cwd)
      : await safety.preflightPullSafety(cwd);
    if (preflight.level === "blocked") {
      await vscode.window.showWarningMessage(preflight.message ?? "안전 검사를 통과하지 못해 동기화를 중단했습니다.", { modal: true });
      return;
    }

    const count = action === "push" ? tracking.ahead : tracking.behind;
    const ok = await confirmMutation({
      action: action === "push" ? "동기화 · Push" : "동기화 · Pull",
      target: state.upstream ?? state.branch ?? "현재 브랜치",
      effect: action === "push"
        ? `로컬에만 있는 Commit ${count}개를 원격에 보냅니다.`
        : `원격에만 있는 Commit ${count}개를 현재 로컬 브랜치로 받아옵니다.`,
      confirmLabel: action === "push" ? "Push" : "Pull",
    });
    if (!ok) return;

    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Git Next · 동기화 · ${action === "push" ? "Push" : "Pull"}`,
      cancellable: false,
    }, () => workflows.runWithGitStateDelta(
      cwd,
      () => action === "push" ? actions.pushRepository(cwd) : actions.pullRepository(cwd),
    ));
    await vscode.window.showInformationMessage(result.message);
  };

  const refreshRemoteBranches = async (cwd) => {
    const remotes = await workflows.listRemotes(cwd);
    if (!remotes.length) {
      await vscode.window.showWarningMessage("연결된 원격 저장소가 없어요.");
      return;
    }
    const remote = remotes.length === 1
      ? remotes[0]
      : (await vscode.window.showQuickPick(remotes.map((item) => ({ label: item.name, description: item.fetchUrl, item })), { placeHolder: "새로고침할 원격 저장소를 선택하세요." }))?.item;
    if (!remote) return;
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Git Next · 원격 새로고침 (${remote.name})`,
      cancellable: false,
    }, () => actions.fetchPruneRemote(cwd, remote.name));
    await vscode.window.showInformationMessage(result.message);
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    const state = await getState(cwd);
    if (message?.type === "sync") {
      await syncCurrentBranch(cwd, state, message.branch, message.kind);
      await refreshState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "refresh-remote") {
      await refreshRemoteBranches(cwd);
      await refreshState(cwd).catch(() => {});
      return refresh();
    }
    if (message?.type === "create") {
      const name = await askName("새 브랜치 이름", async (value) => {
        const check = await actions.validateBranchName(cwd, value);
        return check.ok ? null : check.message;
      });
      if (!name) return;
      const ok = await confirmMutation({ action: "브랜치 만들기", target: name, effect: "현재 로컬에 새로운 브랜치를 생성합니다. (원격에는 생성되지 않아요)\nPush할 때 원격에도 브랜치가 생성됩니다.", confirmLabel: "브랜치 만들기" });
      if (!ok) return;
      const result = await runBranchMutation(() => actions.createBranch(cwd, name, "HEAD"));
      if (result?.skipped) return;
      void (result.ok ? vscode.window.showInformationMessage(result.message) : vscode.window.showWarningMessage(result.message));
      return refresh();
    }
    if (!message.branch) return;
    if (message?.type === "merge") {
      if (!state.branch || message.branch === state.branch) {
        vscode.window.showInformationMessage("현재 브랜치는 자기 자신과 Merge할 수 없습니다.");
        return;
      }
      const guard = await guardWorkingState(cwd, "merge");
      if (!guard.ok) {
        if (guard.code === "operation-in-progress") {
          await getMenus().conflictHelper(panel, "graph", {});
        } else {
          vscode.window.showWarningMessage(guard.message);
        }
        return;
      }
      const preview = await workflows.getIntegrationPreview(cwd, message.branch);
      if (!preview.ok) {
        vscode.window.showWarningMessage(preview.message);
        return;
      }
      const ok = await confirmMutation({
        action: "브랜치 Merge",
        target: `${message.branch} → ${state.branch}`,
        effect: workflows.formatIntegrationPreview(preview, "merge"),
        risk: preview.conflictRisk
          ? "충돌 가능성이 있습니다. 충돌 시 기존 Continue / Abort 흐름에서 정리합니다."
          : "선택한 브랜치의 커밋을 현재 브랜치에 반영합니다.",
        level: preview.conflictRisk ? "warning" : "safe",
        confirmLabel: "Merge 실행",
      });
      if (!ok) return;
      const result = await runBranchMutation(() => workflows.runWithGitStateDelta(cwd, () => workflows.mergeIntoCurrent(cwd, message.branch)));
      if (result?.skipped) return;
      void (result.ok ? vscode.window.showInformationMessage(result.message) : vscode.window.showWarningMessage(result.message));
      return refresh();
    }
    if (message?.type === "track" && message.kind === "remote") {
      const created = await createTrackingBranchFromRemote(cwd, message.branch);
      if (created) return refresh();
      return;
    }
    if (message?.type === "switch") {
      if (message.branch === state.branch) {
        vscode.window.showInformationMessage("이미 현재 브랜치입니다.");
        return;
      }

      const operation = await safety.getInProgressOperation(cwd);
      if (operation) {
        void vscode.window.showWarningMessage(`현재 ${operation.operation} 작업이 진행 중이에요. 먼저 그 작업을 끝낸 뒤 브랜치를 이동해주세요.`);
        return;
      }

      const changes = await safety.getWorkingTreeChanges(cwd);
      const ok = await confirmMutation({
        action: "브랜치 전환",
        target: message.branch,
        effect: "작업 위치를 선택한 브랜치로 변경합니다.",
        risk: changes.length
          ? `커밋하지 않은 변경 ${changes.length}개도 함께 이동합니다. 대상 브랜치의 파일과 겹쳐 덮어쓸 위험이 있으면 Git이 자동으로 이동을 중단합니다.`
          : "",
        confirmLabel: "전환",
      });
      if (!ok) return;

      const switched = await runBranchMutation(async () => {
        const result = await workflows.runWithGitStateDelta(cwd, () => actions.checkoutBranch(cwd, message.branch));
        const after = await refreshState(cwd);
        if (!result.ok || after.branch !== message.branch) {
          const detail = "detail" in result && result.detail ? `\n${result.detail}` : "";
          void vscode.window.showWarningMessage(`${result.message}${detail}`);
          return false;
        }
        void vscode.window.showInformationMessage(`'${message.branch}' 브랜치로 이동했어요. 커밋하지 않은 변경도 그대로 유지됩니다.`);
        return true;
      });

      if (switched?.skipped) return;
      return refresh();
    }
    if (message?.type === "rename") {
      const next = await vscode.window.showInputBox({ prompt: "새 브랜치 이름", value: message.branch });
      if (!next || next === message.branch) return;
      const ok = await confirmMutation({ action: "브랜치 이름 변경", target: `${message.branch} → ${next}`, effect: "로컬 브랜치 이름을 변경합니다.", confirmLabel: "이름 변경" });
      if (!ok) return;
      const result = await runBranchMutation(() => actions.renameBranch(cwd, message.branch, next));
      if (result?.skipped) return;
      void (result.ok ? vscode.window.showInformationMessage(result.message) : vscode.window.showWarningMessage(result.message));
      return refresh();
    }
    if (message?.type === "delete") {
      const info = await actions.getBranchDeleteInfo(cwd, message.branch);
      const { getProtectedBranchGuard } = await import("./git-safety.mjs");
      const protectedGuard = getProtectedBranchGuard(
        "delete-branch",
        message.branch,
        vscode.workspace.getConfiguration("gitNext").get("protectedBranches", ["main", "master", "release/*"]),
      );
      const baseRisk = info.merged
        ? "현재 브랜치에 이미 합쳐진 브랜치입니다."
        : `병합되지 않은 커밋 ${info.uniqueCommitCount ?? "알 수 없음"}개가 남아 있을 수 있습니다.`;
      const ok = await confirmMutation({
        action: protectedGuard.protected ? "보호 브랜치 삭제" : "브랜치 삭제",
        target: message.branch,
        effect: "선택한 로컬 브랜치를 삭제합니다.",
        risk: protectedGuard.protected ? `${baseRisk} ${protectedGuard.message}` : baseRisk,
        level: "warning",
        confirmLabel: protectedGuard.protected
          ? (info.merged ? "보호 브랜치 삭제" : "보호 브랜치 강제 삭제")
          : (info.merged ? "삭제" : "강제 삭제"),
      });
      if (!ok) return;
      const result = await runBranchMutation(() => actions.deleteBranch(cwd, message.branch, !info.merged));
      if (result?.skipped) return;
      void (result.ok ? vscode.window.showInformationMessage(result.message) : vscode.window.showWarningMessage(result.message));
      return refresh();
    }
  });

  void refresh();
  context.subscriptions.push(panel);
}

async function openStashWorkspace(context) {
  const { renderStashWorkspace } = await import("./workspace-views.mjs");
  const actions = await import("./git-actions.mjs");
  const workflows = await import("./git-workflows.mjs");
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.stashes",
    "Git Next · Stash",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  if (!created) return;
  let selected = null;
  let notice = null;
  const refresh = async () => {
    const cwd = getCwd();
    const stashes = cwd ? await actions.listStashes(cwd) : [];
    const details = cwd && selected ? await workflows.getStashDetails(cwd, selected) : null;
    setWebviewHtml(panel.webview, renderStashWorkspace(stashes, details, notice));
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    if (message?.type === "select") {
      selected = message.ref;
      return refresh();
    }
    if (message?.type === "push") {
      const changes = await (await import("./git-safety.mjs")).getWorkingTreeChanges(cwd);
      if (!changes.length) return vscode.window.showInformationMessage("Stash할 변경이 없습니다.");
      const memo = await promptStashMessage();
      if (memo === undefined) return;
      const preview = workflows.formatStashPreview(changes, memo);
      const ok = await confirmMutation({
        action: "Stash 저장",
        target: `${changes.length}개 변경 파일`,
        effect: preview,
        confirmLabel: "Stash",
      });
      if (!ok) return;
      const result = await actions.stashPush(cwd, memo);
      notice = result;
      selected = null;
      return refresh();
    }
    if (!message.ref) return;
    if (message?.type === "apply" || message?.type === "pop") {
      const guard = await guardWorkingState(cwd, "stash-apply");
      if (!guard.ok) {
        if (guard.code === "operation-in-progress") {
          await getMenus().conflictHelper(panel, "graph", {});
        } else {
          vscode.window.showWarningMessage(guard.message);
        }
        return;
      }
      const preview = await workflows.getStashDetails(cwd, message.ref);
      const ok = await confirmMutation(stashActionConfirmation(preview, message.type));
      if (!ok) return;
      const result = await (message.type === "apply" ? actions.stashApply(cwd, message.ref) : actions.stashPop(cwd, message.ref));
      const remaining = await actions.listStashes(cwd);
      notice = {
        ...result,
        detail: message.type === "pop"
          ? result.ok
            ? remaining.length
              ? `선택한 Stash는 제거되었습니다. 아직 ${remaining.length}개가 남아 있고, 목록 번호는 자동으로 다시 매겨집니다. 그래서 다른 항목이 새 stash@{0}으로 보일 수 있습니다.`
              : "선택한 Stash를 복원하고 목록에서도 제거했습니다. 남은 Stash는 없습니다."
            : "Pop이 충돌 또는 오류로 끝나면 Git은 작업 유실을 막기 위해 해당 Stash를 목록에 남깁니다. 충돌을 정리하고 결과를 확인한 뒤, 더 이상 필요 없으면 Drop으로 삭제하세요."
          : "Apply는 변경만 복원하고 Stash 항목은 의도적으로 그대로 남깁니다. 복원 결과를 확인한 뒤 더 이상 필요 없으면 Drop으로 정리할 수 있습니다.",
      };
      if (message.type === "pop" && result.ok) selected = null;
      return refresh();
    }
    if (message?.type === "drop") {
      const ok = await confirmMutation({ action: "Stash Drop", target: message.ref, effect: "Stash 항목을 삭제합니다.", risk: "삭제 후 목록에서 복원할 수 없습니다.", level: "warning", confirmLabel: "Drop" });
      if (!ok) return;
      const result = await actions.stashDrop(cwd, message.ref);
      notice = result;
      selected = null;
      return refresh();
    }
  });

  await refresh();
  context.subscriptions.push(panel);
}

async function openCommitFileDiff(cwd, details, file) {
  const workflows = await import("./git-workflows.mjs");
  const parent = details.parents[0] ?? null;
  const status = String(file.status ?? "");
  const beforePath = file.oldPath ?? file.path;

  let beforeContent = "";
  if (parent && !status.startsWith("A")) {
    const before = await workflows.readGitFile(cwd, parent, beforePath);
    beforeContent = before.ok ? before.content : "";
  }

  let afterContent = "";
  if (!status.startsWith("D")) {
    const after = await workflows.readGitFile(cwd, details.id, file.path);
    afterContent = after.ok ? after.content : "";
  }

  const language = vscode.window.activeTextEditor?.document.languageId ?? "plaintext";
  const [beforeDoc, afterDoc] = await Promise.all([
    vscode.workspace.openTextDocument({ content: beforeContent, language }),
    vscode.workspace.openTextDocument({ content: afterContent, language }),
  ]);

  await vscode.commands.executeCommand(
    "vscode.diff",
    beforeDoc.uri,
    afterDoc.uri,
    `${file.path} · Before ↔ ${details.id.slice(0, 7)}`,
  );
}

async function openCommitDetailsPanel(context, commit) {
  const { renderCommitDetailsWorkspace } = await import("./workspace-views.mjs");
  const workflows = await import("./git-workflows.mjs");
  const cwd = getCwd();
  const details = cwd
    ? await workflows.getCommitDetails(cwd, commit)
    : { ok: false, message: "Git 저장소가 없습니다.", files: [] };

  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.commitDetails",
    `Git Next · Commit ${String(commit ?? "").slice(0, 7)}`,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.title = `Git Next · Commit ${String(commit ?? "").slice(0, 7)}`;
  commitDetailsByPanel.set(panel, details);
  setWebviewHtml(panel.webview, renderCommitDetailsWorkspace(details));

  if (!created) return;
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.type === "back-to-graph") {
      panel.dispose();
      await vscode.commands.executeCommand("gitNext.open");
      return;
    }
    const cwd = getCwd();
    const currentDetails = commitDetailsByPanel.get(panel);
    if (!cwd || !currentDetails?.ok || message?.type !== "open-commit-diff") return;
    const file = currentDetails.files.find((item) =>
      item.path === message.path && (item.oldPath ?? null) === (message.oldPath ?? null)
    );
    if (!file) return;
    await openCommitFileDiff(cwd, currentDetails, file);
  });

  context.subscriptions.push(panel);
}

async function openKnowledgePanel(context, selected = null, tab = "terms") {
  const { renderKnowledgeCenter, buildKnowledgeLiveContext } = await import("./workspace-views.mjs");
  const cwd = getCwd();

  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.knowledge",
    "Git Next · 도움말",
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const view = { tab: selected ? "guides" : tab, selected };
  setWebviewHtml(panel.webview, renderKnowledgeCenter({
    ...view,
    state: null,
    loadingLiveContext: Boolean(cwd),
  }));

  if (created) context.subscriptions.push(panel);
  if (!cwd) return;

  void traceAsync("help:live-context", cwd, () => getState(cwd))
    .then((state) => panel.webview.postMessage({
      type: "knowledgeLiveContext",
      payload: buildKnowledgeLiveContext(state),
    }))
    .catch(() => panel.webview.postMessage({
      type: "knowledgeLiveContext",
      payload: { status: "unavailable", termExamples: {}, matchedScenarioIds: [] },
    }));
}
async function openGuidePanel(context, selected = null) {
  const { renderGuideHtml } = await import("./git-guide.mjs");
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.knowledge",
    "Git Next · 도움말",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  setWebviewHtml(panel.webview, renderGuideHtml(selected));
  if (!created) return;
  context.subscriptions.push(panel);
}


  return {
    openChangesPanel,
    openLocalRemoteDiff,
    openWorkingTreeDiff,
    openComparePanel,
    openBranchWorkspace,
    openStashWorkspace,
    openCommitDetailsPanel,
    openKnowledgePanel,
    openGuidePanel,
    openAiDiagnosisPanel,
    openAiPracticePanel,
    openAiHistoryPanel,
    getDiffDocumentContent: (uri) => diffDocumentContents.get(uri.query) ?? "",
  };
}

module.exports = { createPanelHandlers };
