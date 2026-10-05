const vscode = require("vscode");

function createGitMenus(core, sync, panels, getWebviewHost) {
  const {
    getCwd,
    getState,
    confirmMutation,
    showResult,
    showStatefulResult,
    guardWorkingState,
    renderPanel,
    recordActivity,
    selectRepository,
    relaxedSafeGuardRules,
    getActiveContext,
  } = core;
  const { runSyncAction, withNetworkProgress, offerDivergedResolution } = sync;
  const { openComparePanel, openBranchWorkspace, openStashWorkspace, openGuidePanel, openAiDiagnosisPanel } = panels;
  const openGraphPanel = (...args) => getWebviewHost().openGraphPanel(...args);

async function askName(prompt, validateInput) {
  return vscode.window.showInputBox({
    prompt,
    ignoreFocusOut: true,
    validateInput,
  });
}

async function tagMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const state = await getState(cwd);
  const actions = await import("./git-actions.mjs");
  const tags = state.refs.filter((ref) => ref.kind === "tag");

  const action = await vscode.window.showQuickPick([
    { label: "태그 만들기", id: "create", description: "현재 HEAD에 가벼운 태그를 붙입니다." },
    { label: "태그 삭제", id: "delete", description: "로컬 태그만 삭제합니다. 원격 태그는 건드리지 않습니다." },
  ], { placeHolder: "태그 작업을 선택하세요." });
  if (!action) return;

  if (action.id === "create") {
    const name = await askName("현재 HEAD에 붙일 태그 이름을 입력하세요.", async (value) => {
      const result = await actions.validateTagName(cwd, value);
      if (!result.ok) return result.message;
      if (tags.some((ref) => ref.name === value.trim())) return "이미 존재하는 태그입니다.";
      return null;
    });
    if (!name) return;
    if (!await confirmMutation({
      action: "태그 만들기",
      target: name,
      effect: "현재 HEAD에 로컬 태그를 추가합니다.",
      risk: "Remote 태그는 아직 바뀌지 않습니다.",
      confirmLabel: "태그 만들기",
    })) return;
    await showResult(host, mode, options, await actions.createTag(cwd, name, "HEAD"));
    return;
  }

  const selected = await vscode.window.showQuickPick(tags.map((ref) => ({ label: ref.name, ref })), {
    placeHolder: "삭제할 로컬 태그를 선택하세요.",
  });
  if (!selected) return;
  const choice = await vscode.window.showWarningMessage(
    `로컬 태그 '${selected.ref.name}'를 삭제할까요? 원격 태그는 삭제되지 않습니다.`,
    { modal: true },
    "로컬 태그 삭제",
  );
  if (!choice) return;
  await showResult(host, mode, options, await actions.deleteTag(cwd, selected.ref.name));
}

