import { escapeHtml } from "./view-shared.mjs";

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
  const upstream = state.upstream ?? "원격 연결 없음";
  const syncState = state.tracking?.kind === "up-to-date" ? "synced" : state.tracking ? "pending" : "unknown";
  const tracking = state.tracking
    ? trackingLabels[state.tracking.kind] ?? state.tracking.kind
    : "추적 상태 확인 불가";
  const safeLevel = notice?.level ?? (notice?.ok === false ? "blocked" : "safe");
  const safeLabel = notice
    ? ({
        safe: "안전",
        warning: "주의",
        blocked: "차단",
      }[safeLevel] ?? "상태")
    : "확인 전";
  const nextAction = state.nextAction ?? null;
  const changes = Array.isArray(state.changes) ? state.changes : [];
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

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Git Next</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      height: 100vh;
      overflow: hidden;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }
    .stack {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .section {
      padding: 10px 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
      min-width: 0;
    }
    .section:last-child { border-bottom: 0; }
    .eyebrow {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      letter-spacing: .055em;
      text-transform: uppercase;
    }
    .repo-head {
      display: grid;
      gap: 6px;
    }
    .icon-button {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 4px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      flex: none;
      transition: transform 120ms ease, color 120ms ease, background 120ms ease;
    }
    .icon-button:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
      transform: rotate(12deg);
    }
    .icon-button svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .branch-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .branch-identity { display: flex; align-items: baseline; gap: 4px; min-width: 0; flex: 1; }
    .repo-actions {
      display: flex;
      align-items: center;
      margin-left: auto;
      flex: none;
      gap: 3px;
    }
    .repo-action { width: 25px; height: 25px; }
    .repo-action:hover { transform: none; }
    .branch-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--vscode-gitDecoration-addedResourceForeground);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 14%, transparent);
      flex: none;
    }
    .branch-dot.pending { background: var(--vscode-editorWarning-foreground); box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-editorWarning-foreground) 14%, transparent); }
    .branch-dot.unknown { background: var(--vscode-descriptionForeground); box-shadow: none; }
    .value {
      min-width: 0;
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tracking {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: none;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .upstream {
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .scm-head,
    .scm-summary,
    .scm-file {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .scm-head {
      justify-content: space-between;
      margin-bottom: 7px;
    }
    .scm-summary {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      gap: 9px;
    }
    .scm-summary-actions {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .scm-count {
      color: var(--vscode-foreground);
      font-weight: 700;
    }
    .commit-input {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 7px;
      padding: 6px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
      font-size: 12px;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .commit-input:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 22%, transparent);
    }
    .commit-compose {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
    }
    .commit-row-actions {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 5px;
      margin-top: 6px;
    }
    .compare-button {
      min-width: 34px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 76%, transparent);
      border-radius: 5px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
    }
    .scm-groups {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 5px;
      min-height: 0;
      margin-top: 4px;
      overflow: hidden;
    }
    .scm-group {
      min-width: 0;
      min-height: 0;
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .scm-group[open]::details-content {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .scm-group:not([open]) { flex: 0 0 auto; }
    .scm-group-head::-webkit-details-marker { display: none; }
    .group-caret {
      color: var(--vscode-descriptionForeground);
      transition: transform 120ms ease;
    }
    .scm-group[open] .group-caret { transform: rotate(90deg); }
    .scm-card {
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, transparent);
      border-radius: 7px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 94%, var(--vscode-foreground));
    }
    .scm-group-head {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 3px 6px;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground) 60%, transparent);
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
      list-style: none;
    }
    .scm-group-head:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .scm-group-head .group-title {
      min-width: 0;
      flex: 1;
    }
    .scm-group-head .group-count {
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
    }
    .scm-group-head .group-action {
      border: 0;
      padding: 1px 4px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      font-size: 11px;
    }
    .scm-group-head .group-action:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
      border-radius: 3px;
    }
    .scm-group-head .group-action:disabled {
      opacity: .45;
      cursor: default;
    }
    .scm-summary-actions .group-action {
      border: 0;
      padding: 1px 4px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      font-size: 11px;
    }
    .scm-summary-actions .group-action:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
      border-radius: 3px;
    }
    .changes-mini {
      display: grid;
      flex: 1 1 0;
      min-width: 0;
      gap: 0;
      min-height: 0;
      height: 0;
      padding: 2px;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
    }
    .changes-mini .empty {
      padding: 4px 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .scm-folder {
      min-width: 0;
    }
    .scm-folder > summary {
      display: flex;
      align-items: center;
      gap: 3px;
      min-height: 24px;
      padding-left: calc(2px + (var(--tree-depth) * 12px));
      padding-right: 2px;
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      list-style: none;
      font-size: 11px;
      user-select: none;
    }
    .scm-folder > summary::-webkit-details-marker { display: none; }
    .scm-folder > summary:hover { background: var(--vscode-list-hoverBackground); }
    .scm-file .mini-action,
    .folder-action {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      flex: none;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 5px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
      transition: color 120ms ease, border-color 120ms ease;
    }
    .folder-action { margin-left: auto; }
    .scm-file .mini-action:hover,
    .folder-action:hover {
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 42%, var(--vscode-panel-border));
    }
    .scm-file .mini-action:active,
    .folder-action:active { border-color: var(--vscode-focusBorder); }
    .folder-action:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .folder-caret {
      width: 11px;
      flex: none;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform 100ms ease;
    }
    .scm-folder[open] > summary .folder-caret { transform: rotate(90deg); }
    .folder-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 550;
    }
    .scm-file {
      min-height: 24px;
      padding: 0 2px;
      border-radius: 5px;
      font-size: 11px;
    }
    .tree-file {
      padding-left: calc(2px + (var(--tree-depth) * 12px));
    }
    .file-spacer {
      width: 11px;
      flex: none;
    }
    .scm-file:hover { background: var(--vscode-list-hoverBackground); }
    .file-open {
      display: flex;
      align-items: center;
      gap: 3px;
      min-width: 0;
      flex: 1;
      border: 0;
      border-radius: 4px;
      padding: 0 2px;
      color: inherit;
      background: transparent;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .file-open:hover .path { color: var(--vscode-textLink-activeForeground); }
    .file-open:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    .folder-icon,
    .file-icon {
      width: 13px;
      height: 13px;
      flex: none;
      fill: color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent);
      stroke: var(--vscode-descriptionForeground);
      stroke-width: 1.15;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .scm-file .status {
      width: 24px;
      flex: none;
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 9px;
      text-align: center;
    }
    .scm-file .status.new {
      color: var(--vscode-gitDecoration-untrackedResourceForeground, var(--vscode-gitDecoration-addedResourceForeground));
    }
    .scm-file .path {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .scm-file .mini-action:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .scm-file .stage-control,
    .folder-action.stage-control {
      color: var(--vscode-gitDecoration-addedResourceForeground);
    }
    .scm-file .unstage-control,
    .folder-action.unstage-control {
      color: var(--vscode-editorWarning-foreground);
    }
    .scm-file .revert-control {
      color: var(--vscode-editorError-foreground, var(--vscode-errorForeground));
    }
    .revert-icon {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .file-actions {
      display: flex;
      flex: none;
      align-items: center;
      gap: 2px;
      margin-left: auto;
    }
    .scm-file {
      transition: transform 180ms cubic-bezier(.2, .8, .2, 1), opacity 180ms ease;
    }
    .scm-file.is-moving-up { transform: translateY(-7px); opacity: 0; }
    .scm-file.is-moving-down { transform: translateY(7px); opacity: 0; }
    .more-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 5px;
    }
    .tool-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 0;
      padding: 3px 0;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      font-size: 11px;
    }
    .tool-panel[hidden] { display: none; }
    button {
      font: inherit;
    }
    .primary,
    .sync-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      font-weight: 650;
    }
    .primary {
      width: auto;
      min-width: 72px;
      min-height: 32px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 5px;
      padding: 5px 8px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font-size: 13px;
    }
    .primary:hover { background: var(--vscode-button-hoverBackground); }
    .sync-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin-top: 0;
    }
    .sync-button {
      min-height: 28px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 76%, transparent);
      border-radius: 5px;
      padding: 4px 6px;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground) 72%, transparent);
      font-size: 12px;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .primary {
      transition: transform 120ms ease, background 120ms ease;
    }
    .primary:hover,
    .sync-button:hover {
      transform: translateY(-1px);
    }
    .primary:active,
    .sync-button:active,
    .tool-button:active,
    .icon-button:active {
      transform: scale(.97);
    }
    .primary svg,
    .sync-button svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex: none;
    }
    .sync-button:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .tool-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 5px;
      margin-top: 6px;
    }
    .tool-button {
      display: grid;
      justify-items: center;
      align-content: center;
      width: calc(33.333% - 4px);
      min-width: 58px;
      min-height: 58px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, transparent);
      border-radius: 6px;
      padding: 6px 4px;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground) 62%, transparent);
      cursor: pointer;
      text-align: center;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .tool-button:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 60%, var(--vscode-panel-border));
      background: var(--vscode-list-hoverBackground);
      transform: translateY(-1px);
    }
    .tool-button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .tool-icon {
      display: inline-grid;
      place-items: center;
      width: 21px;
      height: 21px;
      margin-bottom: 4px;
      border-radius: 5px;
      color: var(--vscode-textLink-foreground);
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 11%, transparent);
    }
    .tool-icon svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .tool-title {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
    }
    @media (max-width: 220px) {
      .tool-button {
        width: calc(50% - 3px);
      }
    }
    .source-control {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      padding: 4px;
      overflow: hidden;
      border-bottom: 0;
    }
    .action-panel {
      display: grid;
      flex: none;
      gap: 6px;
      padding: 6px 4px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
    }
    .guard-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
      min-height: 32px;
      padding: 4px 7px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 76%, transparent);
      border-left: 3px solid var(--vscode-testing-iconPassed);
      border-radius: 7px;
      background: color-mix(in srgb, var(--vscode-testing-iconPassed) 5%, var(--vscode-sideBar-background));
      list-style: none;
    }
    .guard-summary.warning { border-left-color: var(--vscode-editorWarning-foreground); background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 6%, var(--vscode-sideBar-background)); }
    .guard-summary.blocked { border-left-color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 6%, var(--vscode-sideBar-background)); }
    .guard-summary.idle { border-left-color: var(--vscode-descriptionForeground); background: color-mix(in srgb, var(--vscode-descriptionForeground) 4%, var(--vscode-sideBar-background)); }
    .guard-mark { display: grid; width: 22px; height: 22px; place-items: center; color: var(--vscode-testing-iconPassed); }
    .guard-summary.warning .guard-mark { color: var(--vscode-editorWarning-foreground); }
    .guard-summary.blocked .guard-mark { color: var(--vscode-errorForeground); }
    .guard-summary.idle .guard-mark { color: var(--vscode-descriptionForeground); }
    .guard-mark svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .guard-message-button svg,
    .hint-mark svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .guard-message-button {
      position: relative;
      display: grid;
      width: 26px;
      height: 26px;
      place-items: center;
      border: 0;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
    }
    .guard-message-button.has-notice::after {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-errorForeground);
      content: "";
    }
    .guard-summary-main { display: flex; align-items: center; gap: 7px; flex: none; min-width: 0; }
    .guard-summary .eyebrow { flex: none; }
    .hint-message { display: flex; gap: 6px; align-items: flex-start; padding: 6px 8px; border-radius: 6px; color: var(--vscode-descriptionForeground); background: color-mix(in srgb, var(--vscode-textLink-foreground) 7%, transparent); font-size: 11px; line-height: 1.4; }
    .hint-mark { color: var(--vscode-textLink-foreground); flex: none; }
    .status-hints {
      display: grid;
      flex: none;
      gap: 5px;
      padding: 5px 8px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
    }
    .guard-state {
      display: flex;
      align-items: center;
      gap: 5px;
      margin: 0;
      font-weight: 600;
      font-size: 12px;
    }
    .guard-state::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-testing-iconPassed);
      box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 8%, transparent);
      flex: none;
    }
    .guard-summary.idle .guard-state {
      color: var(--vscode-descriptionForeground);
    }
    .guard-summary.idle .guard-state::before {
      background: color-mix(in srgb,var(--vscode-descriptionForeground) 70%,transparent);
      box-shadow: none;
    }
    .guard-summary.warning .guard-state::before {
      background: var(--vscode-editorWarning-foreground);
    }
    .guard-summary.blocked .guard-state::before {
      background: var(--vscode-errorForeground);
    }
    .guard-message-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .linkish {
      border: 0;
      padding: 2px 0;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      font-size: 12px;
      cursor: pointer;
    }
    .linkish:hover { color: var(--vscode-textLink-activeForeground); }
    @media (prefers-reduced-motion: reduce) {
      .stack { animation: none; }
      .icon-button,
      .primary,
      .commit-input,
      .scm-file .mini-action,
      .folder-action,
      .repo-action,
      .sync-button,
      .tool-button { transition: none; }
      .icon-button:hover,
      .primary:hover,
      .scm-file,
      .scm-file .mini-action:hover,
      .folder-action:hover,
      .repo-action:hover,
      .sync-button:hover,
      .tool-button:hover { transform: none; }
      .scm-file.is-moving-up,
      .scm-file.is-moving-down { opacity: 0; }
    }
  </style>
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
          <button class="icon-button repo-action" type="button" data-action="openKnowledge" aria-label="동기화 도움말" title="동기화 도움말"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"></path><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"></path></svg></button>
          <button class="icon-button repo-action tool-toggle" type="button" data-toggle-tools aria-expanded="false" aria-label="Git 도구" title="Git 도구"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
          <button class="icon-button repo-action" type="button" data-action="openKnowledge" aria-label="도움말" title="도움말"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.2-1.8 2.8M12 17h.01"></path></svg></button>
        </div>
      </div>
      <div class="tool-panel" data-tool-panel hidden>
        <div class="tool-grid">
          <button class="tool-button" type="button" data-action="branchMenu" aria-label="브랜치 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.5"></circle><circle cx="6" cy="19" r="2.5"></circle><circle cx="18" cy="9" r="2.5"></circle><path d="M6 7.5v9M8.5 15c4.5 0 7-1.7 7-4.5"></path></svg></span><span class="tool-title">브랜치</span></button>
          <button class="tool-button" type="button" data-action="tagMenu" aria-label="태그 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5v5.7L12.8 20 20 12.8 11.2 4H5.5A1.5 1.5 0 0 0 4 5.5Z"></path><circle cx="8.3" cy="8.3" r="1.2"></circle></svg></span><span class="tool-title">태그</span></button>
          <button class="tool-button" type="button" data-action="stashMenu" aria-label="Stash 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7.5h14v10H5z"></path><path d="M8 4.5h8M8 12h8M12 9v6"></path></svg></span><span class="tool-title">Stash</span></button>
          <button class="tool-button" type="button" data-action="toolsMenu" aria-label="추가 Git 도구"><span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg></span><span class="tool-title">더보기</span></button>
        </div>
      </div>
    </section>

    <section class="status-hints">
      <div class="guard-summary ${notice ? safeLevel : "idle"}">
        <span class="guard-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"></path><path d="m9 12 2 2 4-4"></path></svg></span>
        <span class="guard-summary-main"><span class="eyebrow">Safe Guard</span><span class="guard-state">${escapeHtml(safeLabel)}</span></span>
        <button class="guard-message-button ${notice ? "has-notice" : ""}" type="button" data-action="openSafeGuard" data-notice-message="${escapeHtml(notice?.message ?? "실행된 검사 결과가 없습니다.")}" data-notice-detail="${escapeHtml(notice?.detail ?? "")}" aria-label="검사 결과 상세 보기" title="검사 결과 상세 보기"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"></path><path d="m5 7 7 6 7-6"></path></svg></button>
      </div>
      ${nextAction ? `<div class="hint-message"><span class="hint-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M9 18h6M10 21h4M8 14c-1.2-1-2-2.5-2-4.2a6 6 0 1 1 12 0c0 1.7-.8 3.2-2 4.2-.6.5-1 1.1-1 2h-6c0-.9-.4-1.5-1-2Z"></path></svg></span><span><strong>${escapeHtml(nextAction.title)}</strong>${nextAction.detail ? ` ${escapeHtml(nextAction.detail)}` : ""}</span></div>` : ""}
    </section>

    <section class="section action-panel">
      <div class="commit-compose">
        <input class="commit-input" id="sidebar-commit-message" type="text" placeholder="Commit message 입력" />
        <button class="primary" type="button" data-action="sidebarCommit">Commit</button>
      </div>
      <div class="sync-row">
        <button class="sync-button" type="button" data-action="pull">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 11 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path></svg>
          <span>받기 · Pull</span>
        </button>
        <button class="sync-button" type="button" data-action="push">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="m7.5 13 4.5-4.5 4.5 4.5"></path><path d="M5 4h14"></path></svg>
          <span>보내기 · Push</span>
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
        <details class="scm-group scm-card" open>
          <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">Staged</span><span class="group-count">${stagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarUnstageAll" title="전체 Unstage" ${stagedChanges.length ? "" : "disabled"}>전체 −</button></summary>
          <div class="changes-mini">${stagedRows || '<div class="empty">Staged 변경 없음</div>'}</div>
        </details>
        <details class="scm-group scm-card" open>
          <summary class="scm-group-head"><span class="group-caret">›</span><span class="group-title">변경사항</span><span class="group-count">${unstagedChanges.length}</span><button class="group-action" type="button" data-action="sidebarStageAll" title="전체 Stage" ${unstagedChanges.length ? "" : "disabled"}>전체 +</button></summary>
          <div class="changes-mini">${unstagedRows || '<div class="empty">미포함 변경 없음</div>'}</div>
        </details>
      </div>
    </section>
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll("[data-action]")) {
      button.addEventListener("click", (event) => {
        if (button.classList.contains("folder-action") || button.closest(".scm-group-head")) {
          event.preventDefault();
          event.stopPropagation();
        }
        const message = {
          type: button.dataset.action,
          guideKey: button.dataset.guideKey ?? null,
          noticeMessage: button.dataset.noticeMessage ?? null,
          noticeDetail: button.dataset.noticeDetail ?? null,
          path: button.dataset.path ?? null,
          untracked: button.dataset.untracked === "1",
          message: document.querySelector("#sidebar-commit-message")?.value ?? "",
        };
        const row = button.closest(".scm-file");
        if (row && button.classList.contains("mini-action") && ["sidebarStage", "sidebarUnstage"].includes(message.type) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          button.disabled = true;
          row.classList.add(message.type === "sidebarStage" ? "is-moving-up" : "is-moving-down");
          window.setTimeout(() => vscode.postMessage(message), 180);
          return;
        }
        vscode.postMessage(message);
      });
    }
    const toolToggle = document.querySelector("[data-toggle-tools]");
    const toolPanel = document.querySelector("[data-tool-panel]");
    toolToggle?.addEventListener("click", () => {
      const opening = toolPanel?.hasAttribute("hidden");
      if (opening) toolPanel?.removeAttribute("hidden");
      else toolPanel?.setAttribute("hidden", "");
      toolToggle.setAttribute("aria-expanded", String(Boolean(opening)));
    });
  </script>
</body>
</html>`;
}
