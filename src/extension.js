const vscode = require("vscode");

let activeContext = null;
const diffDocumentContents = new Map();
let diffDocumentId = 0;

async function recordActivity(entry) {
  if (!activeContext) return;
  const current = activeContext.workspaceState.get("gitNext.activity", []);
  const next = [
    {
      at: new Date().toISOString(),
      action: entry.action ?? "git-action",
      ok: entry.ok !== false,
      message: entry.message ?? "",
    },
    ...current,
  ].slice(0, 50);
  await activeContext.workspaceState.update("gitNext.activity", next);
}

function isPullBeforePushEnabled() {
  return vscode.workspace
    .getConfiguration("gitNext")
    .get("pullBeforePush", false);
}

function getCwd() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

async function getRepositoryRoot(cwd) {
  const { getRepositoryState } = await import("./git-state.mjs");
  return (await getRepositoryState(cwd)).root ?? cwd;
}

async function getState(cwd) {
  const [
    { getRepositoryState },
    { getTrackingStatus, getWorkingTreeChanges, getInProgressOperation },
    { recommendNextAction },
  ] = await Promise.all([
    import("./git-state.mjs"),
    import("./git-safety.mjs"),
    import("./git-workflows.mjs"),
  ]);
  const state = await getRepositoryState(cwd);

  if (state.kind !== "repository") {
    return { ...state, pullBeforePush: isPullBeforePushEnabled() };
  }

  const [tracking, changes, operation] = await Promise.all([
    getTrackingStatus(state.root),
    getWorkingTreeChanges(state.root),
    getInProgressOperation(state.root),
  ]);

  return {
    ...state,
    tracking,
    changes,
    operation,
    nextAction: recommendNextAction({ tracking, changes, operation }),
    pullBeforePush: isPullBeforePushEnabled(),
  };
}

async function renderPanel(panel, notice = null, mode = "graph", options = {}) {
  const [{ renderGraphHtml }, { renderSidebarHtml }] = await Promise.all([
    import("./graph-view.mjs"),
    import("./sidebar-view.mjs"),
  ]);
  const cwd = getCwd();
  const state = cwd
    ? await getState(cwd)
    : {
        kind: "no-repository",
        root: null,
        branch: null,
        upstream: null,
        head: null,
        refs: [],
        commits: [],
        tracking: null,
        pullBeforePush: isPullBeforePushEnabled(),
      };

  panel.webview.html =
    mode === "sidebar"
      ? renderSidebarHtml(state, notice)
      : renderGraphHtml(state, notice, options);
}

async function getGuideKey(action, data = {}) {
  const { classifyGuide } = await import("./git-guide.mjs");
  return classifyGuide({
    action,
    code: data.code,
    detail: data.detail,
    message: data.message,
  });
}

async function showResult(host, mode, options, result, level = null) {
  await recordActivity(result);
  await renderPanel(host, {
    ok: result.ok,
    level: level ?? (result.ok ? "safe" : "blocked"),
    message: result.message,
    detail: result.detail || null,
    guideKey: result.ok ? null : await getGuideKey(result.action, result),
  }, mode, options);
}

async function showStatefulResult(host, mode, options, cwd, action) {
  const { runWithGitStateDelta } = await import("./git-workflows.mjs");
  await showResult(host, mode, options, await runWithGitStateDelta(cwd, action));
}

async function guardWorkingState(cwd, action) {
  const {
    getWorkingTreeChanges,
    getDirtyTreeGuard,
    getInProgressOperation,
  } = await import("./git-safety.mjs");

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    return {
      ok: false,
      message: `현재 ${operation.operation} 작업이 끝나지 않았습니다. 먼저 계속하거나 취소한 뒤 다시 시도하세요.`,
      detail: operation.path,
    };
  }

  const changes = await getWorkingTreeChanges(cwd);
  const guard = getDirtyTreeGuard(action, changes);
  if (guard.level === "blocked") {
    return {
      ok: false,
      message: guard.message,
      detail: guard.affected?.length ? `영향 파일: ${guard.affected.join(", ")}` : null,
    };
  }

  return { ok: true };
}

async function confirmMutation({ action, target = "", effect = "", risk = "", level = "safe", confirmLabel = "실행" }) {
  const lines = [
    `작업: ${action}`,
    target ? `대상: ${target}` : null,
    effect ? `변경: ${effect}` : null,
    risk ? `주의: ${risk}` : null,
    `Safe Guard: ${level === "blocked" ? "차단" : level === "warning" ? "주의" : "확인됨"}`,
  ].filter(Boolean).join("\n");
  if (level === "blocked") {
    await vscode.window.showWarningMessage(lines, { modal: true });
    return false;
  }
  const choice = await vscode.window.showWarningMessage(lines, { modal: true }, confirmLabel);
  return Boolean(choice);
}