async function commitMenu(host, mode, options, commit) {
  const cwd = getCwd();
  if (!cwd || !commit) return;
  const state = await getState(cwd);
  const actions = await import("./git-actions.mjs");

  const selected = await vscode.window.showQuickPick([
    { label: "브랜치에서 포함 여부 확인", id: "containment", description: "선택 커밋이 현재 브랜치나 다른 ref에 있는지 확인합니다." },
    { label: "이 커밋에서 브랜치 만들기", id: "branch", description: "현재 작업 위치는 바뀌지 않습니다." },
    { label: "이 커밋에 태그 만들기", id: "tag", description: "선택한 커밋에 이름표를 붙입니다." },
    { label: "Cherry-pick", id: "cherry", description: `이 커밋의 변경만 현재 브랜치 '${state.branch ?? "알 수 없음"}'에 복사합니다.` },
    { label: "Revert", id: "revert", description: "기존 기록은 유지하고 반대 변경의 새 커밋을 만듭니다." },
  ], { placeHolder: `커밋 ${commit.slice(0, 7)} 작업` });
  if (!selected) return;

  if (selected.id === "containment") {
    const workflows = await import("./git-workflows.mjs");
    const refs = [
      { label: `현재 브랜치 (${state.branch ?? "Detached HEAD"})`, ref: "HEAD" },
      ...state.refs.map((ref) => ({ label: ref.name, description: ref.kind, ref: ref.fullName })),
    ];
    const target = await vscode.window.showQuickPick(refs, { placeHolder: "포함 여부를 확인할 브랜치 또는 ref 선택" });
    if (!target) return;
    const result = await workflows.getCommitContainment(cwd, commit, target.ref);
    if (!result.ok) {
      await vscode.window.showWarningMessage("Commit 또는 선택한 ref를 확인할 수 없습니다.");
      return;
    }

    const relation = result.contained
      ? `${commit.slice(0, 7)}은 '${target.label}'에 이미 포함되어 있습니다.`
      : `${commit.slice(0, 7)}은 '${target.label}'에 포함되지 않았습니다. 필요한 변경인지 확인한 뒤 Cherry-pick 후보로 검토하세요.`;
    const highlight = await vscode.window.showInformationMessage(relation, { modal: true }, "그래프에서 강조");
    if (highlight) await openGraphPanel(getActiveContext(), { focus: "selected-commit", focusCommitId: commit });
    return;
  }

  if (selected.id === "branch") {
    const name = await askName("선택한 커밋에서 만들 새 브랜치 이름을 입력하세요.", async (value) => {
      const result = await actions.validateBranchName(cwd, value);
      return result.ok ? null : result.message;
    });
    if (!name) return;
    if (!await confirmMutation({
      action: "브랜치 만들기",
      target: name,
      effect: `커밋 ${commit.slice(0, 7)}에서 새 로컬 브랜치를 만듭니다.`,
      confirmLabel: "브랜치 만들기",
    })) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.createBranch(cwd, name, commit));
    return;
  }

  if (selected.id === "tag") {
    const name = await askName("선택한 커밋에 붙일 태그 이름을 입력하세요.", async (value) => {
      const result = await actions.validateTagName(cwd, value);
      return result.ok ? null : result.message;
    });
    if (!name) return;
    if (!await confirmMutation({
      action: "태그 만들기",
      target: name,
      effect: `커밋 ${commit.slice(0, 7)}에 로컬 태그를 추가합니다.`,
      confirmLabel: "태그 만들기",
    })) return;
    await showResult(host, mode, options, await actions.createTag(cwd, name, commit));
    return;
  }

  const guard = await guardWorkingState(cwd, selected.id === "cherry" ? "checkout" : "reset");
  if (!guard.ok) {
    await renderPanel(host, { ok: false, level: "blocked", ...guard }, mode, options);
    return;
  }

  if (selected.id === "cherry") {
    const confirm = await vscode.window.showWarningMessage(
      `커밋 ${commit.slice(0, 7)}의 변경을 현재 브랜치 '${state.branch}'에 복사합니다. 충돌이 나면 파일 정리 후 cherry-pick --continue 또는 --abort가 필요할 수 있습니다.`,
      { modal: true },
      "Cherry-pick 실행",
    );
    if (!confirm) return;
    await showResult(host, mode, options, await actions.cherryPickCommit(cwd, commit));
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `커밋 ${commit.slice(0, 7)}을 Revert합니다. Reset과 달리 기존 기록은 지우지 않고 되돌림 커밋을 새로 만듭니다.`,
    { modal: true },
    "Revert 실행",
  );
  if (!confirm) return;
  await showStatefulResult(host, mode, options, cwd, () => actions.revertCommit(cwd, commit));
}


async function openMarkdown(title, content) {
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: `# ${title}\n\n${content}`,
  });
  await vscode.window.showTextDocument(document, { preview: true });
}

async function conflictHelper(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const safety = await import("./git-safety.mjs");
  const workflows = await import("./git-workflows.mjs");
  const [operation, files] = await Promise.all([
    safety.getInProgressOperation(cwd),
    workflows.listConflictedFiles(cwd),
  ]);
  if (!operation && !files.length) {
    await vscode.window.showInformationMessage("진행 중인 Git 작업과 충돌 파일이 없습니다.");
    return;
  }

  const choices = files.map((path) => ({ label: path, id: "file", path, description: "충돌 파일 · VS Code에서 정리" }));
  if (operation) {
    choices.unshift({
      label: `${operation.operation} 진행 중`,
      id: "status",
      description: `충돌 파일 ${files.length}개 · 계속 또는 취소를 선택하세요.`,
    });
    if (!files.length) choices.push({ label: `${operation.operation} 계속`, id: "continue" });
    choices.push({ label: `${operation.operation} 취소`, id: "abort" });
  }

  const selected = await vscode.window.showQuickPick(choices, {
    placeHolder: operation ? `${operation.operation} · 충돌 파일 ${files.length}개` : "충돌 파일 선택",
  });
  if (!selected || selected.id === "status") return;

  if (selected.id === "continue") {
    const preview = workflows.formatOperationActionPreview(operation.operation, "continue", files);
    const confirm = await vscode.window.showInformationMessage(
      preview,
      { modal: true },
      "계속 실행",
    );
    if (!confirm) return;
    await showResult(host, mode, options, await workflows.continueGitOperation(cwd, operation.operation));
    return;
  }

  if (selected.id === "abort") {
    const preview = workflows.formatOperationActionPreview(operation.operation, "abort", files);
    const confirm = await vscode.window.showWarningMessage(
      preview,
      { modal: true },
      "작업 취소",
    );
    if (!confirm) return;
    await showResult(host, mode, options, await workflows.abortGitOperation(cwd, operation.operation));
    return;
  }

  const side = await vscode.window.showQuickPick([
    { label: "내 변경 사용", id: "mine", description: "현재 브랜치 쪽 내용을 남깁니다." },
    { label: "들어온 변경 사용", id: "incoming", description: "Merge/Pull로 들어온 쪽 내용을 남깁니다." },
    { label: "직접 편집", id: "edit", description: "파일을 열어 원하는 최종 내용을 직접 정리합니다." },
  ], { placeHolder: selected.path });

  if (!side) return;
  if (side.id === "edit") {
    const uri = vscode.Uri.file(require("node:path").join(cwd, selected.path));
    await vscode.window.showTextDocument(uri, { preview: false });
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `${selected.path}에서 '${side.label}'을 적용합니다. 반대쪽 변경은 파일에서 제거될 수 있습니다.`,
    { modal: true },
    "적용",
  );
  if (!confirm) return;
  await showResult(host, mode, options, await workflows.resolveConflictSide(cwd, selected.path, side.id === "mine" ? "mine" : "incoming"));
}

