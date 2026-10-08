const vscode = require("vscode");
const path = require("node:path");
const crypto = require("node:crypto");
const { traceAsync, isPerfTracingEnabled } = require("./perf-trace.js");
const {
  t,
  getLocale,
  setLocale,
  resetLocale,
  normalizeLocale,
  detectLocale,
  getFixedT,
  registerTranslations,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} = require("./i18n.js");

let activeContext = null;
const diffDocumentContents = new Map();
const webviewPanels = new Map();
const commitDetailsByPanel = new WeakMap();
let diffDocumentId = 0;
const relaxedSafeGuardRules = new Set();
const patchableWebviews = new WeakSet();
let selectedRepositoryRoot = null;
let knownRepositoryRoots = [];

function secureWebviewHtml(webview, html) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  const source = String(html ?? "");
  const document = /<html[\s>]/i.test(source)
    ? source
    : `<!doctype html><html><head><meta charset="UTF-8" /></head><body>${source}</body></html>`;
  const withCsp = document.replace(
    /<head([^>]*)>/i,
    `<head$1><meta http-equiv="Content-Security-Policy" content="${csp}" />`,
  );
  const refreshRuntime = `<script nonce="${nonce}">
window.gitNextPerfEnabled = ${isPerfTracingEnabled()};
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "gitNextRefresh" || typeof data.mainHtml !== "string") return;
  const main = document.querySelector("main");
  if (!main) return;
  const domStart = window.gitNextPerfEnabled && data.stageTraceId ? performance.now() : null;
  const controls = [...document.querySelectorAll("input, textarea, select")].map((element, index) => ({
    key: element.id || element.name || String(index),
    value: element.value,
    selectionStart: typeof element.selectionStart === "number" ? element.selectionStart : null,
    selectionEnd: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
  }));
  const foldStates = new Map([...main.querySelectorAll("details.scm-group, details.scm-folder")].map((element) => [
    element.classList.contains("scm-folder")
      ? "folder:" + element.dataset.area + ":" + element.dataset.folderPath
      : "group:" + element.dataset.area,
    element.open,
  ]));
  const activeId = document.activeElement?.id || null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  main.innerHTML = data.mainHtml;
  for (const element of main.querySelectorAll("details.scm-group, details.scm-folder")) {
    const key = element.classList.contains("scm-folder")
      ? "folder:" + element.dataset.area + ":" + element.dataset.folderPath
      : "group:" + element.dataset.area;
    if (foldStates.has(key)) element.open = foldStates.get(key);
  }
  for (const [index, element] of [...document.querySelectorAll("input, textarea, select")].entries()) {
    const key = element.id || element.name || String(index);
    const saved = controls.find((item) => item.key === key);
    if (!saved) continue;
    element.value = saved.value;
    if (saved.selectionStart != null && typeof element.setSelectionRange === "function") {
      element.setSelectionRange(saved.selectionStart, saved.selectionEnd);
    }
  }
  window.scrollTo(scrollX, scrollY);
  if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  window.dispatchEvent(new CustomEvent("gitnext:refresh"));
  if (domStart != null) {
    const end = performance.now();
    console.debug("[Git Next perf] op=stage:dom:" + data.stageTraceId + " ms=" + Math.round(end - domStart));
    const clickStart = window.gitNextStageClicks?.get(data.stageTraceId);
    if (clickStart != null) {
      console.debug("[Git Next perf] op=stage:total:" + data.stageTraceId + " ms=" + Math.round(end - clickStart) + " rows=" + document.querySelectorAll(".scm-file").length);
      window.gitNextStageClicks.delete(data.stageTraceId);
    }
  }
});
</script>`;
  return withCsp
    .replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`)
    .replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`)
    .replace(/<\/body>/i, `${refreshRuntime}</body>`);
}

function setWebviewHtml(webview, html) {
  webview.html = secureWebviewHtml(webview, html);
}

