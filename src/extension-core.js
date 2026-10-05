const vscode = require("vscode");
const path = require("node:path");
const crypto = require("node:crypto");

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
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "gitNextRefresh" || typeof data.mainHtml !== "string") return;
  const main = document.querySelector("main");
  if (!main) return;
  const controls = [...document.querySelectorAll("input, textarea, select")].map((element, index) => ({
    key: element.id || element.name || String(index),
    value: element.value,
    selectionStart: typeof element.selectionStart === "number" ? element.selectionStart : null,
    selectionEnd: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
  }));
  const activeId = document.activeElement?.id || null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  main.innerHTML = data.mainHtml;
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

async function renderPatchableWebview(webview, html) {
  const mainHtml = getMainHtml(html);
  if (!patchableWebviews.has(webview) || !mainHtml || typeof webview.postMessage !== "function") {
    setWebviewHtml(webview, html);
    if (mainHtml) patchableWebviews.add(webview);
    return;
  }
  await webview.postMessage({ type: "gitNextRefresh", mainHtml });
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

async function getState(cwd) {
  const [
    { getRepositoryState, getLinkedWorktrees },
    { getTrackingStatus, getWorkingTreeChanges, getInProgressOperation },
    { recommendNextAction },
    { listSafeGuardRules },
  ] = await Promise.all([
    import("./git-state.mjs"),
    import("./git-safety.mjs"),
    import("./git-workflows.mjs"),
    import("./safe-guard.mjs"),
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
    worktrees: await getLinkedWorktrees(state.root),
    relaxedRules: listSafeGuardRules([...relaxedSafeGuardRules]).filter((rule) => rule.relaxed).map(({ title }) => title),
    pullBeforePush: isPullBeforePushEnabled(),
  };
}

async function renderPanel(panel, notice = null, mode = "graph", options = {}) {
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

  await renderPatchableWebview(
    panel.webview,
    mode === "sidebar"
      ? renderSidebarHtml(state, notice)
      : renderGraphHtml(state, notice, options),
  );
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

async function confirmMutation({ action, target = "", effect = "", risk = "", level = "safe", confirmLabel = "실행" }) {
  let worktreeContext = null;
  const cwd = getCwd();
  if (cwd) {
    const { getLinkedWorktrees } = await import("./git-state.mjs");
    const worktrees = await getLinkedWorktrees(cwd);
    const others = worktrees.filter((worktree) => !worktree.isCurrent);
    if (others.length) {
      worktreeContext = `다른 작업 폴더 ${others.length}개: ${others.map((item) => `${item.branch ?? "분리된 HEAD"} · ${item.path}`).join(", ")}`;
    }
  }
  const lines = [
    `작업: ${action}`,
    target ? `대상: ${target}` : null,
    effect ? `변경: ${effect}` : null,
    risk ? `주의: ${risk}` : null,
    worktreeContext,
    `Safe Guard: ${level === "blocked" ? "차단" : level === "warning" ? "주의" : "확인됨"}`,
  ].filter(Boolean).join("\n");
  if (level === "blocked") {
    await vscode.window.showWarningMessage(lines, { modal: true });
    return false;
  }
  const choice = await vscode.window.showWarningMessage(lines, { modal: true }, confirmLabel);
  return Boolean(choice);
}


function initialize(context) {
  activeContext = context;
  selectedRepositoryRoot = context.workspaceState.get("gitNext.selectedRepositoryRoot", null);
}

function getActiveContext() {
  return activeContext;
}

function setKnownRepositoryRoots(roots) {
  knownRepositoryRoots = [...new Set((roots ?? []).filter(Boolean))];
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
  renderPanel,
  getGuideKey,
  showResult,
  showStatefulResult,
  guardWorkingState,
  confirmMutation,
  relaxedSafeGuardRules,
};