async function undoMenu(host, mode, options, preferredId = null, recoveryPoint = null) {
  const cwd = getCwd();
  if (!cwd) return;
  const workflows = await import("./git-workflows.mjs");
  const safety = await import("./git-safety.mjs");
  const actions = await import("./git-actions.mjs");
  const choices = [
    { label: "마지막 로컬 Commit 취소", id: "commit", description: "Push 전 커밋을 취소하고 파일 변경은 남깁니다." },
    { label: "복구 지점에서 브랜치 만들기", id: "recovery", description: "Reset 전에 저장된 로컬 커밋 위치를 새 브랜치로 보존합니다." },
    { label: "파일 하나 변경 되돌리기", id: "file", description: "선택 파일의 커밋하지 않은 변경을 버립니다." },
    { label: "이미 Push한 Commit 되돌리기", id: "pushed", description: "기록을 지우지 않고 Revert 커밋을 만듭니다." },
    { label: "추적 중인 모든 변경 버리기", id: "discard", description: "새 untracked 파일은 남기고 tracked 변경만 버립니다." },
  ];
  if (preferredId === "reflog") return reflogMenu(host, mode, options);
  const choice = preferredId
    ? choices.find((item) => item.id === preferredId)
    : await vscode.window.showQuickPick(choices, { placeHolder: "무엇을 되돌리고 싶나요?" });
  if (!choice) return;

  if (choice.id === "commit") {
    const context = await workflows.getUndoContext(cwd);
    if (context.headIsInUpstream) {
      vscode.window.showWarningMessage("마지막 커밋이 이미 원격 기록에 포함된 것 같습니다. Reset 대신 Revert를 사용하세요.");
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      "마지막 로컬 커밋만 취소하고 파일 변경은 그대로 남깁니다.",
      { modal: true },
      "Commit 취소",
    );
    if (!confirm) return;
    const point = await workflows.createRecoveryPoint(cwd, "undo-local-commit");
    if (!point.ok) {
      await showResult(host, mode, options, point);
      return;
    }
    const result = await workflows.undoLastLocalCommit(cwd);
    await showResult(host, mode, options, {
      ...result,
      recoveryPoint: point.name,
      message: result.ok ? `${result.message} ${point.message}` : result.message,
      detail: [point.commit, point.name, result.detail].filter(Boolean).join("\n"),
    });
    return;
  }

  if (choice.id === "recovery") {
    const points = await workflows.listRecoveryPoints(cwd);
    const availablePoints = recoveryPoint ? points.filter((point) => point.name === recoveryPoint) : points;
    const selected = await vscode.window.showQuickPick(availablePoints.map((point) => ({
      label: point.name,
      description: point.subject,
      detail: point.commit,
      point,
    })), { placeHolder: "복구할 커밋 위치 선택" });
    if (!selected) return;
    const name = await askName("복구 지점에서 만들 새 브랜치 이름", async (value) => {
      const result = await actions.validateBranchName(cwd, value);
      return result.ok ? null : result.message;
    });
    if (!name) return;
    if (!await confirmMutation({
      action: "복구 브랜치 만들기",
      target: selected.point.name,
      effect: `복구 커밋 ${selected.point.commit.slice(0, 7)}에서 로컬 브랜치 '${name}'를 만듭니다. 현재 파일과 브랜치는 바뀌지 않습니다.`,
      confirmLabel: "브랜치 만들기",
    })) return;
    await showResult(host, mode, options, await actions.createBranch(cwd, name, selected.point.commit));
    return;
  }

  if (choice.id === "file") {
    const changes = await safety.getWorkingTreeChanges(cwd);
    const selected = await vscode.window.showQuickPick(changes.map((item) => ({ label: item.path, item })), {
      placeHolder: "변경을 버릴 파일",
    });
    if (!selected) return;
    const confirm = await vscode.window.showWarningMessage(
      `${selected.item.path}의 커밋하지 않은 변경을 버립니다. 되돌릴 수 없을 수 있습니다.`,
      { modal: true },
      "변경 버리기",
    );
    if (!confirm) return;
    await showStatefulResult(host, mode, options, cwd, () => workflows.restoreFile(cwd, selected.item.path));
    return;
  }

  if (choice.id === "pushed") {
    const confirm = await vscode.window.showWarningMessage(
      "현재 HEAD를 지우지 않고 반대 변경의 Revert 커밋을 새로 만듭니다.",
      { modal: true },
      "HEAD Revert",
    );
    if (!confirm) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.revertCommit(cwd, "HEAD"));
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    "추적 중인 파일의 모든 커밋하지 않은 변경을 버립니다. 새로 만든 untracked 파일은 남습니다.",
    { modal: true },
    "모든 tracked 변경 버리기",
  );
  if (!confirm) return;
  await showStatefulResult(host, mode, options, cwd, () => workflows.discardTrackedChanges(cwd));
}

