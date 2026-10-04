import { escapeHtml } from "./view-shared.mjs";

const LANE_COLORS = [
  "#6f8f7a",
  "#7187a6",
  "#a07b6f",
  "#8e78a3",
  "#5f9390",
  "#a08a5f",
  "#7f7fa7",
  "#9a6f86",
  "#6d8f9f",
  "#879568",
  "#8f765f",
  "#667f9a",
];


export function layoutGraph(commits) {
  const lanes = [];

  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.id);

    if (lane === -1) {
      lane = lanes.findIndex((entry) => entry === null);

      if (lane === -1) {
        lane = lanes.length;
      }

      lanes[lane] = commit.id;
    }

    lanes[lane] = null;

    const parentLanes = commit.parents.map((parent, index) => {
      const existingLane = lanes.indexOf(parent);

      if (existingLane !== -1) {
        return existingLane;
      }

      if (index === 0 && lanes[lane] === null) {
        lanes[lane] = parent;
        return lane;
      }

      let parentLane = lanes.findIndex((entry, candidate) => candidate > lane && entry === null);

      if (parentLane === -1) {
        parentLane = lanes.length;
      }

      lanes[parentLane] = parent;
      return parentLane;
    });

    while (lanes.at(-1) === null) {
      lanes.pop();
    }

    return {
      ...commit,
      lane,
      parentLanes,
    };
  });
}