async function confirmImpactPreview(cwd, action) {
  const { getActionImpactPreview, formatImpactPreview } = await import("./git-workflows.mjs");
  const preview = await getActionImpactPreview(cwd, action);
  return confirmMutation({
    action: action === "pull" ? "Pull" : "Push",
    target: action === "pull" ? "현재 브랜치 ← Remote" : "현재 브랜치 → Remote",
    effect: formatImpactPreview(preview),
    risk: action === "pull" ? "원격 변경이 로컬 작업에 반영됩니다." : "로컬 Commit이 공유 Remote에 반영됩니다.",
    confirmLabel: action === "pull" ? "Pull 실행" : "Push 실행",
  });
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
    const tracking = await getTrackingStatus(cwd);
    if (isPullUnnecessary(tracking)) return;

    const preflight = await preflightPullSafety(cwd);
    const guard = await evaluateSafeguards({
      action: "pull",
      rules: [
        async () => createGuardDecision(preflight.level, preflight.message, {
          code: preflight.code,
          detail: preflight.detail,
          affected: preflight.affected,
          overridable: false,
        }),
      ],
    });

    if (!guard.canProceed) {
      const detail = [
        guard.affected?.length ? `영향 파일/참조: ${guard.affected.join(", ")}` : null,
        guard.detail,
      ].filter(Boolean).join("\n");
      await renderPanel(host, {
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
      return;
    }

    if (!await confirmImpactPreview(cwd, "pull")) return;
    await showStatefulResult(host, mode, options, cwd, () => pullRepository(cwd));
    return;
  }

  if (isPullBeforePushEnabled()) {
    const before = await getTrackingStatus(cwd);
    const preflight = await preflightPullSafety(cwd);
    if (preflight.level !== "safe") {
      const detail = [
        `업데이트 전 상태: ${before.kind}; ahead ${before.ahead}; behind ${before.behind}`,
        preflight.detail,
      ].filter(Boolean).join("\n");
      const message = `Push 전 Pull 안전 검사에서 중단했습니다. ${preflight.message}`;
      await renderPanel(host, {
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
      return;
    }

    const pullResult = await pullRepository(cwd);
    if (!pullResult.ok) {
      await showResult(host, mode, options, pullResult, "blocked");
      return;
    }
  }

  const preflight = await preflightPushSafety(cwd);
  if (preflight.level !== "safe") {
    await renderPanel(host, {
      ok: false,
      level: preflight.level,
      message: preflight.message,
      detail: preflight.detail,
      guideKey: await getGuideKey("push", preflight),
    }, mode, options);
    return;
  }

  if (!await confirmImpactPreview(cwd, "push")) return;
  await showStatefulResult(host, mode, options, cwd, () => pushRepository(cwd));
}

async function askName(prompt, validateInput) {
  return vscode.window.showInputBox({
    prompt,
    ignoreFocusOut: true,
    validateInput,
  });
}

async function branchMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const state = await getState(cwd);
  const actions = await import("./git-actions.mjs");
  const localBranches = state.refs.filter((ref) => ref.kind === "local");

  const action = await vscode.window.showQuickPick([
    { label: "새 브랜치 만들기", id: "create", description: "현재 HEAD에서 새 로컬 브랜치를 만듭니다." },
    { label: "브랜치 전환", id: "switch", description: "작업 위치를 다른 로컬 브랜치로 바꿉니다." },
    { label: "브랜치 이름 변경", id: "rename", description: "로컬 브랜치 이름만 바꿉니다. 원격 이름은 바뀌지 않습니다." },
    { label: "브랜치 삭제", id: "delete", description: "삭제 전 병합 여부와 잃을 수 있는 커밋을 확인합니다." },
    { label: "정리 후보 검토", id: "cleanup", description: "병합·원격 추적 끊김·90일 이상 커밋이 없는 브랜치를 검토합니다." },
  ], { placeHolder: "브랜치 작업을 선택하세요." });

  if (!action) return;

  if (action.id === "cleanup") {
    const review = await actions.getBranchCleanupCandidates(cwd);
    if (!review.ok) {
      vscode.window.showWarningMessage(review.message);
      return;
    }
    if (!review.candidates.length) {
      vscode.window.showInformationMessage("검토할 브랜치 정리 후보가 없습니다.");
      return;
    }
    const candidate = await vscode.window.showQuickPick(review.candidates.map((item) => ({
      label: item.name,
      description: `${item.safe ? "안전 후보" : "확인 필요"} · ${item.reasons.join(" · ")}`,
      detail: item.lastCommitAt ? `마지막 커밋: ${item.lastCommitAt}` : "마지막 커밋 날짜를 확인할 수 없음",
      item,
    })), { placeHolder: "삭제 후보를 검토하세요. 현재 브랜치는 표시되지 않습니다." });
    if (!candidate) return;
    const freshState = await getState(cwd);
    if (candidate.item.name === freshState.branch) {
      vscode.window.showWarningMessage("현재 브랜치는 삭제할 수 없습니다.");
      return;
    }
    const info = await actions.getBranchDeleteInfo(cwd, candidate.item.name);
    const warning = info.merged
      ? "현재 HEAD에 병합되어 있습니다."
      : `병합되지 않은 커밋이 ${info.uniqueCommitCount ?? "확인되지 않은 수만큼"} 남아 있을 수 있습니다.`;
    const choice = await vscode.window.showWarningMessage(
      `'${candidate.item.name}' 로컬 브랜치를 삭제할까요? ${candidate.item.reasons.join(" · ")} ${warning}`,
      { modal: true },
      info.merged ? "삭제" : "강제 삭제",
    );
    if (!choice) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.deleteBranch(cwd, candidate.item.name, !info.merged));
    return;
  }

  if (action.id === "create") {
    const name = await askName("새 브랜치 이름을 입력하세요. 생성 후에도 현재 브랜치는 그대로 유지됩니다.", async (value) => {
      const result = await actions.validateBranchName(cwd, value);
      if (!result.ok) return result.message;
      if (localBranches.some((ref) => ref.name === value.trim())) return "이미 존재하는 로컬 브랜치입니다.";
      return null;
    });
    if (!name) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.createBranch(cwd, name, "HEAD"));
    return;
  }

  const branchChoices = action.id === "switch"
    ? state.refs.filter((ref) => ref.kind === "local" || ref.kind === "remote")
    : localBranches;
  const selected = await vscode.window.showQuickPick(
    branchChoices.map((ref) => ({
      label: ref.name,
      description: ref.kind === "remote" ? "원격 브랜치 · 로컬 추적 브랜치 생성 필요" : "로컬 브랜치",
      ref,
    })),
    { placeHolder: action.id === "switch" ? "전환할 브랜치를 선택하세요." : "브랜치를 선택하세요." },
  );
  if (!selected) return;

  if (action.id === "switch") {
    const guard = await guardWorkingState(cwd, "switch-branch");
    if (!guard.ok) {
      await renderPanel(host, { ok: false, level: "blocked", ...guard }, mode, options);
      return;
    }

    if (selected.ref.kind === "remote") {
      const defaultLocalName = selected.ref.name.includes("/")
        ? selected.ref.name.slice(selected.ref.name.indexOf("/") + 1)
        : selected.ref.name;
      const localName = await askName(
        `원격 '${selected.ref.name}'는 직접 Checkout하지 않습니다. 추적할 로컬 브랜치 이름을 입력하세요.`,
        async (value) => {
          const result = await actions.validateBranchName(cwd, value);
          if (!result.ok) return result.message;
          if (localBranches.some((ref) => ref.name === value.trim())) return "이미 존재하는 로컬 브랜치입니다.";
          return null;
        },
      );
      if (!localName) return;
      await showResult(
        host,
        mode,
        options,
        await actions.createTrackingBranch(cwd, localName || defaultLocalName, selected.ref.name),
      );
      return;
    }

    if (selected.ref.name === state.branch) {
      vscode.window.showInformationMessage("이미 현재 브랜치입니다.");
      return;
    }

    await showStatefulResult(host, mode, options, cwd, () => actions.checkoutBranch(cwd, selected.ref.name));
    return;
  }

  if (action.id === "rename") {
    const newName = await askName(
      `'${selected.ref.name}'의 새 이름을 입력하세요. 원격 브랜치 이름은 자동으로 바뀌지 않습니다.`,
      async (value) => {
        const result = await actions.validateBranchName(cwd, value);
        if (!result.ok) return result.message;
        if (localBranches.some((ref) => ref.name === value.trim())) return "이미 존재하는 로컬 브랜치입니다.";
        return null;
      },
    );
    if (!newName) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.renameBranch(cwd, selected.ref.name, newName));
    return;
  }

  if (selected.ref.name === state.branch) {
    vscode.window.showWarningMessage("현재 사용 중인 브랜치는 삭제할 수 없습니다. 다른 브랜치로 전환한 뒤 다시 시도하세요.");
    return;
  }

  const info = await actions.getBranchDeleteInfo(cwd, selected.ref.name);
  const detail = info.merged
    ? "현재 HEAD에 이미 병합된 브랜치입니다."
    : `아직 병합되지 않은 커밋이 ${info.uniqueCommitCount ?? "확인되지 않은 수만큼"} 남아 있을 수 있습니다.`;
  const choice = await vscode.window.showWarningMessage(
    `'${selected.ref.name}' 브랜치를 삭제할까요? ${detail}`,
    { modal: true },
    info.merged ? "삭제" : "강제 삭제",
  );
  if (!choice) return;
  await showStatefulResult(host, mode, options, cwd, () => actions.deleteBranch(cwd, selected.ref.name, !info.merged));
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