async function recoveryMenu(host, mode, options) {
  const choice = await vscode.window.showQuickPick([
    { label: "Undo / 되돌리기", id: "undo", description: "Commit, 파일 변경, tracked 변경을 안전하게 되돌립니다." },
    { label: "Reflog 복구", id: "reflog", description: "과거 커밋 위치에서 새 복구 브랜치를 만듭니다." },
    { label: "진행 중 작업 / Conflict 복구", id: "conflict", description: "Merge, Rebase, Cherry-pick, Revert의 Continue / Abort 및 충돌 정리를 엽니다." },
  ], { placeHolder: "복구 방법을 선택하세요." });
  if (!choice) return;
  if (choice.id === "reflog") return reflogMenu(host, mode, options);
  if (choice.id === "conflict") return conflictHelper(host, mode, options);
  return undoMenu(host, mode, options);
}

async function retryTimelineAction(host, mode, options, item) {
  if (item.action === "push" || item.action === "pull") return runSyncAction(host, item.action, mode, options);
  if (item.action === "commit") return commitHelper(host, mode, options);
  if (item.action.startsWith("stash")) return openStashWorkspace(getActiveContext());
  if (item.action.includes("branch")) return openBranchWorkspace(getActiveContext());
  if (item.action.includes("remote")) return remoteMenu(host, mode, options);
  if (item.action.includes("tag")) return tagMenu(host, mode, options);
  if (/^stage|^unstage/.test(item.action)) return vscode.commands.executeCommand("workbench.view.scm");
  return gitDoctor(host, getActiveContext(), mode, options);
}

async function timelineView(host, mode, options) {
  const items = getActiveContext()?.workspaceState.get("gitNext.activity", []) ?? [];
  if (!items.length) {
    await openMarkdown("Git 작업 타임라인", "아직 Git Next에서 실행한 작업 기록이 없습니다.");
    return;
  }

  const { getUndoRecommendation, getRetryCheck } = await import("./git-workflows.mjs");
  const selected = await vscode.window.showQuickPick(items.map((item) => {
    const recommendation = getUndoRecommendation(item);
    return {
      label: `${item.ok ? "성공" : "실패/차단"} · ${item.action}`,
      description: item.message,
      detail: item.ok ? recommendation?.label ?? item.at : `재시도 전 확인: ${item.retryCheck ?? getRetryCheck(item)}`,
      item,
      recommendation,
    };
  }), { placeHolder: "Git 작업 타임라인 · 실패 원인과 다시 확인할 조건" });
  if (!selected) return;
  if (!selected.item.ok) {
    const retry = await vscode.window.showWarningMessage(
      `${selected.item.message}\n재시도 전 확인: ${selected.item.retryCheck ?? getRetryCheck(selected.item)}`,
      { modal: true },
      "확인 후 다시 시도",
    );
    if (retry) await retryTimelineAction(host, mode, options, selected.item);
    return;
  }
  if (!selected.recommendation) return;

  const { recommendation, item } = selected;
  const start = await vscode.window.showInformationMessage(
    `${recommendation.label}\n${recommendation.reason}`,
    { modal: true },
    "복구 시작",
  );
  if (!start) return;
  await undoMenu(host, mode, options, recommendation.id, item.recoveryPoint);
}

async function reflogMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const workflows = await import("./git-workflows.mjs");
  const actions = await import("./git-actions.mjs");
  const rows = await workflows.listReflog(cwd);
  const selected = await vscode.window.showQuickPick(rows.map((row) => ({
    label: row.subject || row.ref,
    description: `${row.relative} · ${row.id.slice(0, 7)}`,
    detail: row.ref,
    row,
  })), { placeHolder: "복구할 과거 위치를 선택하세요. 기존 브랜치는 건드리지 않습니다." });
  if (!selected) return;

  const name = await vscode.window.showInputBox({
    prompt: "선택한 과거 커밋에서 새 복구 브랜치를 만듭니다.",
    value: `recovery-${selected.row.id.slice(0, 7)}`,
  });
  if (!name) return;
  if (!await confirmMutation({
    action: "복구 브랜치 만들기",
    target: name,
    effect: `과거 커밋 ${selected.row.id.slice(0, 7)}에서 새 로컬 브랜치를 만듭니다.`,
    confirmLabel: "복구 브랜치 만들기",
  })) return;
  await showResult(host, mode, options, await actions.createBranch(cwd, name, selected.row.id));
}

