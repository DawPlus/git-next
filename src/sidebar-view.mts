import { escapeHtml, t, getLocale, getFixedT } from "./view-shared.mjs";
import { getActionRisk } from "./git-safety.mjs";
import { SIDEBAR_SHELL_STYLES } from "./sidebar-shell-styles.mjs";
import { SIDEBAR_CHANGES_STYLES } from "./sidebar-changes-styles.mjs";
import { SIDEBAR_TOOLS_STYLES } from "./sidebar-tools-styles.mjs";
import { SIDEBAR_INTERACTIONS } from "./sidebar-interactions.mjs";

function localizeRiskReason(reason, tFn = t) {
  if (!reason) return "";
  const knownReasons = {
    "현재 확인된 위험 신호가 없습니다.": "sidebar.risk.reasons.clean",
    "로컬과 원격 기록이 갈라졌습니다.": "sidebar.risk.reasons.diverged",
    "원격 상태를 확인할 수 없습니다.": "sidebar.risk.reasons.unknownRemote",
    "작업 폴더에 보관하지 않은 변경이 있습니다.": "sidebar.risk.reasons.dirtyBlocked",
    "작업 폴더에 커밋하지 않은 변경이 있습니다.": "sidebar.risk.reasons.dirtyWarning",
    "Push할 Remote 연결이 필요합니다.": "sidebar.risk.reasons.noRemote",
    "로컬과 원격 커밋 차이를 먼저 확인하세요.": "sidebar.risk.reasons.checkCommits",
    "원격 커밋 기록을 바꿀 수 있습니다.": "sidebar.risk.reasons.forcePush",
    "커밋과 파일 변경을 잃을 수 있습니다.": "sidebar.risk.reasons.hardReset",
    "파일의 커밋 전 변경을 버립니다.": "sidebar.risk.reasons.discardFile",
    "추적 파일의 커밋 전 변경을 버립니다.": "sidebar.risk.reasons.discardChanges",
    "브랜치 커밋을 잃을 수 있습니다.": "sidebar.risk.reasons.deleteBranch",
  };
  const key = knownReasons[reason];
  if (key) {
    return tFn(key);
  }
  const opMatch = String(reason).match(/^(.+) 작업이 끝나지 않았습니다\.$/);
  if (opMatch) {
    return tFn("sidebar.risk.reasons.unfinishedOp", { operation: opMatch[1] });
  }
  return reason;
}

function actionRiskBadge(action, state, tFn = t) {
  const risk = getActionRisk(action, state);
  const localizedReason = localizeRiskReason(risk.reason, tFn);
  const label = ({
    low: tFn("sidebar.risk.low"),
    medium: tFn("sidebar.risk.medium"),
    high: tFn("sidebar.risk.high"),
  })[risk.level] ?? risk.level;
  const ariaLabel = tFn("sidebar.riskAriaLabel", { level: label, reason: localizedReason });
  return `<span class="action-risk ${risk.level}" title="${escapeHtml(localizedReason)}" aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(label)}</span>`;
}

export function renderSafeGuardDetailsHtml(notice: any, options: { locale?: string } = {}) {
  const locale = options?.locale ?? getLocale();
  const tFn = getFixedT(locale);
  const message = escapeHtml(notice?.message ?? tFn("sidebar.noInspectionResults"));
  const detail = notice?.detail ? `<h2>${escapeHtml(tFn("sidebar.gitDetails"))}</h2><pre>${escapeHtml(notice.detail)}</pre>` : "";
  return `<!doctype html><html lang="${escapeHtml(locale)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safe Guard</title><body style="font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:20px;line-height:1.6"><h1>Safe Guard</h1><p>${message}</p>${detail}</body></html>`;
}