function getMainHtml(html) {
  return String(html ?? "").match(/<main[^>]*>([\s\S]*)<\/main>/i)?.[1] ?? null;
}

async function renderPatchableWebview(webview, html, stageTraceId = null) {
  const mainHtml = getMainHtml(html);
  if (!patchableWebviews.has(webview) || !mainHtml || typeof webview.postMessage !== "function") {
    setWebviewHtml(webview, html);
    if (mainHtml) patchableWebviews.add(webview);
    return;
  }
  if (stageTraceId) await webview.postMessage({ type: "gitNextRefresh", mainHtml, stageTraceId });
  else await webview.postMessage({ type: "gitNextRefresh", mainHtml });
}

function getOrCreateWebviewPanel(viewType, title, options) {
  const existing = webviewPanels.get(viewType);
  if (existing) {
    existing.reveal(vscode.ViewColumn.One);
    return { panel: existing, created: false };
  }

  const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.One, options);
  webviewPanels.set(viewType, panel);
  panel.onDidDispose(() => {
    if (webviewPanels.get(viewType) === panel) webviewPanels.delete(viewType);
  });
  return { panel, created: true };
}

async function recordActivity(entry) {
  if (!activeContext) return;
  const current = activeContext.workspaceState.get("gitNext.activity", []);
  const action = entry.action ?? "git-action";
  const message = String(entry.message ?? "").slice(0, 240);
  const latest = current[0];
  if (latest?.action === action && latest?.message === message && Date.now() - Date.parse(latest.at) < 5000) return;
  const retryCheck = entry.ok === false
    ? (await import("./git-workflows.mjs")).getRetryCheck(entry)
    : null;
  const next = [
    {
      at: new Date().toISOString(),
      action,
      ok: entry.ok !== false,
      message,
      code: entry.code ?? null,
      retryCheck,
      recoveryPoint: entry.recoveryPoint ?? null,
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

function pathContains(root, candidate) {
  if (!root || !candidate) return false;
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getCwd(resourceUri = vscode.window.activeTextEditor?.document.uri) {
  const resourcePath = resourceUri?.scheme === "file" ? resourceUri.fsPath : null;
  if (resourcePath) {
    const matched = knownRepositoryRoots
      .filter((root) => pathContains(root, resourcePath))
      .sort((a, b) => b.length - a.length)[0];
    if (matched) return matched;
  }
  if (selectedRepositoryRoot && knownRepositoryRoots.includes(selectedRepositoryRoot)) {
    return selectedRepositoryRoot;
  }
  if (knownRepositoryRoots.length === 1) return knownRepositoryRoots[0];
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

async function selectRepository(host = null, mode = "graph", options = {}) {
  if (knownRepositoryRoots.length < 2) return getCwd();
  const selected = await vscode.window.showQuickPick(
    knownRepositoryRoots.map((root) => ({
      label: path.basename(root),
      description: root,
      root,
    })),
    { placeHolder: "Git Next에서 사용할 저장소를 선택하세요." },
  );
  if (!selected) return getCwd();
  selectedRepositoryRoot = selected.root;
  await activeContext?.workspaceState.update("gitNext.selectedRepositoryRoot", selected.root);
  if (host) await renderPanel(host, null, mode, options);
  return selected.root;
}

async function getRepositoryRoot(cwd) {
  const { getRepositoryState } = await import("./git-state.mjs");
  return (await getRepositoryState(cwd)).root ?? cwd;
}

async function loadState(cwd) {

  const [
    { getRepositoryState, getLinkedWorktrees },
    { getTrackingStatus, getWorkingTreeChanges, getIncomingChangedFiles, getInProgressOperation, inspectCurrentUpstream },
    { recommendNextAction },
    { listSafeGuardRules },
  ] = await Promise.all([
    import("./git-state.mjs"),
    import("./git-safety.mjs"),
    import("./git-workflows.mjs"),
    import("./safe-guard.mjs"),
  ]);
  const state = await traceAsync("state:repository", cwd, () => getRepositoryState(cwd));

  if (state.kind !== "repository") {
    return { ...state, pullBeforePush: isPullBeforePushEnabled() };
  }

  const [tracking, upstreamState, changes, operation, incomingFiles] = await Promise.all([
    traceAsync("state:tracking", state.root, () => getTrackingStatus(state.root)),
    traceAsync("state:upstream", state.root, () => inspectCurrentUpstream(state.root)),
    traceAsync("state:working-tree", state.root, () => getWorkingTreeChanges(state.root)),
    traceAsync("state:operation", state.root, () => getInProgressOperation(state.root)),
    traceAsync("state:incoming-files", state.root, () => getIncomingChangedFiles(state.root)),
  ]);

  return {
    ...state,
    tracking,
    upstreamState,
    changes,
    incomingFiles,
    operation,
    nextAction: recommendNextAction({ tracking, upstreamState, changes, incomingFiles, operation }),
    worktrees: await traceAsync("state:worktrees", state.root, () => getLinkedWorktrees(state.root)),
    relaxedRules: listSafeGuardRules([...relaxedSafeGuardRules] as string[]).filter((rule) => rule.relaxed).map(({ title }) => title),
    pullBeforePush: isPullBeforePushEnabled(),
  };
}

const repositorySnapshots = new Map();
const stateLoadsInFlight = new Map();
const stateLoadGenerations = new Map();
let snapshotVersion = 0;

function getStateLoadGeneration(cwd) {
  return stateLoadGenerations.get(cwd) ?? 0;
}

function invalidateSharedStateLoad(cwd = null) {
  if (cwd) {
    stateLoadGenerations.set(cwd, getStateLoadGeneration(cwd) + 1);
    stateLoadsInFlight.delete(cwd);
    return;
  }
  const roots = new Set([
    ...repositorySnapshots.keys(),
    ...stateLoadsInFlight.keys(),
    ...stateLoadGenerations.keys(),
  ]);
  for (const root of roots) {
    stateLoadGenerations.set(root, getStateLoadGeneration(root) + 1);
  }
  stateLoadsInFlight.clear();
}

function getCachedState(cwd) {
  return repositorySnapshots.get(cwd)?.state ?? null;
}

async function refreshState(cwd, { maxAgeMs = 0 } = {}) {
  const cached = repositorySnapshots.get(cwd);
  if (maxAgeMs > 0 && cached && Date.now() - cached.updatedAt <= maxAgeMs) {
    return cached.state;
  }

  const currentGeneration = getStateLoadGeneration(cwd);
  const existing = stateLoadsInFlight.get(cwd);
  if (existing?.generation === currentGeneration) return existing.promise;

  const generation = currentGeneration;
  const promise = traceAsync("state:refresh", cwd, async () => {
    const state = await loadState(cwd);
    if (generation === getStateLoadGeneration(cwd)) {
      repositorySnapshots.set(cwd, {
        version: ++snapshotVersion,
        updatedAt: Date.now(),
        state,
      });
    }
    return state;
  });
  stateLoadsInFlight.set(cwd, { generation, promise });
  try {
    return await promise;
  } finally {
    const current = stateLoadsInFlight.get(cwd);
    if (current?.generation === generation && current.promise === promise) {
      stateLoadsInFlight.delete(cwd);
    }
  }
}

async function setCachedWorkingTreeChanges(cwd, changes) {
  const cached = getCachedState(cwd);
  if (!cached || cached.kind !== "repository") return refreshState(cwd);
  const { recommendNextAction } = await import("./git-workflows.mjs");
  const state = {
    ...cached,
    changes,
    nextAction: recommendNextAction({
      tracking: cached.tracking,
      upstreamState: cached.upstreamState,
      changes,
      incomingFiles: cached.incomingFiles,
      operation: cached.operation,
    }),
  };
  repositorySnapshots.set(cwd, {
    version: ++snapshotVersion,
    updatedAt: Date.now(),
    state,
  });
  return state;
}

async function applyWorkingTreeCacheAction(
  cwd,
  { action, path = null }: { action: "stage" | "stage-all" | "unstage" | "unstage-all"; path?: string | null },
) {
  const cached = getCachedState(cwd);
  if (!cached || cached.kind !== "repository") return refreshState(cwd);
  const targetPath = path ? String(path).replace(/\/+$/, "") : null;
  const changes = (cached.changes ?? []).map((change) => {
    if (targetPath && change.path !== targetPath && !change.path.startsWith(`${targetPath.replace(/\/$/, "")}/`)) return change;
    const status = String(change.status ?? "  ").padEnd(2, " ");
    const index = status[0] ?? " ";
    const worktree = status[1] ?? " ";
    if (action === "stage" || action === "stage-all") {
      if (status === "??") return { ...change, status: "A " };
      const staged = index !== " " ? index : worktree;
      return { ...change, status: `${staged === "?" ? "A" : staged} ` };
    }
    if (action === "unstage" || action === "unstage-all") {
      if (index === "A") return { ...change, status: "??" };
      const unstaged = worktree !== " " ? worktree : index;
      return { ...change, status: ` ${unstaged}` };
    }
    return change;
  });
  return setCachedWorkingTreeChanges(cwd, changes);
}

async function refreshWorkingTreeState(cwd) {
  const cached = getCachedState(cwd);
  if (!cached || cached.kind !== "repository") return refreshState(cwd);

  invalidateSharedStateLoad(cwd);
  const { getWorkingTreeChanges } = await import("./git-safety.mjs");
  const changes = await traceAsync("state:working-tree-refresh", cwd, () => getWorkingTreeChanges(cwd));
  return setCachedWorkingTreeChanges(cwd, changes);
}

async function relocalizeCachedState(cwd = null) {
  const { recommendNextAction } = await import("./git-workflows.mjs");
  const roots = cwd ? [cwd] : [...repositorySnapshots.keys()];
  for (const root of roots) {
    const entry = repositorySnapshots.get(root);
    const state = entry?.state;
    if (!entry || !state || state.kind !== "repository") continue;
    const nextAction = recommendNextAction({
      tracking: state.tracking,
      upstreamState: state.upstreamState,
      changes: Array.isArray(state.changes) ? state.changes : [],
      incomingFiles: Array.isArray(state.incomingFiles) ? state.incomingFiles : [],
      operation: state.operation,
    });
    repositorySnapshots.set(root, {
      ...entry,
      version: ++snapshotVersion,
      updatedAt: Date.now(),
      state: {
        ...state,
        nextAction,
      },
    });
  }
}

async function getState(cwd) {
  return getCachedState(cwd) ?? refreshState(cwd);
}

async function renderPanelImpl(panel, notice = null, mode = "graph", options = {}) {
  if (notice?.ok === false) await recordActivity(notice);
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

  const stageTraceId = isPerfTracingEnabled() ? notice?.stageTraceId : null;
  const html = await traceAsync(`stage:html:${stageTraceId || "none"}`, cwd, async () =>
    mode === "sidebar" ? renderSidebarHtml(state, notice) : renderGraphHtml(state, notice, options));
  await traceAsync(`stage:postMessage:${stageTraceId || "none"}`, cwd, () =>
    renderPatchableWebview(panel.webview, html, stageTraceId));
}

async function renderPanel(panel, notice = null, mode = "graph", options = {}) {
  return traceAsync(`render:${mode}`, getCwd(), () => renderPanelImpl(panel, notice, mode, options));
}

async function getGuideKey(action, data: any = {}) {
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
    action: result.action,
    code: result.code,
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
    const { buildOperationGuard, listConflictedFiles } = await import("./git-workflows.mjs");
    return buildOperationGuard(operation, await listConflictedFiles(cwd));
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

async function confirmMutation({ action, target = "", effect = "", risk = "", level = "safe", confirmLabel = null }) {
  let worktreeContext = null;
  const cwd = getCwd();
  if (cwd) {
    const { getLinkedWorktrees } = await import("./git-state.mjs");
    const worktrees = await getLinkedWorktrees(cwd);
    const others = worktrees.filter((worktree) => !worktree.isCurrent);
    if (others.length) {
      const details = others.map((item) => `${item.branch ?? t("dialog.confirmMutation.detachedHead")} · ${item.path}`).join(", ");
      worktreeContext = t("dialog.confirmMutation.worktreeContext", { count: others.length, details });
    }
  }
  const safeguardStatus = level === "blocked"
    ? t("dialog.confirmMutation.blocked")
    : level === "warning"
      ? t("dialog.confirmMutation.warning")
      : t("dialog.confirmMutation.safe");

  const lines = [
    t("dialog.confirmMutation.actionLabel", { action }),
    target ? t("dialog.confirmMutation.targetLabel", { target }) : null,
    effect ? t("dialog.confirmMutation.effectLabel", { effect }) : null,
    risk ? t("dialog.confirmMutation.riskLabel", { risk }) : null,
    worktreeContext,
    t("dialog.confirmMutation.safeguardLabel", { status: safeguardStatus }),
  ].filter(Boolean).join("\n");
  if (level === "blocked") {
    await vscode.window.showWarningMessage(lines, { modal: true });
    return false;
  }
  const label = confirmLabel ?? t("dialog.confirmMutation.defaultConfirmLabel");
  const choice = await vscode.window.showWarningMessage(lines, { modal: true }, label);
  return Boolean(choice);
}


function initialize(context) {
  activeContext = context;
  selectedRepositoryRoot = context.workspaceState.get("gitNext.selectedRepositoryRoot", null);
  setLocale(context.globalState.get("gitNext.locale", vscode?.env?.language));
}

function getActiveContext() {
  return activeContext;
}

function setKnownRepositoryRoots(roots) {
  const nextRoots = [...new Set((roots ?? []).filter(Boolean))];
  knownRepositoryRoots = nextRoots;
  for (const root of [...repositorySnapshots.keys()]) {
    if (!nextRoots.includes(root)) repositorySnapshots.delete(root);
  }
  for (const root of [...stateLoadsInFlight.keys()]) {
    if (!nextRoots.includes(root)) stateLoadsInFlight.delete(root);
  }
  for (const root of [...stateLoadGenerations.keys()]) {
    if (!nextRoots.includes(root)) stateLoadGenerations.delete(root);
  }
  if (selectedRepositoryRoot && !knownRepositoryRoots.includes(selectedRepositoryRoot)) {
    selectedRepositoryRoot = null;
    void activeContext?.workspaceState.update("gitNext.selectedRepositoryRoot", null);
  }
}

module.exports = {
  initialize,
  getActiveContext,
  setKnownRepositoryRoots,
  secureWebviewHtml,
  setWebviewHtml,
  renderPatchableWebview,
  getOrCreateWebviewPanel,
  recordActivity,
  isPullBeforePushEnabled,
  getCwd,
  selectRepository,
  getRepositoryRoot,
  getState,
  getCachedState,
  refreshState,
  refreshWorkingTreeState,
  applyWorkingTreeCacheAction,
  relocalizeCachedState,
  invalidateSharedStateLoad,
  renderPanel,
  getGuideKey,
  showResult,
  showStatefulResult,
  guardWorkingState,
  confirmMutation,
  relaxedSafeGuardRules,
  t,
  getLocale,
  setLocale,
  resetLocale,
  normalizeLocale,
  detectLocale,
  getFixedT,
  registerTranslations,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
};