async function remoteMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const workflows = await import("./git-workflows.mjs");
  const state = await getState(cwd);
  const remotes = await workflows.listRemotes(cwd);
  const choice = await vscode.window.showQuickPick([
    { label: "Remote 목록 보기", id: "list" },
    { label: "Fetch 및 사라진 추적 정보 정리", id: "fetch" },
    { label: "Remote 추가", id: "add" },
    { label: "Remote 이름 변경", id: "rename" },
    { label: "Remote 제거", id: "remove" },
  ], { placeHolder: "Remote 관리" });
  if (!choice) return;

  if (choice.id === "list") {
    await openMarkdown("Remote 목록", remotes.map((r) => `- **${r.name}**\n  - fetch: ${r.fetchUrl ?? "-"}\n  - push: ${r.pushUrl ?? "-"}`).join("\n") || "등록된 Remote가 없습니다.");
    return;
  }

  if (choice.id === "add") {
    const name = await vscode.window.showInputBox({ prompt: "Remote 이름", value: "origin" });
    if (!name) return;
    const url = await vscode.window.showInputBox({ prompt: "Remote URL" });
    if (!url) return;
    if (!await confirmMutation({
      action: "Remote 추가",
      target: name,
      effect: `Remote URL을 등록합니다: ${url}`,
      confirmLabel: "Remote 추가",
    })) return;
    await showResult(host, mode, options, await workflows.addRemote(cwd, name, url));
    return;
  }

  const selected = await vscode.window.showQuickPick(remotes.map((r) => ({ label: r.name, r })), { placeHolder: "Remote 선택" });
  if (!selected) return;

  if (choice.id === "fetch") {
    if (!await confirmMutation({
      action: "Remote Fetch 및 정리",
      target: selected.r.name,
      effect: "Remote 추적 정보를 갱신하고 이미 사라진 Remote 브랜치 참조를 정리합니다.",
      confirmLabel: "Fetch 및 정리",
    })) return;
    const actions = await import("./git-actions.mjs");
    const fetched = await withNetworkProgress(
      `Git Next · Fetch · ${selected.r.name}`,
      async () => (await import("./git-workflows.mjs")).runWithGitStateDelta(
        cwd,
        () => actions.fetchPruneRemote(cwd, selected.r.name),
      ),
    );
    await showResult(host, mode, options, fetched, fetched.ok ? null : "blocked");
    return;
  }

  if (choice.id === "rename") {
    const next = await vscode.window.showInputBox({ prompt: "새 Remote 이름", value: selected.r.name });
    if (!next || next === selected.r.name) return;
    if (!await confirmMutation({
      action: "Remote 이름 변경",
      target: `${selected.r.name} → ${next}`,
      effect: "등록된 Remote 이름을 변경합니다.",
      confirmLabel: "이름 변경",
    })) return;
    await showResult(host, mode, options, await workflows.renameRemote(cwd, selected.r.name, next));
    return;
  }

  const upstreamRemote = state.upstream?.split("/")[0] ?? null;
  const confirm = await vscode.window.showWarningMessage(
    selected.r.name === upstreamRemote
      ? `현재 브랜치가 '${selected.r.name}'을 추적 중입니다. 제거하면 Pull/Push 연결이 끊깁니다.`
      : `Remote '${selected.r.name}'을 제거합니다.`,
    { modal: true },
    "Remote 제거",
  );
  if (!confirm) return;
  await showResult(host, mode, options, await workflows.removeRemote(cwd, selected.r.name));
}

async function commitHelper(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const workflows = await import("./git-workflows.mjs");
  const suggestion = await workflows.getCommitSuggestion(cwd);
  if (!suggestion.files.length) {
    vscode.window.showInformationMessage("Commit 메시지를 만들 변경이 없습니다.");
    return;
  }
  const hints = workflows.getCommitMessageHints(suggestion.subject);
  const hintText = hints.length ? ` 힌트: ${hints.join(" ")} 무시하고 그대로 진행해도 됩니다.` : "";
  const message = await vscode.window.showInputBox({
    prompt: `제안 메시지를 자유롭게 수정하세요.${hintText} Commit은 내 로컬 Git에만 저장되고 원격은 아직 바뀌지 않습니다.`,
    value: suggestion.subject,
  });
  if (!message) return;
  const confirm = await vscode.window.showInformationMessage(
    `이 메시지로 로컬 Commit을 만들까요?\n${message}`,
    { modal: true },
    "Commit",
  );
  if (!confirm) return;
  await showStatefulResult(host, mode, options, cwd, () => workflows.commitWithMessage(cwd, message));
}