export function renderSidebarHtml(state: any, notice: any = null, options: { locale?: string } = {}) {
  const locale = options?.locale ?? state?.locale ?? getLocale();
  const tFn = getFixedT(locale);

  const trackingLabels = {
    ahead: tFn("sidebar.tracking.ahead"),
    behind: tFn("sidebar.tracking.behind"),
    diverged: tFn("sidebar.tracking.diverged"),
    "up-to-date": tFn("sidebar.tracking.upToDate"),
    "no-upstream": tFn("sidebar.tracking.noUpstream"),
    unknown: tFn("sidebar.tracking.unknown"),
  };
  const branch = state.branch ?? tFn("sidebar.detachedHead");
  const otherWorktrees = (state.worktrees ?? []).filter((worktree) => !worktree.isCurrent);
  const relaxedRules = state.relaxedRules ?? [];
  const upstream = state.upstream ?? tFn("sidebar.noUpstream");
  const syncState = state.tracking?.kind === "up-to-date" ? "synced" : state.tracking ? "pending" : "unknown";
  const tracking = state.tracking
    ? trackingLabels[state.tracking.kind] ?? state.tracking.kind
    : tFn("sidebar.tracking.fallback");
  const nextAction = state.nextAction ?? null;
  const inferredSafeLevel = ({
    clean: "safe",
    push: "safe",
    dirty: "warning",
    "push-dirty": "warning",
    pull: "warning",
    "first-push": "warning",
    unknown: "warning",
    diverged: "blocked",
    operation: "blocked",
  })[nextAction?.kind] ?? "idle";
  const safeLevel = notice?.level ?? (notice?.ok === false ? "blocked" : inferredSafeLevel);
  const safeLabel = ({
    safe: tFn("safeguard.safe"),
    warning: tFn("safeguard.warning"),
    blocked: tFn("safeguard.blocked"),
    idle: tFn("sidebar.safeIdle"),
  })[safeLevel] ?? tFn("sidebar.safeStatus");
  const changes = Array.isArray(state.changes) ? state.changes : [];
  const pullRisk = getActionRisk("pull", state);
  const pushRisk = getActionRisk("push", state);
  const incomingCount = Number(state.tracking?.behind ?? 0);
  const outgoingCount = Number(state.tracking?.ahead ?? 0);
  const primarySyncAction = state.operation
    ? null
    : state.tracking?.kind === "behind" || state.tracking?.kind === "diverged"
      ? "pull"
      : state.tracking?.kind === "ahead" || state.tracking?.kind === "no-upstream"
        ? "push"
        : null;
  const stagedChanges = changes.filter((item) => {
    const status = String(item.status ?? "");
    return status[0] && status[0] !== " " && status[0] !== "?";
  });
  const unstagedChanges = changes.filter((item) => {
    const status = String(item.status ?? "");
    return status === "??" || (status[1] && status[1] !== " ");
  });
  const statusLabel = (code, untracked = false) => {
    if (untracked) return tFn("sidebar.status.untracked");
    return ({
      A: tFn("sidebar.status.added"),
      M: tFn("sidebar.status.modified"),
      D: tFn("sidebar.status.deleted"),
      R: tFn("sidebar.status.renamed"),
      C: tFn("sidebar.status.copied"),
      U: tFn("sidebar.status.conflict"),
      T: tFn("sidebar.status.type"),
    })[code] ?? code ?? tFn("sidebar.status.changed");
  };
  const renderChangeTree = (items, area) => {
    const root = { folders: new Map(), files: [] };
    for (const item of items) {
      const parts = String(item.path ?? "").split("/").filter(Boolean);
      const fileName = parts.pop() ?? item.path ?? "";
      let node = root;
      for (const part of parts) {
        if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
        node = node.folders.get(part);
      }
      node.files.push({ ...item, fileName });
    }

    const renderNode = (node, depth = 0, parentPath = "") => {
      const folders = [...node.folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => {
          const path = parentPath ? `${parentPath}/${name}` : name;
          const action = area === "staged" ? "sidebarUnstage" : "sidebarStage";
          const symbol = area === "staged" ? "−" : "+";
          const title = area === "staged" ? tFn("sidebar.unstageFolder") : tFn("sidebar.stageFolder");
          return `<details class="scm-folder" open>
            <summary style="--tree-depth:${depth}"><span class="folder-caret">›</span><svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"></path><path d="M1.5 4.5V3h4.5l1.5 1.5"></path></svg><span class="folder-name">${escapeHtml(name)}</span><button class="folder-action ${area === "staged" ? "unstage-control" : "stage-control"}" type="button" data-action="${action}" data-path="${escapeHtml(path)}" title="${escapeHtml(title)}">${symbol}</button></summary>
            ${renderNode(child, depth + 1, path)}
          </details>`;
        })
        .join("");

      const files = [...node.files]
        .sort((a, b) => a.fileName.localeCompare(b.fileName))
        .map((item) => {
          const status = String(item.status ?? "");
          const untracked = status === "??";
          const code = area === "staged" ? (status[0] || "M") : (untracked ? "?" : (status[1] || "M"));
          const action = area === "staged" ? "sidebarUnstage" : "sidebarStage";
          const symbol = area === "staged" ? "−" : "+";
          const title = area === "staged" ? tFn("sidebar.unstageFile") : tFn("sidebar.stageFile");
          return `<div class="scm-file tree-file" style="--tree-depth:${depth}">
            <button class="file-open" type="button" data-action="sidebarDiff" data-path="${escapeHtml(item.path)}" title="${escapeHtml(tFn("sidebar.compareChanges"))}">
              <span class="status ${untracked || code === "A" ? "new" : ""}">${escapeHtml(statusLabel(code, untracked))}</span>
              <svg class="file-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h5l4 4v9h-9z"></path><path d="M8.5 1.8v4h3.8M5.5 8.5h5M5.5 11h5"></path></svg>
              <span class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.fileName)}</span>
            </button>
              <span class="file-actions">
                <button class="mini-action revert-control" type="button" data-action="sidebarDiscard" data-path="${escapeHtml(item.path)}" data-untracked="${untracked ? "1" : "0"}" title="${escapeHtml(tFn("sidebar.discardFileChanges"))}"><svg class="revert-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"></path><path d="M4 9h9a6 6 0 0 1 0 12h-2"></path></svg></button>
                <button class="mini-action ${area === "staged" ? "unstage-control" : "stage-control"}" type="button" data-action="${action}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(title)}">${symbol}</button>
              </span>
          </div>`;
        })
        .join("");

      return folders + files;
    };

    return renderNode(root);
  };

  const contextualAction = (() => {
    if (!nextAction) return null;
    if (nextAction.kind === "operation") return { action: "operationRecovery", label: tFn("sidebar.actions.continueAbort") };
    if (nextAction.kind === "pull") return { action: "pull", label: incomingCount > 0 ? tFn("sidebar.actions.pullCount", { count: incomingCount }) : "Pull" };
    if (["push", "push-dirty", "first-push"].includes(nextAction.kind)) return { action: "push", label: outgoingCount > 0 ? tFn("sidebar.actions.pushCount", { count: outgoingCount }) : "Push" };
    if (["unknown", "refresh"].includes(nextAction.kind)) return { action: "refresh", label: tFn("sidebar.actions.refreshRemote") };
    if (nextAction.kind === "remote-missing") return { action: "branchMenu", label: tFn("sidebar.actions.checkBranch") };
    if (nextAction.kind === "pull-blocked-dirty") return { action: "stashMenu", label: tFn("sidebar.actions.stashChanges") };
    if (nextAction.kind === "dirty" && unstagedChanges.length) return { action: "sidebarStageAll", label: tFn("sidebar.actions.stageAll") };
    if (nextAction.kind === "dirty" && stagedChanges.length) return { action: "focusCommit", label: tFn("sidebar.actions.focusCommit") };
    return null;
  })();

  const stagedRows = renderChangeTree(stagedChanges, "staged");
  const unstagedRows = renderChangeTree(unstagedChanges, "unstaged");
  const stagedGroup = stagedChanges.length ? `<details class="scm-group scm-card" open>
    <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">${escapeHtml(tFn("sidebar.staged"))}</span><span class="group-count">${stagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarUnstageAll" title="${escapeHtml(tFn("sidebar.unstageAllTitle"))}">${escapeHtml(tFn("sidebar.unstageAllButton"))}</button></summary>
    <div class="changes-mini">${stagedRows}</div>
  </details>` : "";
  const unstagedGroup = unstagedChanges.length ? `<details class="scm-group scm-card" open>
    <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">${escapeHtml(tFn("sidebar.unstaged"))}</span><span class="group-count">${unstagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarStageAll" title="${escapeHtml(tFn("sidebar.stageAllTitle"))}">${escapeHtml(tFn("sidebar.stageAllButton"))}</button></summary>
    <div class="changes-mini">${unstagedRows}</div>
  </details>` : "";
  const emptyChanges = !stagedChanges.length && !unstagedChanges.length
    ? `<div class="scm-empty">${escapeHtml(tFn("sidebar.emptyChanges"))}</div>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Git Next</title>
  <style>${SIDEBAR_SHELL_STYLES}${SIDEBAR_CHANGES_STYLES}${SIDEBAR_TOOLS_STYLES}</style>
</head>
<body>
  <main class="stack">
    <section class="section repo-head">
      <div class="branch-row">
        <div class="branch-identity">
          <div class="value">${escapeHtml(branch)}</div>
          <span class="upstream">[${escapeHtml(upstream)}]</span>
        </div>
        <div class="tracking"><span class="branch-dot ${syncState}" aria-hidden="true"></span>${escapeHtml(tracking)}</div>
        <div class="repo-actions">
          <button class="icon-button repo-action" type="button" data-action="openGraph" aria-label="${escapeHtml(tFn("sidebar.viewGraph"))}" title="${escapeHtml(tFn("sidebar.viewGraph"))}"><svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2"></circle><circle cx="18" cy="9" r="2.2"></circle><circle cx="8" cy="18" r="2.2"></circle><path d="m8 7 7.8 1.3M7 8l.8 7.7"></path></svg></button>
          <button class="icon-button repo-action" type="button" data-action="toolsMenu" data-tool="ai-diagnose" aria-label="${escapeHtml(tFn("sidebar.aiDiagnose"))}" title="${escapeHtml(tFn("sidebar.aiDiagnose"))}"><svg viewBox="0 0 24 24"><path d="M12 3l1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2L6.5 8.5l4.2-1.3z"></path><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"></path></svg></button>
          <button class="icon-button repo-action" type="button" data-action="refresh" aria-label="${escapeHtml(tFn("sidebar.sync"))}" title="${escapeHtml(tFn("sidebar.sync"))}"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"></path><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"></path></svg></button>
          <button class="icon-button repo-action tool-toggle" type="button" data-toggle-tools aria-expanded="false" aria-label="${escapeHtml(tFn("sidebar.gitTools"))}" title="${escapeHtml(tFn("sidebar.gitTools"))}"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
          <button class="icon-button repo-action" type="button" data-action="openKnowledge" aria-label="${escapeHtml(tFn("sidebar.help"))}" title="${escapeHtml(tFn("sidebar.help"))}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.2-1.8 2.8M12 17h.01"></path></svg></button>
        </div>
      </div>
      <div class="tool-panel" data-tool-panel hidden>
        <div class="tool-grid">
          <button class="tool-button" type="button" data-action="branchMenu" aria-label="${escapeHtml(tFn("sidebar.tools.branchAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.5"></circle><circle cx="6" cy="19" r="2.5"></circle><circle cx="18" cy="9" r="2.5"></circle><path d="M6 7.5v9M8.5 15c4.5 0 7-1.7 7-4.5"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.branch"))}</span></button>
          <button class="tool-button" type="button" data-action="tagMenu" aria-label="${escapeHtml(tFn("sidebar.tools.tagAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5v5.7L12.8 20 20 12.8 11.2 4H5.5A1.5 1.5 0 0 0 4 5.5Z"></path><circle cx="8.3" cy="8.3" r="1.2"></circle></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.tag"))}</span></button>
          <button class="tool-button" type="button" data-action="stashMenu" aria-label="${escapeHtml(tFn("sidebar.tools.stashAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7.5h14v10H5z"></path><path d="M8 4.5h8M8 12h8M12 9v6"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.stash"))}</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="doctor" aria-label="${escapeHtml(tFn("sidebar.tools.doctorAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.doctor"))}</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="recovery" aria-label="${escapeHtml(tFn("sidebar.tools.recoveryAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 8 5 12l4 4"></path><path d="M5 12h8a5 5 0 0 1 0 10"></path><path d="M16 5h3v3"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.recovery"))}</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="safe-guard" aria-label="${escapeHtml(tFn("sidebar.tools.safeGuardAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.safeGuard"))}</span></button>
          <button class="tool-button" type="button" data-action="changeLanguage" aria-label="${escapeHtml(tFn("sidebar.tools.languageAriaLabel"))}"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg></span><span class="tool-title">${escapeHtml(tFn("sidebar.tools.language"))}</span></button>
        </div>
      </div>
    </section>

    ${otherWorktrees.length ? `<div class="worktree-note">${escapeHtml(tFn("sidebar.worktreeNote", { count: otherWorktrees.length, details: otherWorktrees.map((item) => `${item.branch ?? tFn("sidebar.detachedHead")} · ${item.path}`).join(" / ") }))}</div>` : ""}
    ${relaxedRules.length ? `<div class="worktree-note" role="status">${escapeHtml(tFn("sidebar.relaxedRules", { rules: relaxedRules.join(", ") }))}</div>` : ""}
    <section class="status-hints">
      <div class="guard-summary ${safeLevel}" aria-label="${escapeHtml(tFn("sidebar.safeGuardAriaLabel", { status: safeLabel }))}">
        <span class="guard-summary-main">
          <span class="guard-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"></path><path d="m9 12 2 2 4-4"></path></svg></span>
          <span class="guard-title">Safe Guard</span>
        </span>
        <span class="guard-side">
          ${nextAction ? `<span class="guard-hint" data-tooltip="${escapeHtml([nextAction.title, nextAction.detail].filter(Boolean).join(" · "))}" aria-label="${escapeHtml(tFn("sidebar.statusHintAriaLabel", { hint: [nextAction.title, nextAction.detail].filter(Boolean).join(" · ") }))}"><span class="guard-hint-text"><strong>${escapeHtml(nextAction.title)}</strong>${nextAction.detail ? ` ${escapeHtml(nextAction.detail)}` : ""}</span></span>` : ""}
          <button class="guard-message-button" type="button" data-action="openSafeGuard" data-notice-message="${escapeHtml(notice?.message ?? tFn("sidebar.noInspectionResults"))}" data-notice-detail="${escapeHtml(notice?.detail ?? "")}" aria-label="${escapeHtml(tFn("sidebar.viewInspectionDetails"))}" title="${escapeHtml(tFn("sidebar.viewInspectionDetails"))}"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"></path><path d="m5 7 7 6 7-6"></path></svg></button>
        </span>
      </div>
      ${contextualAction ? `<div class="guard-recommendation"><span class="guard-recommendation-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h12"></path><path d="m13 8 4 4-4 4"></path></svg></span><span class="guard-recommendation-copy"><span class="guard-recommendation-label">${escapeHtml(tFn("sidebar.nextRecommendation"))}</span><button class="guard-next-action" type="button" data-action="${contextualAction.action}" title="${escapeHtml(tFn("sidebar.recommendedActionTitle", { action: contextualAction.label }))}">${escapeHtml(contextualAction.label)}</button></span></div>` : ""}
      ${notice?.actions?.includes("operation-recovery") && contextualAction?.action !== "operationRecovery" ? `<button class="linkish" type="button" data-action="operationRecovery">${escapeHtml(tFn("sidebar.operationRecoveryLink"))}</button>` : ""}
    </section>

    <section class="section action-panel">
      <div class="commit-compose">
        <div class="commit-input-wrap">
          <input class="commit-input" id="sidebar-commit-message" type="text" placeholder="${escapeHtml(tFn("sidebar.commitPlaceholder"))}" />
          <button class="icon-button commit-helper" type="button" data-action="toolsMenu" data-tool="commit" aria-label="${escapeHtml(tFn("sidebar.commitHelper"))}" title="${escapeHtml(tFn("sidebar.commitHelper"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"></path><path d="M8 9h8M8 13h5"></path></svg></button>
        </div>
        <button class="primary" type="button" data-action="sidebarCommit">${escapeHtml(tFn("sidebar.commitButton"))}</button>
      </div>
      <div class="commit-secondary-row">
        <button class="commit-undo" type="button" data-action="sidebarUndoCommit" title="${escapeHtml(tFn("sidebar.undoCommitTooltip"))}">${escapeHtml(tFn("sidebar.undoCommit"))}</button>
      </div>
      <div class="sync-row">
        <button class="sync-button ${primarySyncAction === "pull" ? "is-primary-sync" : ""}" type="button" data-action="pull" title="${escapeHtml(localizeRiskReason(pullRisk.reason, tFn))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 11 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path></svg>
          <span>Pull${incomingCount > 0 ? ` ${incomingCount}` : ""}</span>
          ${actionRiskBadge("pull", state, tFn)}
        </button>
        <button class="sync-button ${primarySyncAction === "push" ? "is-primary-sync" : ""}" type="button" data-action="push" title="${escapeHtml(localizeRiskReason(pushRisk.reason, tFn))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="m7.5 13 4.5-4.5 4.5 4.5"></path><path d="M5 4h14"></path></svg>
          <span>Push${outgoingCount > 0 ? ` ${outgoingCount}` : ""}</span>
          ${actionRiskBadge("push", state, tFn)}
        </button>
      </div>
    </section>

    <section class="section source-control">
      <div class="scm-head">
        <div class="eyebrow">${escapeHtml(tFn("sidebar.changesHead"))}</div>
        <div class="scm-summary-actions">
          <span class="scm-count">${escapeHtml(tFn("sidebar.changesCount", { count: changes.length }))}</span>
        </div>
      </div>
      <div class="scm-groups">
        ${stagedGroup}
        ${unstagedGroup}
        ${emptyChanges}
      </div>
    </section>
  </main>
  <script>${SIDEBAR_INTERACTIONS}</script>
</body>
</html>`;
}
