const vscode = require("vscode");
const { createAiPanelHandlers } = require("./ai-panel-handlers.js");

function createPanelHandlers(core, getMenus) {
  const {
    getCwd,
    getState,
    getOrCreateWebviewPanel,
    renderPatchableWebview,
    setWebviewHtml,
    recordActivity,
    confirmMutation,
    guardWorkingState,
  } = core;
  const askName = (...args) => getMenus().askName(...args);
  const openMarkdown = (...args) => getMenus().openMarkdown(...args);
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
  let diffDocumentId = 0;
  const { openAiDiagnosisPanel, openAiPracticePanel, openAiHistoryPanel } = createAiPanelHandlers(
    core,
    getMenus,
    (...args) => openGuidePanel(...args),
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
  const refresh = async () => {
    const cwd = getCwd();
    await renderPatchableWebview(
      panel.webview,
      cwd
        ? renderChangesWorkspace(await workflows.getChangeWorkspace(cwd), notice)
        : renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, { message: "Git 저장소가 없습니다." }),
    );
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    notice = null;

    if (message?.type === "refresh") return refresh();
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
      const result = message.type === "stage"
        ? await workflows.stageFile(cwd, message.path)
        : await workflows.unstageFile(cwd, message.path);
      notice = result;
      await recordActivity(result);
      return refresh();
    }
    if (message?.type === "stage-all" || message?.type === "unstage-all") {
      const result = message.type === "stage-all"
        ? await workflows.stageAll(cwd)
        : await workflows.unstageAll(cwd);
      notice = result;
      await recordActivity(result);
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
      return refresh();
    }
    if (message?.type === "undo-commit") {
      const undo = await workflows.getUndoContext(cwd);
      if (undo.headIsInUpstream) {
        notice = { ok: false, message: "마지막 Commit이 이미 Remote에 포함되어 있습니다. Commit 취소 대신 Revert를 사용하세요." };
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
  const { renderBranchWorkspace } = await import("./workspace-views.mjs");
  const actions = await import("./git-actions.mjs");
  const workflows = await import("./git-workflows.mjs");
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.branches",
    "Git Next · Branch",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  if (!created) return;
  const refresh = async () => {
    const cwd = getCwd();
    const state = cwd ? await getState(cwd) : { refs: [], branch: null };
    setWebviewHtml(panel.webview, renderBranchWorkspace(state));
  };
  const createTrackingBranchFromRemote = async (cwd, remoteRef) => {
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
    const ok = await confirmMutation({ action: "Remote 브랜치 전환", target: `${remoteRef} → ${name}`, effect: "추적 로컬 브랜치를 만들고 전환합니다.", confirmLabel: "전환" });
    if (!ok) return false;
    const result = await workflows.runWithGitStateDelta(cwd, () => actions.createTrackingBranch(cwd, name, remoteRef));
    vscode.window.showInformationMessage(result.message);
    return result.ok;
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    const state = await getState(cwd);
    if (message?.type === "remote-settings") {
      await getMenus().remoteMenu(panel, "graph", {});
      return refresh();
    }
    if (message?.type === "cleanup") {
      const review = await actions.getBranchCleanupCandidates(cwd);
      if (!review.ok) return vscode.window.showWarningMessage(review.message);
      if (!review.candidates.length) return vscode.window.showInformationMessage("검토할 브랜치 정리 후보가 없습니다.");
      const candidate = await vscode.window.showQuickPick(review.candidates.map((item) => ({
        label: item.name,
        description: `${item.safe ? "안전 후보" : "확인 필요"} · ${item.reasons.join(" · ")}`,
        item,
      })), { placeHolder: "브랜치 정리 후보를 검토하세요." });
      if (!candidate) return;
      const info = await actions.getBranchDeleteInfo(cwd, candidate.item.name);
      const ok = await confirmMutation({
        action: "브랜치 정리",
        target: candidate.item.name,
        effect: "선택한 로컬 브랜치를 삭제합니다.",
        risk: info.merged
          ? candidate.item.reasons.join(" · ")
          : `${candidate.item.reasons.join(" · ")} · 병합되지 않은 커밋 ${info.uniqueCommitCount ?? "알 수 없음"}개가 남아 있을 수 있습니다.`,
        level: "warning",
        confirmLabel: info.merged ? "삭제" : "강제 삭제",
      });
      if (!ok) return;
      await actions.deleteBranch(cwd, candidate.item.name, !info.merged);
      return refresh();
    }
    if (message?.type === "create") {
      const name = await askName("새 브랜치 이름", async (value) => {
        const check = await actions.validateBranchName(cwd, value);
        return check.ok ? null : check.message;
      });
      if (!name) return;
      const ok = await confirmMutation({ action: "브랜치 만들기", target: name, effect: "현재 HEAD에서 새 로컬 브랜치를 만듭니다.", confirmLabel: "브랜치 만들기" });
      if (!ok) return;
      await actions.createBranch(cwd, name, "HEAD");
      return refresh();
    }
    if (!message.branch) return;
    if (message?.type === "compare") {
      const current = state.branch;
      if (!current) return;
      const comparison = await workflows.compareBranches(cwd, current, message.branch);
      const files = comparison.files.map((f) => `- \`${f.status}\` ${f.path}`).join("\n") || "- 없음";
      await openMarkdown(`브랜치 비교 · ${current} ↔ ${message.branch}`, [
        `**${current}에만 있는 커밋:** ${comparison.baseCount}개`,
        `**${message.branch}에만 있는 커밋:** ${comparison.otherCount}개`,
        "",
        "## 변경 파일",
        files,
      ].join("\n"));
      return;
    }
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
      const result = await workflows.runWithGitStateDelta(cwd, () => workflows.mergeIntoCurrent(cwd, message.branch));
      vscode.window.showInformationMessage(result.message);
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
      const guard = await guardWorkingState(cwd, "switch-branch");
      if (!guard.ok) {
        if (guard.code === "operation-in-progress") {
          await getMenus().conflictHelper(panel, "graph", {});
        } else {
          vscode.window.showWarningMessage(guard.message);
        }
        return;
      }
      if (message.kind === "remote") {
        const created = await createTrackingBranchFromRemote(cwd, message.branch);
        if (!created) return;
      } else {
        const ok = await confirmMutation({ action: "브랜치 전환", target: message.branch, effect: "작업 위치를 선택한 브랜치로 변경합니다.", confirmLabel: "전환" });
        if (!ok) return;
        const result = await workflows.runWithGitStateDelta(cwd, () => actions.checkoutBranch(cwd, message.branch));
        vscode.window.showInformationMessage(result.message);
      }
      return refresh();
    }
    if (message?.type === "rename") {
      const next = await vscode.window.showInputBox({ prompt: "새 브랜치 이름", value: message.branch });
      if (!next || next === message.branch) return;
      const ok = await confirmMutation({ action: "브랜치 이름 변경", target: `${message.branch} → ${next}`, effect: "로컬 브랜치 이름을 변경합니다.", confirmLabel: "이름 변경" });
      if (!ok) return;
      await actions.renameBranch(cwd, message.branch, next);
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
        ? "현재 HEAD에 병합된 브랜치입니다."
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
      await actions.deleteBranch(cwd, message.branch, !info.merged);
      return refresh();
    }
  });

  await refresh();
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
  const refresh = async () => {
    const cwd = getCwd();
    const stashes = cwd ? await actions.listStashes(cwd) : [];
    const details = cwd && selected ? await workflows.getStashDetails(cwd, selected) : null;
    setWebviewHtml(panel.webview, renderStashWorkspace(stashes, details));
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
      await actions.stashPush(cwd, memo);
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
      await (message.type === "apply" ? actions.stashApply(cwd, message.ref) : actions.stashPop(cwd, message.ref));
      return refresh();
    }
    if (message?.type === "drop") {
      const ok = await confirmMutation({ action: "Stash Drop", target: message.ref, effect: "Stash 항목을 삭제합니다.", risk: "삭제 후 목록에서 복원할 수 없습니다.", level: "warning", confirmLabel: "Drop" });
      if (!ok) return;
      await actions.stashDrop(cwd, message.ref);
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
      await openGraphPanel(context);
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
  const { renderKnowledgeCenter } = await import("./workspace-views.mjs");
  const cwd = getCwd();
  const state = cwd ? await getState(cwd) : null;
  const { panel, created } = getOrCreateWebviewPanel(
    "gitNext.knowledge",
    "Git Next · 도움말",
    { enableScripts: true, retainContextWhenHidden: true },
  );
  setWebviewHtml(panel.webview, renderKnowledgeCenter({ tab: selected ? "guides" : tab, selected, state }));
  if (!created) return;
  context.subscriptions.push(panel);
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