export function filterGraphState(state, options = {}) {
  if (state.kind !== "repository") {
    return state;
  }

  const scope = options.scope ?? "all";
  const focus = options.focus ?? "all";
  const selectedRef = options.ref ?? "";
  const query = String(options.query ?? "").trim().toLowerCase();
  const limit = Math.max(1, Number(options.limit ?? 50));
  const commitMap = new Map(state.commits.map((commit) => [commit.id, commit]));
  let allowed = new Set(state.commits.map((commit) => commit.id));

  if (selectedRef) {
    const ref = state.refs.find((item) => item.fullName === selectedRef || item.name === selectedRef);
    if (ref) {
      const ancestry = new Set();
      const stack = [ref.target];
      while (stack.length) {
        const id = stack.pop();
        if (!id || ancestry.has(id)) continue;
        ancestry.add(id);
        const commit = commitMap.get(id);
        if (commit) stack.push(...commit.parents);
      }
      allowed = ancestry;
    }
  }

  if (query) {
    const matched = state.commits.filter((commit) =>
      [commit.id, commit.message, commit.author]
        .some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
    const withAncestors = new Set();
    const stack = matched.map((commit) => commit.id);
    while (stack.length) {
      const id = stack.pop();
      if (!id || withAncestors.has(id)) continue;
      withAncestors.add(id);
      const commit = commitMap.get(id);
      if (commit) stack.push(...commit.parents);
    }
    allowed = new Set([...allowed].filter((id) => withAncestors.has(id)));
  }

  const refs = state.refs.filter((ref) => {
    if (scope === "local") return ref.kind === "local";
    if (scope === "remote") return ref.kind === "remote";
    if (scope === "tag") return ref.kind === "tag";
    return true;
  });

  const upstream = state.refs.find((ref) => ref.kind === "remote" && (ref.name === state.upstream || ref.fullName === state.upstream));
  const local = state.refs.find((ref) => ref.kind === "local" && (ref.name === state.branch || ref.fullName === `refs/heads/${state.branch}`));
  const ancestors = (target) => {
    const found = new Set();
    const stack = [target];
    while (stack.length) {
      const id = stack.pop();
      if (!id || found.has(id)) continue;
      found.add(id);
      const commit = commitMap.get(id);
      if (commit) stack.push(...commit.parents);
    }
    return found;
  };
  const localHistory = ancestors(state.head ?? local?.target);
  const remoteHistory = ancestors(upstream?.target);
  const outgoing = new Set([...localHistory].filter((id) => !remoteHistory.has(id)));
  const incoming = new Set([...remoteHistory].filter((id) => !localHistory.has(id)));
  let focused = new Set();
  if (upstream && focus === "push") focused = outgoing;
  if (upstream && focus === "pull") focused = incoming;
  if (upstream && focus === "diverged" && outgoing.size && incoming.size) focused = new Set([...outgoing, ...incoming]);
  if (focus === "merge-base" && options.focusCommitId) focused = new Set([options.focusCommitId]);
  const commits = state.commits.filter((commit) => allowed.has(commit.id)).slice(0, limit)
    .map((commit) => ({ ...commit, isFocused: focused.has(commit.id), isMuted: focus !== "all" && !focused.has(commit.id) }));

  return {
    ...state,
    refs,
    commits,
    focusCount: commits.filter((commit) => commit.isFocused).length,
  };
}

function laneColor(lane) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function renderRef(ref, color) {
  const className =
    ref.kind === "remote"
      ? "ref ref-remote"
      : ref.kind === "tag"
        ? "ref ref-tag"
        : "ref ref-local";
  const style = `--ref-color:${color}`;
  return `<span class="${className}" style="${style}">${escapeHtml(ref.name)}</span>`;
}

function renderGraph(state, options = {}) {
  const rows = layoutGraph(state.commits);
  const compact = (options.density ?? "compact") === "compact";
  const rowHeight = compact ? 42 : 52;
  const laneGap = compact ? 20 : 24;
  const laneOffset = compact ? 12 : 16;
  const maxLane = rows.reduce(
    (max, row) => Math.max(max, row.lane, ...row.parentLanes),
    0,
  );
  const graphWidth = Math.max(compact ? 42 : 54, laneOffset * 2 + (maxLane + 1) * laneGap);
  const rowById = new Map(rows.map((row, index) => [row.id, { ...row, index }]));

  const edges = rows.flatMap((row, index) =>
    row.parents.flatMap((parentId, parentIndex) => {
      const parent = rowById.get(parentId);

      if (!parent) {
        return [];
      }

      const x1 = laneOffset + row.lane * laneGap;
      const y1 = index * rowHeight + rowHeight / 2;
      const x2 = laneOffset + parent.lane * laneGap;
      const y2 = parent.index * rowHeight + rowHeight / 2;
      const curve = Math.min(30, Math.max(14, (y2 - y1) * 0.4));
      const color = laneColor(parentIndex === 0 ? row.lane : parent.lane);
      const path =
        x1 === x2
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`;

      return [
        `<path class="graph-edge" data-lane="${parentIndex === 0 ? row.lane : parent.lane}" d="${path}" stroke="${color}" fill="none" stroke-width="${compact ? 1.8 : 2.15}" stroke-linecap="round" stroke-linejoin="round" />`,
        `<path class="graph-beam" data-lane="${parentIndex === 0 ? row.lane : parent.lane}" d="${path}" stroke="${color}" fill="none" stroke-width="${compact ? 2.4 : 2.8}" stroke-linecap="round" stroke-dasharray="${compact ? "2 18" : "3 22"}" />`,
      ];
    }),
  );

  const nodes = rows
    .map((row, index) => {
      const x = laneOffset + row.lane * laneGap;
      const y = index * rowHeight + rowHeight / 2;
      const color = laneColor(row.lane);
      const isHead = state.head === row.id;
      const focusClass = row.isFocused ? "is-focus-node" : "";

      const nodeRadius = compact ? 3.8 : 4.5;
      return isHead
        ? `<g class="graph-node graph-node-head ${focusClass}" data-lane="${row.lane}">
            <circle cx="${x}" cy="${y}" r="${compact ? 6.5 : 8}" fill="var(--vscode-editor-background)" stroke="${color}" stroke-width="${compact ? 1.7 : 2}" />
            <circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${color}" />
          </g>`
        : `<circle class="graph-node ${focusClass}" data-lane="${row.lane}" cx="${x}" cy="${y}" r="${nodeRadius}" fill="${color}" stroke="var(--vscode-editor-background)" stroke-width="${compact ? 1.4 : 1.8}" />`;
    })
    .join("");

  const refsByTarget = new Map();

  for (const ref of state.refs) {
    const list = refsByTarget.get(ref.target) ?? [];
    list.push(ref);
    refsByTarget.set(ref.target, list);
  }

  const commitRows = rows
    .map((row) => {
      const refs = refsByTarget.get(row.id) ?? [];
      const isHead = state.head === row.id;
      const color = laneColor(row.lane);
      let focusClass = "";
      if (row.isFocused) focusClass = "is-focused";
      else if (row.isMuted) focusClass = "is-muted";
      const focusName = ({ push: "Push", pull: "Pull", diverged: "분기", "merge-base": "공통 조상" })[options.focus] ?? "";
      const focusLabel = row.isFocused ? `<span class="focus-badge">${focusName}</span>` : "";
      const labels = [
        ...(isHead ? [`<span class="ref ref-head" style="--ref-color:${color}">HEAD</span>`] : []),
        ...refs.map((ref) => renderRef(ref, color)),
      ].join("");

      return `<article class="commit-row ${focusClass}" data-commit-id="${escapeHtml(row.id)}" data-lane="${row.lane}" tabindex="0">
        <div class="commit-copy">
          <div class="commit-title">
            <span class="message">${escapeHtml(row.message)}</span>
            <span class="refs">${labels}</span>
            ${focusLabel}
          </div>
          <div class="meta">
            <code>${escapeHtml(row.id.slice(0, 7))}</code>
            <span>${escapeHtml(row.author)}</span>
            <span>${escapeHtml(row.authoredAt)}</span>
          </div>
        </div>
        <button class="commit-action" type="button" data-commit-action="${escapeHtml(row.id)}">작업</button>
      </article>`;
    })
    .join("");

  return `<div class="graph-table ${compact ? "is-compact" : ""}" style="--row-height:${rowHeight}px">
    <div class="graph-column" style="width:${graphWidth}px">
      <svg width="${graphWidth}" height="${Math.max(rowHeight, rows.length * rowHeight)}" viewBox="0 0 ${graphWidth} ${Math.max(rowHeight, rows.length * rowHeight)}" aria-label="커밋 그래프">
        ${edges.join("")}
        ${nodes}
      </svg>
    </div>
    <div class="commit-list">${commitRows}</div>
  </div>`;
}

function renderBody(state, options = {}) {
  if (state.kind === "no-repository") {
    return `<section class="empty">
      <span class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M3.5 6.5h6l2 2h9v10h-17z"></path><path d="M3.5 8.5h17"></path></svg>
      </span>
      <h2>Git 저장소가 없습니다</h2>
      <p>Git 저장소가 들어 있는 폴더를 열면 그래프와 Safe Guard가 시작됩니다.</p>
    </section>`;
  }

  if (state.commits.length === 0) {
    return `<section class="empty">
      <span class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 12h5M14 12h5"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </span>
      <h2>아직 커밋이 없습니다</h2>
      <p>첫 Commit을 만들면 여기에서 기록의 흐름을 볼 수 있습니다.</p>
    </section>`;
  }

  return renderGraph(state, options);
}

export function renderGraphHtml(state, notice = null, options = {}) {
  const filteredState = filterGraphState(state, options);
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
  const tracking = state.tracking
    ? `${trackingLabels[state.tracking.kind] ?? state.tracking.kind} · ↑${state.tracking.ahead} ↓${state.tracking.behind}`
    : "추적 상태 확인 불가";
  const autoPull = state.pullBeforePush ? "Push 전 Pull: 켜짐" : "Push 전 Pull: 꺼짐";
  const selectedScope = options.scope ?? "all";
  const selectedFocus = options.focus ?? "all";
  const selectedFocusLabel = ({ push: "Push", pull: "Pull", diverged: "분기", "merge-base": "공통 조상" })[selectedFocus] ?? "";
  const selectedRef = options.ref ?? "";
  const selectedLimit = String(options.limit ?? 50);
  const selectedDensity = options.density ?? "compact";
  const query = options.query ?? "";
  const refOptions = state.refs
    .map((ref) => `<option value="${escapeHtml(ref.fullName)}" ${ref.fullName === selectedRef ? "selected" : ""}>${escapeHtml(ref.name)} · ${escapeHtml(ref.kind)}</option>`)
    .join("");
  const noticeLevel = notice?.level ?? (notice?.ok === false ? "blocked" : "safe");
  const noticeLabels = {
    safe: "안전",
    warning: "주의",
    blocked: "차단",
  };

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Git Next</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: "SF Pro Display", "Helvetica Neue", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    button, code, input, select {
      font: inherit;
    }

    .shell {
      max-width: 1180px;
      margin: 0 auto;
      padding: 18px 22px 40px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 8px 0 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      animation: riseIn 220ms ease-out both;
    }

    .title-wrap {
      min-width: 0;
    }

    h1, h2, p { margin: 0; }

    h1 {
      font-size: 16px;
      letter-spacing: -0.015em;
      font-weight: 650;
    }

    .branch {
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-family: "SF Mono", "Geist Mono", monospace;
      font-size: 11px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }

    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: 5px;
      padding: 5px 8px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
      font-size: 11px;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .action svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex: none;
    }

    .action.secondary {
      color: var(--vscode-foreground);
      background: transparent;
    }

    .action:hover {
      background: var(--vscode-button-hoverBackground);
      color: var(--vscode-button-foreground);
      transform: translateY(-1px);
    }

    .notice {
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.5;
      animation: riseIn 180ms ease-out both;
    }

    .notice.blocked {
      color: var(--vscode-errorForeground);
    }

    .notice.warning {
      color: var(--vscode-editorWarning-foreground);
    }

    .notice-level {
      display: inline-block;
      margin-right: 8px;
      font-weight: 700;
    }

    .notice details {
      margin-top: 8px;
      color: var(--vscode-foreground);
    }

    .notice summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
    }

    .git-detail-label {
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      font-weight: 700;
    }

    .notice pre {
      margin: 4px 0 0;
      white-space: pre-wrap;
      font-family: "SF Mono", "Geist Mono", monospace;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .graph-table {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      margin-top: 6px;
      width: 100%;
      min-width: 0;
    }

    .graph-column {
      position: relative;
      border-right: 1px solid var(--vscode-panel-border);
    }

    .graph-column svg {
      display: block;
      overflow: visible;
    }

    .graph-edge {
      opacity: .72;
      transition: opacity 120ms ease, filter 120ms ease;
    }
    .graph-table.has-active-lane [data-lane].lane-active {
      opacity: 1;
    }

    .graph-beam {
      opacity: .62;
      filter: drop-shadow(0 0 2px currentColor);
      animation: graphBeamFlow 1.8s linear infinite;
      pointer-events: none;
    }

    @keyframes graphBeamFlow {
      from { stroke-dashoffset: 0; }
      to { stroke-dashoffset: -40; }
    }

    @keyframes riseIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .graph-beam {
        animation: none;
        opacity: 0;
      }
      .toolbar,
      .notice {
        animation: none;
      }
      .action {
        transition: none;
      }
    }

    .graph-node {
      transition: r 120ms ease, opacity 120ms ease;
    }

    .graph-node-head {
      filter: drop-shadow(0 0 4px color-mix(in srgb, var(--vscode-focusBorder) 32%, transparent));
    }

    .commit-list {
      min-width: 0;
    }

    .commit-row {
      height: var(--row-height, 48px);
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
      outline: none;
      cursor: pointer;
      transition: background 120ms ease;
    }
    .commit-row:hover {
      background: color-mix(in srgb,var(--vscode-list-hoverBackground) 58%,transparent);
    }
    .commit-row.is-focused {
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 9%, transparent);
      box-shadow: inset 3px 0 var(--vscode-textLink-foreground);
      opacity: 1;
    }
    .commit-row.is-muted { opacity: .48; }
    .focus-badge {
      flex: none;
      border-radius: 999px;
      padding: 1px 6px;
      color: var(--vscode-textLink-foreground);
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent);
      font-size: 9px;
      font-weight: 700;
    }
    .graph-node.is-focus-node { filter: drop-shadow(0 0 4px var(--vscode-textLink-foreground)); }
    .commit-row:focus-visible {
      background: color-mix(in srgb,var(--vscode-list-hoverBackground) 58%,transparent);
      outline: none;
    }

    .commit-copy {
      min-width: 0;
      width: 100%;
    }

    .commit-action {
      flex: none;
      border: 0;
      padding: 3px 6px;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      cursor: pointer;
      font-size: 10px;
    }

    .commit-action:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .notice-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .action:active,
    .commit-action:active {
      transform: scale(.97);
    }

    .is-compact .commit-row {
      padding: 0 12px;
    }

    .is-compact .commit-title {
      gap: 9px;
    }

    .is-compact .meta {
      margin-top: 3px;
      gap: 10px;
      font-size: 11px;
      line-height: 1.2;
    }

    .is-compact .message {
      font-size: 13px;
    }

    .is-compact .ref {
      padding: 1px 6px;
      font-size: 11px;
    }

    .is-compact .commit-action {
      padding: 2px 4px;
      font-size: 9px;
    }

    .filterbar {
      display: grid;
      grid-template-columns: minmax(160px, 1.4fr) minmax(130px, .9fr) auto auto auto auto;
      gap: 6px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .focus-summary {
      padding: 6px 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .filterbar input,
    .filterbar select {
      min-width: 0;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 5px 7px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font-size: 11px;
    }

    @media (max-width: 760px) {
      .filterbar {
        grid-template-columns: 1fr 1fr;
      }
    }

    .commit-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .message {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 560;
    }

    .refs {
      display: inline-flex;
      gap: 5px;
      flex: 0 1 auto;
      max-width: 45%;
      overflow: hidden;
      min-width: 0;
    }

    .ref {
      border: 1px solid color-mix(in srgb, var(--ref-color) 58%, transparent);
      border-radius: 999px;
      padding: 1px 6px;
      color: color-mix(in srgb, var(--ref-color) 76%, var(--vscode-foreground));
      background: color-mix(in srgb, var(--ref-color) 12%, transparent);
      font-size: 10px;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    .ref-head {
      font-weight: 700;
      background: color-mix(in srgb, var(--ref-color) 18%, transparent);
    }

    .ref-remote {
      border-style: dashed;
      opacity: .9;
    }

    .meta {
      display: flex;
      gap: 10px;
      margin-top: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      min-width: 0;
    }

    .meta code {
      font-family: "SF Mono", "Geist Mono", monospace;
    }

    .empty {
      margin-top: 48px;
      padding: 28px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      text-align: center;
      animation: riseIn 220ms ease-out both;
    }

    .empty-icon {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      margin-bottom: 12px;
      border-radius: 10px;
      color: var(--vscode-textLink-foreground);
      background: color-mix(in srgb,var(--vscode-textLink-foreground) 10%,transparent);
    }

    .empty-icon svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .empty h2 {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .empty p {
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }

    .scroll {
      overflow-x: hidden;
      overflow-y: auto;
      min-width: 0;
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="toolbar">
      <div class="title-wrap">
        <h1>Git Next</h1>
        <div class="branch">${escapeHtml(branch)} · ${escapeHtml(upstream)} · ${escapeHtml(tracking)} · ${escapeHtml(autoPull)}</div>
      </div>
      <div class="actions">
        <button class="action secondary" type="button" data-action="refresh" title="새로고침">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 5v6h-6"></path></svg>
          <span>새로고침</span>
        </button>
        <button class="action secondary" type="button" data-action="pull">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 11 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path></svg>
          <span>받기 (Pull)</span>
        </button>
        <button class="action" type="button" data-action="push">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="m7.5 13 4.5-4.5 4.5 4.5"></path><path d="M5 4h14"></path></svg>
          <span>보내기 (Push)</span>
        </button>
      </div>
    </header>
    <div class="filterbar">
      <input id="filter-query" type="search" value="${escapeHtml(query)}" placeholder="커밋 메시지, 작성자, 해시 검색" />
      <select id="filter-ref">
        <option value="">모든 브랜치/태그</option>
        ${refOptions}
      </select>
      <select id="filter-scope">
        <option value="all" ${selectedScope === "all" ? "selected" : ""}>전체 ref</option>
        <option value="local" ${selectedScope === "local" ? "selected" : ""}>로컬</option>
        <option value="remote" ${selectedScope === "remote" ? "selected" : ""}>원격</option>
        <option value="tag" ${selectedScope === "tag" ? "selected" : ""}>태그</option>
      </select>
      <select id="filter-focus">
        <option value="all" ${selectedFocus === "all" ? "selected" : ""}>전체 그래프</option>
        <option value="push" ${selectedFocus === "push" ? "selected" : ""}>Push 대상</option>
        <option value="pull" ${selectedFocus === "pull" ? "selected" : ""}>Pull 대상</option>
        <option value="diverged" ${selectedFocus === "diverged" ? "selected" : ""}>분기 이력</option>
        <option value="merge-base" ${selectedFocus === "merge-base" ? "selected" : ""}>공통 조상</option>
      </select>
      <select id="filter-limit">
        ${[25, 50, 100].map((value) => `<option value="${value}" ${selectedLimit === String(value) ? "selected" : ""}>최근 ${value}개</option>`).join("")}
      </select>
      <select id="filter-density">
        <option value="compact" ${selectedDensity === "compact" ? "selected" : ""}>컴팩트</option>
        <option value="default" ${selectedDensity === "default" ? "selected" : ""}>기본</option>
      </select>
    </div>
    ${notice ? `<div class="notice ${noticeLevel}">
      <div><span class="notice-level">${escapeHtml(noticeLabels[noticeLevel] ?? "상태")}</span>${escapeHtml(notice.message)}</div>
      ${notice.detail ? `<div class="git-detail-label">Git 상세 정보</div><pre>${escapeHtml(notice.detail)}</pre>` : ""}
      <div class="notice-actions">
        <button class="commit-action" type="button" data-action="openCompare">Local ↔ Remote 비교</button>
        ${notice.guideKey ? `<button class="commit-action" type="button" data-action="openGuide" data-guide-key="${escapeHtml(notice.guideKey)}">이 상황 해결 방법</button>` : ""}
      </div>
    </div>` : ""}
    ${selectedFocus !== "all" ? `<div class="focus-summary">${selectedFocusLabel} 대상 커밋 ${filteredState.focusCount ?? 0}개 강조 · 전체 그래프 맥락은 유지됩니다.</div>` : ""}
    <div class="scroll">
      ${renderBody(filteredState, options)}
    </div>
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => {
        vscode.postMessage({
          type: button.dataset.action,
          guideKey: button.dataset.guideKey ?? null,
        });
      });
    }

    for (const button of document.querySelectorAll("[data-commit-action]")) {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: "commitMenu", commit: button.dataset.commitAction });
      });
    }

    const graphTable = document.querySelector(".graph-table");
    const clearActiveLane = () => {
      graphTable?.classList.remove("has-active-lane");
      for (const item of document.querySelectorAll(".lane-active")) {
        item.classList.remove("lane-active");
      }
    };
    const setActiveLane = (lane) => {
      clearActiveLane();
      if (!graphTable || lane == null) return;
      graphTable.classList.add("has-active-lane");
      for (const item of document.querySelectorAll('[data-lane="' + lane + '"]')) {
        item.classList.add("lane-active");
      }
    };
    for (const row of document.querySelectorAll(".commit-row[data-lane]")) {
      row.addEventListener("mouseenter", () => setActiveLane(row.dataset.lane));
      row.addEventListener("mouseleave", clearActiveLane);
      row.addEventListener("focusin", () => setActiveLane(row.dataset.lane));
      row.addEventListener("focusout", clearActiveLane);
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        vscode.postMessage({ type: "openCommitDetails", commit: row.dataset.commitId });
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button")) return;
        event.preventDefault();
        vscode.postMessage({ type: "openCommitDetails", commit: row.dataset.commitId });
      });
    }

    let filterTimer;
    const sendFilters = () => {
      vscode.postMessage({
        type: "graphOptions",
        options: {
          query: document.querySelector("#filter-query")?.value ?? "",
          ref: document.querySelector("#filter-ref")?.value ?? "",
          scope: document.querySelector("#filter-scope")?.value ?? "all",
          focus: document.querySelector("#filter-focus")?.value ?? "all",
          limit: Number(document.querySelector("#filter-limit")?.value ?? 50),
          density: document.querySelector("#filter-density")?.value ?? "compact",
        },
      });
    };

    document.querySelector("#filter-query")?.addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(sendFilters, 180);
    });
    for (const id of ["#filter-ref", "#filter-scope", "#filter-focus", "#filter-limit", "#filter-density"]) {
      document.querySelector(id)?.addEventListener("change", sendFilters);
    }
  </script>
</body>
</html>`;
}