async function stashMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const actions = await import("./git-actions.mjs");
  const workflows = await import("./git-workflows.mjs");
  const { getWorkingTreeChanges, getInProgressOperation } = await import("./git-safety.mjs");

  const action = await vscode.window.showQuickPick([
    { label: "현재 변경 임시 저장", id: "push", description: "커밋하지 않은 변경을 잠깐 숨깁니다. 커밋은 생기지 않습니다." },
    { label: "Stash 적용", id: "apply", description: "변경을 복원하지만 Stash 항목은 남겨둡니다." },
    { label: "Stash Pop", id: "pop", description: "변경을 복원하고 성공하면 Stash 항목도 제거합니다." },
    { label: "Stash 삭제", id: "drop", description: "복원하지 않고 Stash 항목을 삭제합니다." },
  ], { placeHolder: "Stash 작업을 선택하세요." });
  if (!action) return;

  if (action.id === "push") {
    const changes = await getWorkingTreeChanges(cwd);
    if (!changes.length) {
      vscode.window.showInformationMessage("임시 저장할 로컬 변경이 없습니다.");
      return;
    }
    const message = await vscode.window.showInputBox({
      prompt: `${changes.length}개 변경을 Stash에 임시 저장합니다. 메모를 입력해도 됩니다.`,
      value: "Git Next 임시 저장",
    });
    if (message === undefined) return;
    await showStatefulResult(host, mode, options, cwd, () => actions.stashPush(cwd, message || "Git Next 임시 저장"));
    return;
  }

  const stashes = await actions.listStashes(cwd);
  if (!stashes.length) {
    vscode.window.showInformationMessage("저장된 Stash가 없습니다.");
    return;
  }
  const selected = await vscode.window.showQuickPick(
    stashes.map((stash) => ({ label: stash.ref, description: stash.message, stash })),
    { placeHolder: "Stash를 선택하세요." },
  );
  if (!selected) return;

  if (action.id === "drop") {
    const choice = await vscode.window.showWarningMessage(
      `${selected.stash.ref}를 삭제할까요? 삭제 후에는 이 Stash를 목록에서 복원할 수 없습니다.`,
      { modal: true },
      "Stash 삭제",
    );
    if (!choice) return;
    await showResult(host, mode, options, await actions.stashDrop(cwd, selected.stash.ref));
    return;
  }

  const operation = await getInProgressOperation(cwd);
  if (operation) {
    await renderPanel(host, {
      ok: false,
      level: "blocked",
      message: `현재 ${operation.operation} 작업이 끝나지 않아 Stash를 복원하지 않습니다.`,
      detail: operation.path,
    }, mode, options);
    return;
  }

  const preview = await workflows.getStashDetails(cwd, selected.stash.ref);
  if (!await confirmMutation(stashActionConfirmation(preview, action.id))) return;
  await showStatefulResult(host, mode, options, cwd, () => action.id === "apply"
    ? actions.stashApply(cwd, selected.stash.ref)
    : actions.stashPop(cwd, selected.stash.ref));
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

