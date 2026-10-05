import { escapeHtml } from "./view-shared.mjs";
import { getActionRisk } from "./git-safety.mjs";
import { GRAPH_STYLES } from "./graph-styles.mjs";
import { GRAPH_INTERACTIONS } from "./graph-interactions.mjs";
import { layoutGraph, filterGraphState } from "./graph-state.mjs";
export { layoutGraph, filterGraphState } from "./graph-state.mjs";

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

function actionRiskBadge(action, state) {
  const risk = getActionRisk(action, state);
  const label = ({ low: "낮음", medium: "보통", high: "높음" })[risk.level];
  return `<span class="action-risk ${risk.level}" title="${escapeHtml(risk.reason)}" aria-label="위험도 ${label}: ${escapeHtml(risk.reason)}">${label}</span>`;
}


function laneColor(lane) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function formatCommitDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(String(value ?? ""));
  return match ? `${match[1]} ${match[2]}` : String(value ?? "");
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

function renderGraph(state: any, options: any = {}) {
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
  const rowById = new Map<string, any>(rows.map((row, index) => [row.id, { ...row, index }]));

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

  const refsByTarget = new Map<string, any[]>();

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
      const focusName = ({ push: "Push", pull: "Pull", diverged: "분기", "merge-base": "공통 조상", "selected-commit": "선택 커밋", "file-history": "파일 이력", tags: "태그 · 릴리스" })[options.focus] ?? "";
      const focusLabel = row.isFocused ? `<span class="focus-badge">${focusName}</span>` : "";
      const labels = [
        ...(isHead ? [`<span class="ref ref-head" style="--ref-color:${color}">HEAD</span>`] : []),
        ...refs.map((ref) => renderRef(ref, color)),
      ].join("");

      return `<article class="commit-row ${focusClass}" data-commit-id="${escapeHtml(row.id)}" data-lane="${row.lane}" tabindex="0">
        <div class="commit-copy">
          <div class="commit-line">
            <span class="message" title="${escapeHtml(row.message)}">${escapeHtml(row.message)}</span>
            <code class="commit-hash">${escapeHtml(row.id.slice(0, 7))}</code>
            <span class="commit-author" title="${escapeHtml(row.author)}">${escapeHtml(row.author)}</span>
            <time class="commit-date" datetime="${escapeHtml(row.authoredAt)}">${escapeHtml(formatCommitDate(row.authoredAt))}</time>
            <span class="refs">${labels}</span>
            ${focusLabel}
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

function renderBody(state: any, options: any = {}) {
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

export function renderGraphHtml(state: any, notice: any = null, options: any = {}) {
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
  const otherWorktrees = (state.worktrees ?? []).filter((worktree) => !worktree.isCurrent);
  const relaxedRules = state.relaxedRules ?? [];
  const upstream = state.upstream ?? "원격 연결 없음";
  const tracking = state.tracking
    ? `${trackingLabels[state.tracking.kind] ?? state.tracking.kind} · ↑${state.tracking.ahead} ↓${state.tracking.behind}`
    : "추적 상태 확인 불가";
  const autoPull = state.pullBeforePush ? "Push 전 Pull: 켜짐" : "Push 전 Pull: 꺼짐";
  const pullRisk = getActionRisk("pull", state);
  const pushRisk = getActionRisk("push", state);
  const selectedScope = options.scope ?? "all";
  const selectedFocus = options.focus ?? "all";
  const selectedFocusLabel = ({ push: "Push", pull: "Pull", diverged: "분기", "merge-base": "공통 조상", "selected-commit": "선택 커밋", "file-history": "파일 이력", tags: "태그 · 릴리스" })[selectedFocus] ?? "";
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
  <style>${GRAPH_STYLES}</style>
</head>
<body>
  <main class="shell">
    <header class="toolbar">
      <div class="title-wrap">
        <h1>Git Next</h1>
        <div class="branch">${escapeHtml(branch)} · ${escapeHtml(upstream)} · ${escapeHtml(tracking)} · ${escapeHtml(autoPull)}</div>
        ${otherWorktrees.length ? `<div class="branch">다른 작업 폴더 ${otherWorktrees.length}개 · ${otherWorktrees.map((item) => `${item.branch ?? "분리된 HEAD"} · ${item.path}`).map(escapeHtml).join(" / ")}</div>` : ""}
        ${relaxedRules.length ? `<div class="branch" role="status">세션 동안 완화된 보호: ${relaxedRules.map(escapeHtml).join(", ")}</div>` : ""}
      </div>
      <div class="actions">
        <button class="action secondary" type="button" data-action="refresh" title="새로고침">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 5v6h-6"></path></svg>
          <span>새로고침</span>
        </button>
        <button class="action secondary" type="button" data-action="pull" title="${escapeHtml(pullRisk.reason)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"></path><path d="m7.5 11 4.5 4.5 4.5-4.5"></path><path d="M5 20h14"></path></svg>
          <span>받기 (Pull)</span>
          ${actionRiskBadge("pull", state)}
        </button>
        <button class="action" type="button" data-action="push" title="${escapeHtml(pushRisk.reason)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="m7.5 13 4.5-4.5 4.5 4.5"></path><path d="M5 4h14"></path></svg>
          <span>보내기 (Push)</span>
          ${actionRiskBadge("push", state)}
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
        <option value="selected-commit" ${selectedFocus === "selected-commit" ? "selected" : ""}>선택 커밋</option>
        <option value="file-history" ${selectedFocus === "file-history" ? "selected" : ""}>파일 이력</option>
        <option value="tags" ${selectedFocus === "tags" ? "selected" : ""}>태그 · 릴리스</option>
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
        ${notice.actions?.includes("operation-recovery") ? '<button class="commit-action" type="button" data-action="operationRecovery">Continue / Abort</button>' : ""}
        ${notice.guideKey ? `<button class="commit-action" type="button" data-action="openGuide" data-guide-key="${escapeHtml(notice.guideKey)}">이 상황 해결 방법</button>` : ""}
      </div>
    </div>` : ""}
    ${selectedFocus !== "all" ? `<div class="focus-summary">${selectedFocusLabel} 대상 커밋 ${filteredState.focusCount ?? 0}개 강조 · 전체 그래프 맥락은 유지됩니다.</div>` : ""}
    <div class="scroll">
      ${renderBody(filteredState, options)}
    </div>
  </main>
  <script>${GRAPH_INTERACTIONS}</script>
</body>
</html>`;
}