async function pullRequestHandoff() {
  const cwd = getCwd();
  if (!cwd) return;
  const state = await getState(cwd);
  const workflows = await import("./git-workflows.mjs");
  const remotes = await workflows.listRemotes(cwd);
  const remoteName = state.upstream?.split("/")[0] ?? "origin";
  const remote = remotes.find((item) => item.name === remoteName) ?? remotes[0];
  const branch = state.branch;
  const url = workflows.derivePullRequestUrl(remote?.pushUrl ?? remote?.fetchUrl, branch, "main");
  const readiness = workflows.getPullRequestReadiness(state);
  const preview = state.upstream ? await workflows.getActionImpactPreview(cwd, "push") : null;
  const draft = workflows.createPullRequestDraft(branch, preview?.commits ?? []);

  const summary = [
    `PR 준비: ${readiness.ready ? "가능" : "확인 필요"}`,
    `브랜치: ${branch ?? "없음"}`,
    `원격: ${remote?.name ?? "없음"}`,
    `추적 상태: ${readiness.tracking} · ahead ${readiness.ahead} · behind ${readiness.behind}`,
    `작업 파일: ${readiness.dirtyCount}개 · 미추적 ${readiness.untrackedCount}개`,
    readiness.blockers.length ? `확인 필요\n${readiness.blockers.map((item) => `• ${item}`).join("\n")}` : null,
    readiness.warnings.length ? `참고\n${readiness.warnings.map((item) => `• ${item}`).join("\n")}` : null,
    readiness.nextActions.length ? `다음 작업\n${readiness.nextActions.map((item) => `• ${item}`).join("\n")}` : null,
    draft ? `제목 초안: ${draft.title}\n본문 초안\n${draft.body}` : null,
  ].filter(Boolean).join("\n");

  if (!url) {
    await vscode.window.showInformationMessage(`PR 준비 상태\n${summary}\n\n지원되는 GitHub/GitLab Remote URL을 찾지 못했습니다.`, { modal: true });
    return;
  }

  const actions = draft ? ["PR 초안 복사", "PR 화면 열기"] : ["PR 화면 열기"];
  const choice = await vscode.window.showInformationMessage(
    `PR 준비 상태\n${summary}\n\n브라우저에서 PR 생성 화면을 열까요?`,
    { modal: true },
    ...actions,
  );
  if (choice === "PR 초안 복사" && draft) {
    await vscode.env.clipboard.writeText(`제목: ${draft.title}\n\n${draft.body}`);
    await vscode.window.showInformationMessage("PR 초안을 복사했습니다.");
  }
  if (choice === "PR 화면 열기") await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function detachedHeadGuide(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const state = await getState(cwd);
  if (state.branch !== null) return;

  const actions = await import("./git-actions.mjs");
  const workflows = await import("./git-workflows.mjs");
  const branches = state.refs.filter((ref) => ref.kind === "local");
  const head = state.head ?? "현재 커밋";
  const choice = await vscode.window.showQuickPick([
    { label: "현재 커밋을 브랜치로 보존", id: "keep", description: `${head.slice(0, 7)}에서 새 로컬 브랜치를 만듭니다.` },
    { label: "기존 브랜치로 돌아가기", id: "return", description: "현재 커밋을 보존하지 않고 선택한 브랜치로 이동합니다." },
  ], { placeHolder: "Detached HEAD에서 작업을 이어갈 방법을 선택하세요." });
  if (!choice) return;

  if (choice.id === "keep") {
    const name = await askName(`현재 커밋 ${head.slice(0, 7)}을 보존할 브랜치 이름`, async (value) => {
      const result = await actions.validateBranchName(cwd, value);
      if (!result.ok) return result.message;
      if (branches.some((ref) => ref.name === value.trim())) return "이미 존재하는 로컬 브랜치입니다.";
      return null;
    });
    if (!name) return;
    if (!await confirmMutation({
      action: "Detached HEAD 커밋 보존",
      target: name,
      effect: `현재 커밋 ${head.slice(0, 7)}에서 로컬 브랜치를 만듭니다.`,
      confirmLabel: "커밋 보존",
    })) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.createBranch(cwd, name, head));
    return;
  }

  if (!branches.length) {
    await vscode.window.showWarningMessage("돌아갈 로컬 브랜치가 없습니다. 현재 커밋을 보존하려면 먼저 브랜치를 만드세요.");
    return;
  }
  const selected = await vscode.window.showQuickPick(branches.map((ref) => ({ label: ref.name, ref })), {
    placeHolder: "돌아갈 로컬 브랜치를 선택하세요.",
  });
  if (!selected) return;
  const guard = await guardWorkingState(cwd, "switch-branch");
  if (!guard.ok) {
    await renderPanel(host, { ok: false, level: "blocked", ...guard }, mode, options);
    return;
  }

  const containing = await workflows.getBranchesContainingCommit(cwd, head);
  const risk = containing.length
    ? `현재 커밋은 ${containing.join(", ")} 브랜치에서 계속 찾을 수 있습니다.`
    : `현재 커밋 ${head.slice(0, 7)}을 가리키는 브랜치가 없습니다. 돌아가면 나중에 찾기 어려워질 수 있습니다.`;
  if (!await confirmMutation({
    action: "기존 브랜치로 돌아가기",
    target: selected.ref.name,
    effect: `Detached HEAD에서 ${selected.ref.name}로 전환합니다.`,
    risk,
    confirmLabel: "브랜치로 돌아가기",
  })) return;
  await showStatefulResult(host, mode, options, cwd, () => actions.checkoutBranch(cwd, selected.ref.name));
}

