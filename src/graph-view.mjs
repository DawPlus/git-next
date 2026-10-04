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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

  return {
    ...state,
    refs,
    commits: state.commits.filter((commit) => allowed.has(commit.id)).slice(0, limit),
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

      const nodeRadius = compact ? 3.8 : 4.5;
      return isHead
        ? `<g class="graph-node graph-node-head" data-lane="${row.lane}">
            <circle cx="${x}" cy="${y}" r="${compact ? 6.5 : 8}" fill="var(--vscode-editor-background)" stroke="${color}" stroke-width="${compact ? 1.7 : 2}" />
            <circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${color}" />
          </g>`
        : `<circle class="graph-node" data-lane="${row.lane}" cx="${x}" cy="${y}" r="${nodeRadius}" fill="${color}" stroke="var(--vscode-editor-background)" stroke-width="${compact ? 1.4 : 1.8}" />`;
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
      const labels = [
        ...(isHead ? [`<span class="ref ref-head" style="--ref-color:${color}">HEAD</span>`] : []),
        ...refs.map((ref) => renderRef(ref, color)),
      ].join("");

      return `<article class="commit-row" data-commit-id="${escapeHtml(row.id)}" data-lane="${row.lane}" tabindex="0">
        <div class="commit-copy">
          <div class="commit-title">
            <span class="message">${escapeHtml(row.message)}</span>
            <span class="refs">${labels}</span>
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
      grid-template-columns: minmax(160px, 1.4fr) minmax(130px, .9fr) auto auto auto;
      gap: 6px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
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
          limit: Number(document.querySelector("#filter-limit")?.value ?? 50),
          density: document.querySelector("#filter-density")?.value ?? "compact",
        },
      });
    };

    document.querySelector("#filter-query")?.addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(sendFilters, 180);
    });
    for (const id of ["#filter-ref", "#filter-scope", "#filter-limit", "#filter-density"]) {
      document.querySelector(id)?.addEventListener("change", sendFilters);
    }
  </script>
</body>
</html>`;
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
    : "대기";
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
      A: "추가",
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

    const renderNode = (node, depth = 0) => {
      const folders = [...node.folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => `<details class="scm-folder" open>
          <summary style="--tree-depth:${depth}"><span class="folder-caret">›</span><span class="folder-name">${escapeHtml(name)}</span></summary>
          ${renderNode(child, depth + 1)}
        </details>`)
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
            <span class="file-spacer"></span>
            <span class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.fileName)}</span>
            <span class="status ${untracked ? "new" : ""}">${escapeHtml(statusLabel(code, untracked))}</span>
            <button class="mini-action" type="button" data-action="${action}" data-path="${escapeHtml(item.path)}" title="${title}">${symbol}</button>
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
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }
    .stack {
      display: grid;
      animation: sidebarIn 180ms ease-out both;
    }
    @keyframes sidebarIn {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
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
      gap: 3px;
    }
    .repo-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
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
      gap: 7px;
      min-width: 0;
    }
    .branch-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--vscode-gitDecoration-addedResourceForeground);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 14%, transparent);
      flex: none;
    }
    .value {
      min-width: 0;
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tracking {
      margin-left: auto;
      flex: none;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .sub {
      margin-left: 14px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
    .next-action {
      padding: 8px 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent);
    }
    .next-action strong {
      display: block;
      font-size: 12px;
      line-height: 1.35;
    }
    .next-action span {
      display: block;
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.35;
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
      min-height: 31px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 5px;
      padding: 6px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
      font-size: 12px;
      outline: none;
    }
    .commit-input:focus { border-color: var(--vscode-focusBorder); }
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
      display: grid;
      gap: 7px;
      margin-top: 8px;
    }
    .scm-group {
      min-width: 0;
    }
    .scm-group-head {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 22px;
      padding: 0 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 650;
    }
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
    .changes-mini {
      display: grid;
      gap: 0;
      max-height: 150px;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .scm-folder {
      min-width: 0;
    }
    .scm-folder > summary {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 22px;
      padding-left: calc(2px + (var(--tree-depth) * 12px));
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      list-style: none;
      font-size: 11px;
      user-select: none;
    }
    .scm-folder > summary::-webkit-details-marker { display: none; }
    .scm-folder > summary:hover { background: var(--vscode-list-hoverBackground); }
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
      min-height: 22px;
      padding: 1px 2px;
      border-radius: 3px;
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
    .scm-file .status {
      width: 28px;
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
    .scm-file .mini-action {
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 4px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      cursor: pointer;
      font-weight: 700;
    }
    .scm-file .mini-action:hover {
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 78%, transparent);
    }
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
      width: 100%;
      min-height: 30px;
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
      margin-top: 4px;
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
    .tool-desc {
      display: none;
    }
    @media (max-width: 220px) {
      .tool-button {
        width: calc(50% - 3px);
      }
    }
    .utility-row,
    .guard-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .guard-copy { min-width: 0; }
    .guard-state {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
      font-weight: 600;
      font-size: 13px;
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
    .guard-row.idle .guard-state {
      color: var(--vscode-descriptionForeground);
    }
    .guard-row.idle .guard-state::before {
      background: color-mix(in srgb,var(--vscode-descriptionForeground) 70%,transparent);
      box-shadow: none;
    }
    .guard-row.warning .guard-state::before {
      background: var(--vscode-editorWarning-foreground);
    }
    .guard-row.blocked .guard-state::before {
      background: var(--vscode-errorForeground);
    }
    .linkish {
      border: 0;
      padding: 2px 0;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      font-size: 12px;
      cursor: pointer;
    }
    .linkish:hover { color: var(--vscode-textLink-activeForeground); }
    .notice {
      margin: 8px 10px;
      border-left: 2px solid var(--vscode-panel-border);
      padding: 2px 0 2px 8px;
      line-height: 1.4;
      font-size: 12px;
    }
    .notice.blocked { color: var(--vscode-errorForeground); }
    .notice.warning { color: var(--vscode-editorWarning-foreground); }
    .git-detail-label {
      margin-top: 7px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 700;
    }
    pre {
      margin: 4px 0 0;
      white-space: pre-wrap;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.35;
    }
    .guide-link { margin-top: 6px; }
    .notice-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    @media (prefers-reduced-motion: reduce) {
      .stack { animation: none; }
      .icon-button,
      .primary,
      .sync-button,
      .tool-button { transition: none; }
      .icon-button:hover,
      .primary:hover,
      .sync-button:hover,
      .tool-button:hover { transform: none; }
    }
  </style>
</head>
<body>
  <main class="stack">
    <section class="section repo-head">
      <div class="repo-top">
        <div class="eyebrow">Repository</div>
        <button class="icon-button" type="button" data-action="refresh" aria-label="새로고침" title="새로고침">
          <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 5v6h-6"></path></svg>
        </button>
      </div>
      <div class="branch-row">
        <span class="branch-dot" aria-hidden="true"></span>
        <div class="value">${escapeHtml(branch)}</div>
        <div class="tracking">${escapeHtml(tracking)}</div>
      </div>
      <div class="sub">${escapeHtml(upstream)}</div>
    </section>

    ${nextAction ? `<section class="next-action"><strong>${escapeHtml(nextAction.title)}</strong><span>${escapeHtml(nextAction.detail)}</span></section>` : ""}

    <section class="section">
      <div class="sync-row">
        <button class="sync-button" type="button" data-action="openGraph">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.5"></circle><circle cx="18" cy="10" r="2.5"></circle><circle cx="8" cy="18" r="2.5"></circle><path d="M8 7.2 15.7 9M7 8.4l.8 7.1"></path></svg>
          <span>그래프</span>
        </button>
        <button class="sync-button" type="button" data-action="openCompare">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v12"></path><path d="m4 13 3 3 3-3"></path><path d="M17 20V8"></path><path d="m14 11 3-3 3 3"></path></svg>
          <span>Compare</span>
        </button>
      </div>
    </section>

    <section class="section">
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

    <section class="section">
      <div class="more-row">
        <button class="tool-toggle" type="button" data-toggle-tools aria-expanded="false">☰ Git 도구</button>
        <button class="linkish" type="button" data-action="openKnowledge">도움말</button>
      </div>
      <div class="tool-panel" data-tool-panel hidden>
        <div class="tool-grid">
          <button class="tool-button" type="button" data-action="branchMenu" aria-label="브랜치 도구">
            <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.5"></circle><circle cx="6" cy="19" r="2.5"></circle><circle cx="18" cy="9" r="2.5"></circle><path d="M6 7.5v9M8.5 15c4.5 0 7-1.7 7-4.5"></path></svg></span>
            <span class="tool-title">브랜치</span>
          </button>
          <button class="tool-button" type="button" data-action="tagMenu" aria-label="태그 도구">
            <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5v5.7L12.8 20 20 12.8 11.2 4H5.5A1.5 1.5 0 0 0 4 5.5Z"></path><circle cx="8.3" cy="8.3" r="1.2"></circle></svg></span>
            <span class="tool-title">태그</span>
          </button>
          <button class="tool-button" type="button" data-action="stashMenu" aria-label="Stash 도구">
            <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7.5h14v10H5z"></path><path d="M8 4.5h8M8 12h8M12 9v6"></path></svg></span>
            <span class="tool-title">Stash</span>
          </button>
          <button class="tool-button" type="button" data-action="toolsMenu" aria-label="추가 Git 도구">
            <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg></span>
            <span class="tool-title">더보기</span>
          </button>
        </div>
      </div>
    </section>

    <section class="section guard-row ${safeLevel} ${notice ? "" : "idle"}">
      <div class="guard-copy">
        <div class="eyebrow">Safe Guard</div>
        <div class="guard-state">${escapeHtml(safeLabel)}</div>
      </div>
    </section>

    ${notice ? `<section class="notice ${safeLevel}">
      <div>${escapeHtml(notice.message)}</div>
      ${notice.detail ? `<div class="git-detail-label">Git 상세 정보</div><pre>${escapeHtml(notice.detail)}</pre>` : ""}
      <div class="notice-actions">
        <button class="linkish guide-link" type="button" data-action="openCompare">Local ↔ Remote 비교</button>
        ${notice.guideKey ? `<button class="linkish guide-link" type="button" data-action="openGuide" data-guide-key="${escapeHtml(notice.guideKey)}">이 상황 해결 방법</button>` : ""}
      </div>
    </section>` : ""}
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => {
        vscode.postMessage({
          type: button.dataset.action,
          guideKey: button.dataset.guideKey ?? null,
          path: button.dataset.path ?? null,
          message: document.querySelector("#sidebar-commit-message")?.value ?? "",
        });
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
