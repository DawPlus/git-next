import { escapeHtml } from "./view-shared.mjs";
import { getActionRisk } from "./git-safety.mjs";
import { SIDEBAR_SHELL_STYLES } from "./sidebar-shell-styles.mjs";
import { SIDEBAR_CHANGES_STYLES } from "./sidebar-changes-styles.mjs";
import { SIDEBAR_TOOLS_STYLES } from "./sidebar-tools-styles.mjs";
import { SIDEBAR_INTERACTIONS } from "./sidebar-interactions.mjs";

function actionRiskBadge(action, state) {
  const risk = getActionRisk(action, state);
  const label = ({ low: "낮음", medium: "보통", high: "높음" })[risk.level];
  return `<span class="action-risk ${risk.level}" title="${escapeHtml(risk.reason)}" aria-label="위험도 ${label}: ${escapeHtml(risk.reason)}">${label}</span>`;
}

export function renderSafeGuardDetailsHtml(notice) {
  const message = escapeHtml(notice?.message ?? "실행된 검사 결과가 없습니다.");
  const detail = notice?.detail ? `<h2>Git 상세 정보</h2><pre>${escapeHtml(notice.detail)}</pre>` : "";
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safe Guard</title><body style="font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:20px;line-height:1.6"><h1>Safe Guard</h1><p>${message}</p>${detail}</body></html>`;
}

export function renderSidebarHtml(state, notice = null) {
  const trackingLabels = {
    ahead: "로컬 앞섬",
    behind: "원격 앞섬",
    diverged: "분기됨",
    "up-to-date": "동기화됨",
    "no-upstream": "원격 연결 없음",
    unknown: "상태 확인 불가",
  };
  const branch = state.branch ?? "분리된 HEAD";
  const otherWorktrees = (state.worktrees ?? []).filter((worktree) => !worktree.isCurrent);
  const relaxedRules = state.relaxedRules ?? [];
  const upstream = state.upstream ?? "원격 연결 없음";
  const syncState = state.tracking?.kind === "up-to-date" ? "synced" : state.tracking ? "pending" : "unknown";
  const tracking = state.tracking
    ? trackingLabels[state.tracking.kind] ?? state.tracking.kind
    : "추적 상태 확인 불가";
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
    safe: "안전",
    warning: "주의",
    blocked: "차단",
    idle: "대기",
  })[safeLevel] ?? "상태";
  const changes = Array.isArray(state.changes) ? state.changes : [];
  const pullRisk = getActionRisk("pull", state);
  const pushRisk = getActionRisk("push", state);
  const stagedChanges = changes.filter((item) => {
    const status = String(item.status ?? "");
    return status[0] && status[0] !== " " && status[0] !== "?";
  });
  const unstagedChanges = changes.filter((item) => {
    const status = String(item.status ?? "");
    return status === "??" || (status[1] && status[1] !== " ");
  });
  const statusLabel = (code, untracked = false) => {
    if (untracked) return "신규";
    return ({
      A: "신규",
      M: "수정",
      D: "삭제",
      R: "이름",
      C: "복사",
      U: "충돌",
      T: "타입",
    })[code] ?? code ?? "변경";
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
          const title = area === "staged" ? "폴더 전체 Unstage" : "폴더 전체 Stage";
          return `<details class="scm-folder" open>
            <summary style="--tree-depth:${depth}"><span class="folder-caret">›</span><svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"></path><path d="M1.5 4.5V3h4.5l1.5 1.5"></path></svg><span class="folder-name">${escapeHtml(name)}</span><button class="folder-action ${area === "staged" ? "unstage-control" : "stage-control"}" type="button" data-action="${action}" data-path="${escapeHtml(path)}" title="${title}">${symbol}</button></summary>
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
          const title = area === "staged" ? "Staging에서 빼기" : "Staging에 넣기";
          return `<div class="scm-file tree-file" style="--tree-depth:${depth}">
            <button class="file-open" type="button" data-action="sidebarDiff" data-path="${escapeHtml(item.path)}" title="변경 내용 비교">
              <span class="status ${untracked || code === "A" ? "new" : ""}">${escapeHtml(statusLabel(code, untracked))}</span>
              <svg class="file-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h5l4 4v9h-9z"></path><path d="M8.5 1.8v4h3.8M5.5 8.5h5M5.5 11h5"></path></svg>
              <span class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.fileName)}</span>
            </button>
              <span class="file-actions">
                <button class="mini-action revert-control" type="button" data-action="sidebarDiscard" data-path="${escapeHtml(item.path)}" data-untracked="${untracked ? "1" : "0"}" title="파일 변경 되돌리기"><svg class="revert-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"></path><path d="M4 9h9a6 6 0 0 1 0 12h-2"></path></svg></button>
                <button class="mini-action ${area === "staged" ? "unstage-control" : "stage-control"}" type="button" data-action="${action}" data-path="${escapeHtml(item.path)}" title="${title}">${symbol}</button>
              </span>
          </div>`;
        })
        .join("");

      return folders + files;
    };

    return renderNode(root);
  };

  const stagedRows = renderChangeTree(stagedChanges, "staged");
  const unstagedRows = renderChangeTree(unstagedChanges, "unstaged");
  const stagedGroup = stagedChanges.length ? `<details class="scm-group scm-card" open>
    <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">Staged</span><span class="group-count">${stagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarUnstageAll" title="전체 Unstage">전체 −</button></summary>
    <div class="changes-mini">${stagedRows}</div>
  </details>` : "";
  const unstagedGroup = unstagedChanges.length ? `<details class="scm-group scm-card" open>
    <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">변경사항</span><span class="group-count">${unstagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarStageAll" title="전체 Stage">전체 +</button></summary>
    <div class="changes-mini">${unstagedRows}</div>
  </details>` : "";
  const emptyChanges = !stagedChanges.length && !unstagedChanges.length
    ? '<div class="scm-empty">변경사항이 없습니다.</div>'
    : "";

  return `<!doctype html>
<html lang="ko">
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
          <button class="icon-button repo-action" type="button" data-action="openGraph" aria-label="그래프 보기" title="그래프 보기"><svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2"></circle><circle cx="18" cy="9" r="2.2"></circle><circle cx="8" cy="18" r="2.2"></circle><path d="m8 7 7.8 1.3M7 8l.8 7.7"></path></svg></button>
          <button class="icon-button repo-action" type="button" data-action="toolsMenu" data-tool="ai-diagnose" aria-label="AI 진단" title="AI 진단"><svg viewBox="0 0 24 24"><path d="M12 3l1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2L6.5 8.5l4.2-1.3z"></path><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"></path></svg></button>
          <button class="icon-button repo-action" type="button" data-action="refresh" aria-label="동기화" title="동기화"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"></path><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"></path></svg></button>
          <button class="icon-button repo-action tool-toggle" type="button" data-toggle-tools aria-expanded="false" aria-label="Git 도구" title="Git 도구"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
          <button class="icon-button repo-action" type="button" data-action="openKnowledge" aria-label="도움말" title="도움말"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.2-1.8 2.8M12 17h.01"></path></svg></button>
        </div>
      </div>
      <div class="tool-panel" data-tool-panel hidden>
        <div class="tool-grid">
          <button class="tool-button" type="button" data-action="branchMenu" aria-label="브랜치 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.5"></circle><circle cx="6" cy="19" r="2.5"></circle><circle cx="18" cy="9" r="2.5"></circle><path d="M6 7.5v9M8.5 15c4.5 0 7-1.7 7-4.5"></path></svg></span><span class="tool-title">브랜치</span></button>
          <button class="tool-button" type="button" data-action="tagMenu" aria-label="태그 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5v5.7L12.8 20 20 12.8 11.2 4H5.5A1.5 1.5 0 0 0 4 5.5Z"></path><circle cx="8.3" cy="8.3" r="1.2"></circle></svg></span><span class="tool-title">태그</span></button>
          <button class="tool-button" type="button" data-action="stashMenu" aria-label="Stash 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7.5h14v10H5z"></path><path d="M8 4.5h8M8 12h8M12 9v6"></path></svg></span><span class="tool-title">Stash</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="doctor" aria-label="Git Doctor"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"></path></svg></span><span class="tool-title">Doctor</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="recovery" aria-label="복구 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 8 5 12l4 4"></path><path d="M5 12h8a5 5 0 0 1 0 10"></path><path d="M16 5h3v3"></path></svg></span><span class="tool-title">복구</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" data-tool="safe-guard" aria-label="Safe Guard 규칙"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"></path></svg></span><span class="tool-title">Safe Guard</span></button>
        </div>
      </div>
    </section>

    ${otherWorktrees.length ? `<div class="worktree-note">다른 작업 폴더 ${otherWorktrees.length}개 · ${otherWorktrees.map((item) => `${item.branch ?? "분리된 HEAD"} · ${item.path}`).map(escapeHtml).join(" / ")}</div>` : ""}
    ${relaxedRules.length ? `<div class="worktree-note" role="status">세션 동안 완화된 보호: ${relaxedRules.map(escapeHtml).join(", ")}</div>` : ""}
    <section class="status-hints">
      <div class="guard-summary ${safeLevel}" aria-label="Safe Guard 상태: ${escapeHtml(safeLabel)}">
        <span class="guard-summary-main">
          <span class="guard-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"></path><path d="m9 12 2 2 4-4"></path></svg></span>
          <span class="guard-title">Safe Guard</span>
        </span>
        <span class="guard-side">
          ${nextAction ? `<span class="guard-hint"><strong>${escapeHtml(nextAction.title)}</strong>${nextAction.detail ? ` ${escapeHtml(nextAction.detail)}` : ""}</span>` : ""}
          <button class="guard-message-button" type="button" data-action="openSafeGuard" data-notice-message="${escapeHtml(notice?.message ?? "실행된 검사 결과가 없습니다.")}" data-notice-detail="${escapeHtml(notice?.detail ?? "")}" aria-label="검사 결과 상세 보기" title="검사 결과 상세 보기"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"></path><path d="m5 7 7 6 7-6"></path></svg></button>
        </span>
      </div>
      ${notice?.actions?.includes("operation-recovery") ? '<button class="linkish" type="button" data-action="operationRecovery">진행 중 작업 Continue / Abort</button>' : ""}
    </section>

    <section class="section action-panel">
      <div class="commit-compose">
        <div class="commit-input-wrap">
          <input class="commit-input" id="sidebar-commit-message" type="text" placeholder="Commit message 입력" />
          <button class="icon-button commit-helper" type="button" data-action="toolsMenu" data-tool="commit" aria-label="Commit 메시지 도우미" title="Commit 메시지 도우미"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"></path><path d="M8 9h8M8 13h5"></path></svg></button>
        </div>
        <button class="primary" type="button" data-action="sidebarCommit">Commit</button>
      </div>
      <div class="sync-row">
        <button class="sync-button" type="button" data-action="pull" title="${escapeHtml(pullRisk.reason)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 11 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path></svg>
          <span>Pull</span>
          ${actionRiskBadge("pull", state)}
        </button>
        <button class="sync-button" type="button" data-action="push" title="${escapeHtml(pushRisk.reason)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="m7.5 13 4.5-4.5 4.5 4.5"></path><path d="M5 4h14"></path></svg>
          <span>Push</span>
          ${actionRiskBadge("push", state)}
        </button>
      </div>
    </section>

    <section class="section source-control">
      <div class="scm-head">
        <div class="eyebrow">변경사항</div>
        <div class="scm-summary-actions">
          <span class="scm-count">${changes.length}개</span>
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