async function gitDoctor(host, context, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const [workflows, safety] = await Promise.all([
    import("./git-workflows.mjs"),
    import("./git-safety.mjs"),
  ]);
  const [head, tracking, upstreamState, changes, operation, remoteRewrite] = await Promise.all([
    safety.getHeadSafety(cwd),
    safety.getTrackingStatus(cwd),
    safety.inspectCurrentUpstream(cwd),
    safety.getWorkingTreeChanges(cwd),
    safety.getInProgressOperation(cwd),
    safety.detectCachedRemoteHistoryRewrite(cwd),
  ]);
  const findings = workflows.getGitDoctorFindings({ head, tracking, upstreamState, changes, operation, remoteRewrite });
  const selected = await vscode.window.showQuickPick([
    ...findings.map((finding) => ({
      label: finding.state,
      description: finding.risk,
      detail: `다음: ${finding.recommendation}`,
      finding,
    })),
    { label: "파일 일부만 Commit하는 법", description: "줄 단위 Stage는 VS Code Source Control에서 진행", finding: { id: "partial-stage", guideKey: "partial-stage" } },
  ], { placeHolder: "Git Doctor · 저장소 상태와 다음 작업" });
  if (!selected) return;

  if (selected.finding.id === "detached-head") return detachedHeadGuide(host, mode, options);
  if (selected.finding.id === "partial-stage") return openGuidePanel(context, "partial-stage");
  const action = selected.finding.action;
  if (action === "pull" || action === "push") return runSyncAction(host, action, mode, options);
  if (action === "compare") return openComparePanel(context);
  if (action === "branch") return openBranchWorkspace(context);
  if (action === "remote") return remoteMenu(host, mode, options);
  if (action === "fetch") return remoteMenu(host, mode, options);
  if (action === "conflict") return conflictHelper(host, mode, options);
  if (action === "scm") return vscode.commands.executeCommand("workbench.view.scm");
  if (selected.finding.guideKey) return openGuidePanel(context, selected.finding.guideKey);
  await renderPanel(host, null, mode, options);
}

async function safeGuardRulesMenu(host, mode, options) {
  const { listSafeGuardRules } = await import("./safe-guard.mjs");
  const rules = listSafeGuardRules([...relaxedSafeGuardRules]);
  const selected = await vscode.window.showQuickPick([
    ...rules.map((rule) => ({
      label: `${rule.relaxed ? "완화 중" : "기본 보호"} · ${rule.title}`,
      description: `${rule.purpose} ${rule.relaxable ? rule.risk : "중요 보호 규칙 · 완화할 수 없음"}`,
      rule,
    })),
    ...(relaxedSafeGuardRules.size ? [{ label: "모든 규칙 기본값으로 복원", id: "restore" }] : []),
  ], { placeHolder: "Safe Guard 규칙 · 변경은 이 세션에만 적용됩니다." });
  if (!selected) return;
  if (selected.id === "restore") {
    relaxedSafeGuardRules.clear();
  } else if (!selected.rule.relaxable) {
    await vscode.window.showInformationMessage(`${selected.rule.title}은(는) 중요한 보호 규칙이라 완화할 수 없습니다. ${selected.rule.risk}`);
    return;
  } else if (selected.rule.relaxed) {
    relaxedSafeGuardRules.delete(selected.rule.id);
  } else {
    const confirmed = await vscode.window.showWarningMessage(
      `${selected.rule.title}을(를) Git Next를 닫을 때까지 완화할까요?\n목적: ${selected.rule.purpose}\n위험: ${selected.rule.risk}`,
      { modal: true },
      "세션 동안 완화",
    );
    if (!confirmed) return;
    relaxedSafeGuardRules.add(selected.rule.id);
  }
  await renderPanel(host, null, mode, options);
}