async function commitMenu(host, mode, options, commit) {
  const cwd = getCwd();
  if (!cwd || !commit) return;
  const state = await getState(cwd);
  const actions = await import("./git-actions.mjs");

  const selected = await vscode.window.showQuickPick([
    { label: "이 커밋에서 브랜치 만들기", id: "branch", description: "현재 작업 위치는 바뀌지 않습니다." },
    { label: "이 커밋에 태그 만들기", id: "tag", description: "선택한 커밋에 이름표를 붙입니다." },
    { label: "Cherry-pick", id: "cherry", description: `이 커밋의 변경만 현재 브랜치 '${state.branch ?? "알 수 없음"}'에 복사합니다.` },
    { label: "Revert", id: "revert", description: "기존 기록은 유지하고 반대 변경의 새 커밋을 만듭니다." },
  ], { placeHolder: `커밋 ${commit.slice(0, 7)} 작업` });
  if (!selected) return;

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
  const workflows = await import("./git-workflows.mjs");
  const files = await workflows.listConflictedFiles(cwd);

  const choices = [
    ...files.map((path) => ({ label: path, id: "file", path, description: "충돌 파일 · 내 변경/들어온 변경 선택" })),
    { label: "Merge 계속", id: "continue", description: "모든 충돌 정리 후 merge commit을 완료합니다." },
    { label: "Merge 취소", id: "abort", description: "진행 중인 Merge를 시작 전 상태로 되돌립니다." },
  ];

  if (!files.length) {
    choices.unshift({ label: "현재 충돌 파일 없음", id: "none", description: "Merge 진행 상태만 확인할 수 있습니다." });
  }

  const selected = await vscode.window.showQuickPick(choices, { placeHolder: "Conflict Helper" });
  if (!selected || selected.id === "none") return;

  if (selected.id === "continue") {
    const confirm = await vscode.window.showInformationMessage(
      "모든 충돌을 정리했다면 Merge를 완료합니다.",
      { modal: true },
      "Merge 계속",
    );
    if (!confirm) return;
    await showResult(host, mode, options, await workflows.continueMerge(cwd));
    return;
  }

  if (selected.id === "abort") {
    const confirm = await vscode.window.showWarningMessage(
      "현재 Merge 작업을 취소하고 Merge 시작 전 상태로 돌아갑니다.",
      { modal: true },
      "Merge 취소",
    );
    if (!confirm) return;
    await showResult(host, mode, options, await workflows.abortMerge(cwd));
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

async function compareBranchesMenu() {
  const cwd = getCwd();
  if (!cwd) return;
  const state = await getState(cwd);
  const current = state.branch;
  if (!current) {
    vscode.window.showWarningMessage("브랜치 비교는 현재 브랜치가 있을 때 사용할 수 있습니다.");
    return;
  }
  const refs = state.refs.filter((ref) => ref.kind === "local" || ref.kind === "remote").filter((ref) => ref.name !== current);
  const selected = await vscode.window.showQuickPick(refs.map((ref) => ({
    label: ref.name,
    description: ref.kind === "remote" ? "원격" : "로컬",
    ref,
  })), { placeHolder: `${current}와 비교할 브랜치를 선택하세요.` });
  if (!selected) return;

  const { compareBranches } = await import("./git-workflows.mjs");
  const comparison = await compareBranches(cwd, current, selected.ref.name);
  const baseCommits = comparison.baseOnly.slice(0, 20).map((c) => `- \`${c.id}\` ${c.subject}`).join("\n") || "- 없음";
  const otherCommits = comparison.otherOnly.slice(0, 20).map((c) => `- \`${c.id}\` ${c.subject}`).join("\n") || "- 없음";
  const files = comparison.files.slice(0, 50).map((f) => `- \`${f.status}\` ${f.path}`).join("\n") || "- 없음";
  const mergeBase = comparison.mergeBase
    ? `\`${comparison.mergeBase.slice(0, 7)}\` ${comparison.mergeBaseSubject} — 두 브랜치가 갈라지기 전 함께 가진 기준 커밋입니다.`
    : "공통 조상 커밋을 찾지 못했습니다. 두 브랜치의 기록이 서로 다른 시작점일 수 있습니다.";

  await openMarkdown(
    `브랜치 비교 · ${current} ↔ ${selected.ref.name}`,
    [
      "## 공통 기준점 (Merge Base)",
      mergeBase,
      "",
      `**${current}에만 있는 커밋:** ${comparison.baseCount}개`,
      `**${selected.ref.name}에만 있는 커밋:** ${comparison.otherCount}개`,
      "",
      `## 내 브랜치(${current})에만 있는 커밋`,
      baseCommits,
      "",
      `## 비교 브랜치(${selected.ref.name})에서 들어올 커밋`,
      otherCommits,
      "",
      "## 변경 파일",
      files,
      "",
      comparison.otherCount
        ? `Merge하면 비교 브랜치의 커밋 ${comparison.otherCount}개가 현재 브랜치 흐름에 들어올 수 있습니다.`
        : "비교 브랜치에서 새로 들어올 커밋은 없습니다.",
    ].join("\n"),
  );
  if (comparison.mergeBase) {
    const openGraph = await vscode.window.showInformationMessage(
      `공통 기준점 ${comparison.mergeBase.slice(0, 7)}은 두 브랜치가 갈라지기 전 함께 가진 커밋입니다. 그래프에서 강조할까요?`,
      "그래프에서 강조",
    );
    if (openGraph) await openGraphPanel(activeContext, { focus: "merge-base", focusCommitId: comparison.mergeBase });
  }
}

async function undoMenu(host, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const workflows = await import("./git-workflows.mjs");
  const safety = await import("./git-safety.mjs");
  const actions = await import("./git-actions.mjs");
  const choice = await vscode.window.showQuickPick([
    { label: "마지막 로컬 Commit 취소", id: "commit", description: "Push 전 커밋을 취소하고 파일 변경은 남깁니다." },
    { label: "복구 지점에서 브랜치 만들기", id: "recovery", description: "Reset 전에 저장된 로컬 커밋 위치를 새 브랜치로 보존합니다." },
    { label: "파일 하나 변경 되돌리기", id: "file", description: "선택 파일의 커밋하지 않은 변경을 버립니다." },
    { label: "이미 Push한 Commit 되돌리기", id: "pushed", description: "기록을 지우지 않고 Revert 커밋을 만듭니다." },
    { label: "추적 중인 모든 변경 버리기", id: "discard", description: "새 untracked 파일은 남기고 tracked 변경만 버립니다." },
  ], { placeHolder: "무엇을 되돌리고 싶나요?" });
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
      message: result.ok ? `${result.message} ${point.message}` : result.message,
      detail: [point.commit, point.name, result.detail].filter(Boolean).join("\n"),
    });
    return;
  }

  if (choice.id === "recovery") {
    const points = await workflows.listRecoveryPoints(cwd);
    const selected = await vscode.window.showQuickPick(points.map((point) => ({
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

async function timelineView() {
  const items = activeContext?.workspaceState.get("gitNext.activity", []) ?? [];
  const body = items.length
    ? items.map((item) => `- **${item.ok ? "성공" : "실패"}** · ${item.at} · \`${item.action}\` · ${item.message}`).join("\n")
    : "아직 Git Next에서 실행한 작업 기록이 없습니다.";
  await openMarkdown("Git 작업 타임라인", body);
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
  const message = await vscode.window.showInputBox({
    prompt: "제안 메시지를 자유롭게 수정하세요. Commit은 내 로컬 Git에만 저장되고 원격은 아직 바뀌지 않습니다.",
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

  const summary = [
    `브랜치: ${branch ?? "없음"}`,
    `원격: ${remote?.name ?? "없음"}`,
    `상태: ${state.tracking?.kind ?? "unknown"}`,
    `작업 파일: ${state.changes?.length ?? 0}개`,
  ].join("\n");

  if (!url) {
    await vscode.window.showInformationMessage(`PR 준비 상태\n${summary}\n\n지원되는 GitHub/GitLab Remote URL을 찾지 못했습니다.`, { modal: true });
    return;
  }

  const open = await vscode.window.showInformationMessage(
    `PR 준비 상태\n${summary}\n\n브라우저에서 PR 생성 화면을 열까요?`,
    { modal: true },
    "PR 화면 열기",
  );
  if (open) await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function gitDoctor(host, context, mode, options) {
  const cwd = getCwd();
  if (!cwd) return;
  const [workflows, safety] = await Promise.all([
    import("./git-workflows.mjs"),
    import("./git-safety.mjs"),
  ]);
  const [head, tracking, changes, operation, remoteRewrite] = await Promise.all([
    safety.getHeadSafety(cwd),
    safety.getTrackingStatus(cwd),
    safety.getWorkingTreeChanges(cwd),
    safety.getInProgressOperation(cwd),
    safety.detectCachedRemoteHistoryRewrite(cwd),
  ]);
  const findings = workflows.getGitDoctorFindings({ head, tracking, changes, operation, remoteRewrite });
  const selected = await vscode.window.showQuickPick(findings.map((finding) => ({
    label: finding.state,
    description: finding.risk,
    detail: `다음: ${finding.recommendation}`,
    finding,
  })), { placeHolder: "Git Doctor · 저장소 상태와 다음 작업" });
  if (!selected) return;

  const action = selected.finding.action;
  if (action === "pull" || action === "push") return runSyncAction(host, action, mode, options);
  if (action === "compare") return openComparePanel(context);
  if (action === "branch") return branchMenu(host, mode, options);
  if (action === "remote") return remoteMenu(host, mode, options);
  if (action === "conflict") return conflictHelper(host, mode, options);
  if (action === "scm") return vscode.commands.executeCommand("workbench.view.scm");
  if (selected.finding.guideKey) return openGuidePanel(context, selected.finding.guideKey);
  await renderPanel(host, null, mode, options);
}

async function toolsMenu(host, mode, options, context) {
  const selected = await vscode.window.showQuickPick([
    { label: "Git Doctor", id: "doctor", description: "현재 상태와 위험, 권장 다음 작업 확인" },
    { label: "Conflict Helper", id: "conflict", description: "충돌 파일을 내 변경/들어온 변경 기준으로 정리" },
    { label: "Branch 비교", id: "compare", description: "두 브랜치의 커밋과 파일 차이 확인" },
    { label: "Undo 가이드", id: "undo", description: "Reset/Restore/Revert 중 안전한 방법 선택" },
    { label: "Git 작업 타임라인", id: "timeline", description: "Git Next에서 방금 한 작업들 확인" },
    { label: "Commit 메시지 도우미", id: "commit", description: "현재 변경 기준 메시지 제안" },
    { label: "Reflog 복구", id: "reflog", description: "과거 위치에서 안전하게 복구 브랜치 생성" },
    { label: "Remote 관리", id: "remote", description: "Remote 목록/추가/이름변경/제거" },
    { label: "PR handoff", id: "pr", description: "현재 브랜치의 PR 준비 상태 확인" },
  ], { placeHolder: "Git Next 도구" });
  if (!selected) return;

  if (selected.id === "doctor") return gitDoctor(host, context, mode, options);
  if (selected.id === "conflict") return conflictHelper(host, mode, options);
  if (selected.id === "compare") return compareBranchesMenu();
  if (selected.id === "undo") return undoMenu(host, mode, options);
  if (selected.id === "timeline") return timelineView();
  if (selected.id === "commit") return commitHelper(host, mode, options);
  if (selected.id === "reflog") return reflogMenu(host, mode, options);
  if (selected.id === "remote") return remoteMenu(host, mode, options);
  if (selected.id === "pr") return pullRequestHandoff();
}

async function openChangesPanel(context) {
  const { renderChangesWorkspace } = await import("./workspace-views.mjs");
  const workflows = await import("./git-workflows.mjs");
  const panel = vscode.window.createWebviewPanel(
    "gitNext.changes",
    "Git Next · 변경사항",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  let notice = null;
  const refresh = async () => {
    const cwd = getCwd();
    panel.webview.html = cwd
      ? renderChangesWorkspace(await workflows.getChangeWorkspace(cwd), notice)
      : renderChangesWorkspace({ staged: [], unstaged: [], files: [] }, { message: "Git 저장소가 없습니다." });
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
  const panel = vscode.window.createWebviewPanel(
    "gitNext.compare",
    "Git Next · Local ↔ Remote",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  let comparison = null;
  const refresh = async () => {
    const cwd = getCwd();
    comparison = cwd
      ? await workflows.getLocalRemoteComparison(cwd)
      : { ok: false, message: "Git 저장소가 없습니다.", files: [] };
    panel.webview.html = renderCompareWorkspace(comparison);
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
  const panel = vscode.window.createWebviewPanel(
    "gitNext.branches",
    "Git Next · Branch",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const refresh = async () => {
    const cwd = getCwd();
    const state = cwd ? await getState(cwd) : { refs: [], branch: null };
    panel.webview.html = renderBranchWorkspace(state);
  };

  panel.webview.onDidReceiveMessage(async (message) => {
    const cwd = getCwd();
    if (!cwd) return;
    const state = await getState(cwd);
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
    if (message?.type === "switch") {
      if (message.branch === state.branch) {
        vscode.window.showInformationMessage("이미 현재 브랜치입니다.");
        return;
      }
      const guard = await guardWorkingState(cwd, "switch-branch");
      if (!guard.ok) {
        vscode.window.showWarningMessage(guard.message);
        return;
      }
      if (message.kind === "remote") {
        const defaultName = message.branch.includes("/") ? message.branch.slice(message.branch.indexOf("/") + 1) : message.branch;
        const name = await vscode.window.showInputBox({ prompt: "추적할 로컬 브랜치 이름", value: defaultName });
        if (!name) return;
        const ok = await confirmMutation({ action: "Remote 브랜치 전환", target: `${message.branch} → ${name}`, effect: "추적 로컬 브랜치를 만들고 전환합니다.", confirmLabel: "전환" });
        if (!ok) return;
        const result = await workflows.runWithGitStateDelta(cwd, () => actions.createTrackingBranch(cwd, name, message.branch));
        vscode.window.showInformationMessage(result.message);
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
      const ok = await confirmMutation({
        action: "브랜치 삭제",
        target: message.branch,
        effect: "선택한 로컬 브랜치를 삭제합니다.",
        risk: info.merged ? "현재 HEAD에 병합된 브랜치입니다." : `병합되지 않은 커밋 ${info.uniqueCommitCount ?? "알 수 없음"}개가 남아 있을 수 있습니다.`,
        level: info.merged ? "warning" : "warning",
        confirmLabel: info.merged ? "삭제" : "강제 삭제",
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
  const panel = vscode.window.createWebviewPanel(
    "gitNext.stashes",
    "Git Next · Stash",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  let selected = null;
  const refresh = async () => {
    const cwd = getCwd();
    const stashes = cwd ? await actions.listStashes(cwd) : [];
    const details = cwd && selected ? await workflows.getStashDetails(cwd, selected) : null;
    panel.webview.html = renderStashWorkspace(stashes, details);
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
      const memo = await vscode.window.showInputBox({ prompt: "Stash 메모", value: "Git Next 임시 저장" });
      if (memo === undefined) return;
      const ok = await confirmMutation({ action: "Stash 저장", target: `${changes.length}개 변경 파일`, effect: "현재 변경을 Stash로 옮기고 작업 폴더를 정리합니다.", confirmLabel: "Stash" });
      if (!ok) return;
      await actions.stashPush(cwd, memo || "Git Next 임시 저장");
      selected = null;
      return refresh();
    }
    if (!message.ref) return;
    if (message?.type === "apply" || message?.type === "pop") {
      const guard = await guardWorkingState(cwd, "stash-apply");
      if (!guard.ok) {
        vscode.window.showWarningMessage(guard.message);
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

  const panel = vscode.window.createWebviewPanel(
    "gitNext.commitDetails",
    `Git Next · Commit ${String(commit ?? "").slice(0, 7)}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderCommitDetailsWorkspace(details);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!cwd || !details.ok || message?.type !== "open-commit-diff") return;
    const file = details.files.find((item) =>
      item.path === message.path && (item.oldPath ?? null) === (message.oldPath ?? null)
    );
    if (!file) return;
    await openCommitFileDiff(cwd, details, file);
  });

  context.subscriptions.push(panel);
}

async function openKnowledgePanel(context, selected = null, tab = "terms") {
  const { renderKnowledgeCenter } = await import("./workspace-views.mjs");
  const panel = vscode.window.createWebviewPanel(
    "gitNext.knowledge",
    "Git Next · 도움말",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderKnowledgeCenter({ tab: selected ? "guides" : tab, selected });
  context.subscriptions.push(panel);
}

async function openGlossaryPanel(context) {
  const { renderGlossaryHtml } = await import("./glossary-view.mjs");
  const panel = vscode.window.createWebviewPanel(
    "gitNext.glossary",
    "Git Next · 용어 설명",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderGlossaryHtml();
  context.subscriptions.push(panel);
}

async function openGuidePanel(context, selected = null) {
  const { renderGuideHtml } = await import("./git-guide.mjs");
  const panel = vscode.window.createWebviewPanel(
    "gitNext.guide",
    "Git Next · 상황별 가이드",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderGuideHtml(selected);
  context.subscriptions.push(panel);
}

async function initializeWebviewHost(host, context, mode, initialOptions = {}) {
  host.webview.options = { enableScripts: true };
  host.webview.html = "<p>Git 정보를 불러오는 중입니다...</p>";
  let options = mode === "graph"
    ? { density: "compact", query: "", ref: "", scope: "all", focus: "all", limit: 50, ...initialOptions }
    : {};

  const messages = host.webview.onDidReceiveMessage(async (message) => {
    if (message?.type === "refresh") {
      await renderPanel(host, null, mode, options);
      return;
    }
    if (message?.type === "openGraph") {
      await openGraphPanel(context);
      return;
    }
    if (message?.type === "openGlossary" || message?.type === "openKnowledge") {
      await openKnowledgePanel(context, null, "terms");
      return;
    }
    if (message?.type === "openGuide") {
      await openKnowledgePanel(context, message.guideKey ?? null, "guides");
      return;
    }
    if (message?.type === "openSafeGuard") {
      const { renderSafeGuardDetailsHtml } = await import("./sidebar-view.mjs");
      const panel = vscode.window.createWebviewPanel(
        "gitNext.safeGuard",
        "Git Next · Safe Guard",
        vscode.ViewColumn.One,
        { enableScripts: false, retainContextWhenHidden: true },
      );
      panel.webview.html = renderSafeGuardDetailsHtml({ message: message.noticeMessage, detail: message.noticeDetail });
      context.subscriptions.push(panel);
      return;
    }
    if (message?.type === "openChanges") {
      await openChangesPanel(context);
      return;
    }
    if (message?.type === "openCompare") {
      await openComparePanel(context);
      return;
    }
    if (message?.type === "openCommitDetails" && message.commit) {
      await openCommitDetailsPanel(context, message.commit);
      return;
    }
    if (message?.type === "sidebarStage" || message?.type === "sidebarUnstage") {
      const cwd = getCwd();
      if (!cwd || !message.path) return;
      const root = await getRepositoryRoot(cwd);
      const workflows = await import("./git-workflows.mjs");
      const result = message.type === "sidebarStage"
        ? await workflows.stageFile(root, message.path)
        : await workflows.unstageFile(root, message.path);
      await recordActivity(result);
      await renderPanel(host, result, mode, options);
      return;
    }
    if (message?.type === "sidebarDiff" && message.path) {
      const cwd = getCwd();
      if (cwd) await openWorkingTreeDiff(cwd, message.path);
      return;
    }
    if (message?.type === "sidebarDiscard" && message.path) {
      const cwd = getCwd();
      if (!cwd) return;
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
      await renderPanel(host, result, mode, options);
      return;
    }
    if (message?.type === "sidebarStageAll" || message?.type === "sidebarUnstageAll") {
      const cwd = getCwd();
      if (!cwd) return;
      const root = await getRepositoryRoot(cwd);
      const workflows = await import("./git-workflows.mjs");
      const result = message.type === "sidebarStageAll"
        ? await workflows.stageAll(root)
        : await workflows.unstageAll(root);
      await recordActivity(result);
      await renderPanel(host, result, mode, options);
      return;
    }
    if (message?.type === "sidebarCommit") {
      const cwd = getCwd();
      if (!cwd) return;
      const root = await getRepositoryRoot(cwd);
      const workflows = await import("./git-workflows.mjs");
      const staged = await workflows.getStagedFiles(root);
      const commitMessage = String(message.message ?? "").trim();
      if (!staged.length) {
        await renderPanel(host, { ok: false, level: "warning", message: "Commit할 Staged 파일이 없습니다." }, mode, options);
        return;
      }
      if (!commitMessage) {
        await renderPanel(host, { ok: false, level: "warning", message: "Commit message를 입력하세요." }, mode, options);
        return;
      }
      const ok = await confirmMutation({
        action: "Commit",
        effect: `Staged 변경사항 ${staged.length}개를 Commit할까요?`,
        risk: "로컬에 기록되며 Push 전까지 원격에는 공유되지 않습니다.",
        confirmLabel: "Commit",
      });
      if (!ok) return;
      const result = await workflows.runWithGitStateDelta(root, () => workflows.commitWithMessage(root, commitMessage));
      await recordActivity(result);
      await renderPanel(host, result, mode, options);
      return;
    }
    if (message?.type === "graphOptions") {
      options = { ...options, ...(message.options ?? {}) };
      await renderPanel(host, null, mode, options);
      return;
    }
    if (message?.type === "branchMenu") {
      await openBranchWorkspace(context);
      return;
    }
    if (message?.type === "tagMenu") {
      await tagMenu(host, mode, options);
      return;
    }
    if (message?.type === "stashMenu") {
      await openStashWorkspace(context);
      return;
    }
    if (message?.type === "toolsMenu") {
      await toolsMenu(host, mode, options, context);
      return;
    }
    if (message?.type === "commitMenu") {
      await commitMenu(host, mode, options, message.commit);
      return;
    }
    if (message?.type === "pull" || message?.type === "push") {
      await runSyncAction(host, message.type, mode, options);
    }
  });
  context.subscriptions.push(messages);

  try {
    await renderPanel(host, null, mode, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.webview.html = `<p>Git 저장소 정보를 읽지 못했습니다.</p><pre>${message}</pre>`;
  }
}

async function openGraphPanel(context, initialOptions = {}) {
  const panel = vscode.window.createWebviewPanel(
    "gitNext.graph",
    "Git Next · 그래프",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  await initializeWebviewHost(panel, context, "graph", initialOptions);
}

function activate(context) {
  activeContext = context;
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("git-next-diff", {
    provideTextDocumentContent: (uri) => diffDocumentContents.get(uri.query) ?? "",
  }));
  const sidebarProvider = {
    resolveWebviewView: async (view) => {
      await initializeWebviewHost(view, context, "sidebar");
    },
  };

  const sidebar = vscode.window.registerWebviewViewProvider(
    "gitNext.sidebar",
    sidebarProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const openGitNext = vscode.commands.registerCommand("gitNext.open", async () => {
    await openGraphPanel(context);
  });

  context.subscriptions.push(sidebar, openGitNext);
}

function deactivate() {}

module.exports = { activate, deactivate };