async function runAiRecommendedAction(host, action, context, mode = "graph", options = {}, historyId = null) {
  const cwd = getCwd();
  if (!cwd) return;

  const updateOutcome = async (status, detail = null) => {
    if (!historyId) return;
    const { updateDiagnosisHistoryOutcome } = await import("./ai-history.mjs");
    const history = context.globalState.get("gitNext.aiDiagnosisHistory", []);
    await context.globalState.update(
      "gitNext.aiDiagnosisHistory",
      updateDiagnosisHistoryOutcome(history, historyId, {
        action,
        status,
        ...(detail ? { detail } : {}),
      }),
    );
  };

  const run = async () => {
    if (action === "pull" || action === "push") return runSyncAction(host, action, mode, options);
    if (action === "compare") return openComparePanel(context);
    if (action === "merge" || action === "rebase") return offerDivergedResolution(host, mode, options, cwd);
    if (action === "stash") return openStashWorkspace(context);
    if (action === "continue" || action === "abort") return conflictHelper(host, mode, options);
    if (action === "branch") return openBranchWorkspace(context);
    if (action === "remote") return remoteMenu(host, mode, options);
    if (action === "scm") return vscode.commands.executeCommand("workbench.view.scm");
    if (action === "open-guide") return openGuidePanel(context);
    throw new Error(`지원하지 않는 AI 추천 작업입니다: ${action}`);
  };

  await updateOutcome("started");
  try {
    const result = await run();
    await updateOutcome("finished");
    return result;
  } catch (error) {
    await updateOutcome("failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function aiDiagnose(context) {
  const cwd = getCwd();
  if (!cwd) return;
  const config = vscode.workspace.getConfiguration("gitNext.ai");
  const provider = config.get("provider", "off");
  if (provider === "off") {
    const choice = await vscode.window.showInformationMessage(
      "AI 진단 Provider가 설정되지 않았습니다.",
      "AI 설정 열기",
    );
    if (choice) await vscode.commands.executeCommand("workbench.action.openSettings", "gitNext.ai");
    return;
  }

  const state = await getState(cwd);
  const activity = getActiveContext()?.workspaceState.get("gitNext.activity", []) ?? [];
  const recentFailure = activity.find((item) => item?.ok === false) ?? null;
  const { buildDiagnosisContext } = await import("./ai-diagnosis.mjs");
  const { diagnoseWithProvider } = await import("./ai-provider.mjs");
  const diagnosisContext = buildDiagnosisContext(state, recentFailure);
  const result = await withNetworkProgress("Git Next · AI 상황 진단", () => diagnoseWithProvider({
    provider,
    context: diagnosisContext,
    cwd,
    endpoint: config.get("ollamaEndpoint", "http://127.0.0.1:11434"),
    model: config.get("ollamaModel", ""),
  }));

  if (!result.ok) {
    const detail = result.detail ? `\n${result.detail}` : "";
    await vscode.window.showWarningMessage(`${result.message}${detail}`);
    return;
  }
  const { createDiagnosisHistoryEntry, appendDiagnosisHistory } = await import("./ai-history.mjs");
  const history = context.globalState.get("gitNext.aiDiagnosisHistory", []);
  const entry = createDiagnosisHistoryEntry({
    repository: cwd,
    provider,
    diagnosis: result.diagnosis,
  });
  await context.globalState.update(
    "gitNext.aiDiagnosisHistory",
    appendDiagnosisHistory(history, entry, 50),
  );
  await openAiDiagnosisPanel(context, result.diagnosis, provider, entry.id);
}

async function toolsMenu(host, mode, options, context, toolId = null) {
  const selected = toolId
    ? { id: toolId }
    : await vscode.window.showQuickPick([
      { label: "저장소 선택", id: "repository", description: "여러 Git 저장소 중 Git Next가 사용할 저장소 선택" },
      { label: "Git Doctor", id: "doctor", description: "현재 상태와 위험, 권장 다음 작업 확인" },
      { label: "AI에게 이 상황 물어보기", id: "ai-diagnose", description: "현재 Git 상태를 AI가 진단하고 가이드와 안전한 다음 작업을 제안" },
      { label: "복구", id: "recovery", description: "Undo, Reflog, Conflict / 진행 중 작업 복구" },
      { label: "Safe Guard 규칙", id: "safe-guard", description: "검사 목적과 위험 확인, 비핵심 규칙을 세션 동안 완화" },
      { label: "Git 작업 타임라인", id: "timeline", description: "Git Next에서 방금 한 작업들 확인" },
      { label: "Commit 메시지 도우미", id: "commit", description: "현재 변경 기준 메시지 제안" },
      { label: "부분 Commit 안내", id: "partial-stage", description: "필요한 줄만 VS Code Source Control에서 Stage" },
      { label: "PR handoff", id: "pr", description: "현재 브랜치의 PR 준비 상태 확인" },
    ], { placeHolder: "Git Next 도구" });
  if (!selected) return;

  if (selected.id === "repository") return selectRepository(host, mode, options);
  if (selected.id === "doctor") return gitDoctor(host, context, mode, options);
  if (selected.id === "ai-diagnose") return aiDiagnose(context);
  if (selected.id === "recovery") return recoveryMenu(host, mode, options);
  if (selected.id === "safe-guard") return safeGuardRulesMenu(host, mode, options);
  if (selected.id === "timeline") return timelineView(host, mode, options);
  if (selected.id === "commit") return commitHelper(host, mode, options);
  if (selected.id === "partial-stage") return openGuidePanel(context, "partial-stage");
  if (selected.id === "pr") return pullRequestHandoff();
}


  return {
    askName,
    tagMenu,
    commitMenu,
    openMarkdown,
    conflictHelper,
    undoMenu,
    timelineView,
    reflogMenu,
    remoteMenu,
    commitHelper,
    pullRequestHandoff,
    detachedHeadGuide,
    gitDoctor,
    safeGuardRulesMenu,
    aiDiagnose,
    runAiRecommendedAction,
    toolsMenu,
  };
}

module.exports = { createGitMenus };
