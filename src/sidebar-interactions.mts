export const SIDEBAR_INTERACTIONS = `
    const vscode = acquireVsCodeApi();
    let syncPendingAction = null;
    let refreshPending = false;
    const applyRefreshPending = () => {
      for (const button of document.querySelectorAll('button[data-action="refresh"]')) {
        button.disabled = refreshPending;
        button.classList.toggle("is-refreshing", refreshPending);
        button.setAttribute("aria-busy", String(refreshPending));
        if (!button.dataset.refreshOriginal) button.dataset.refreshOriginal = button.getAttribute("title") ?? "원격 상태 새로고침";
        button.setAttribute("title", refreshPending ? "원격 상태 확인 중..." : button.dataset.refreshOriginal);
        const label = button.classList.contains("guard-next-action") ? button : null;
        if (label) {
          if (!button.dataset.refreshLabel) button.dataset.refreshLabel = button.textContent ?? "";
          button.textContent = refreshPending ? "원격 상태 확인 중..." : button.dataset.refreshLabel;
        }
      }
    };
    window.gitNextStageClicks = new Map();

    const applySyncPending = () => {
      for (const button of document.querySelectorAll('button[data-action="pull"], button[data-action="push"]')) {
        const label = button.querySelector("span");
        if (label && !label.dataset.syncOriginal) label.dataset.syncOriginal = label.textContent ?? "";
        button.disabled = Boolean(syncPendingAction);
        if (label) {
          label.textContent = syncPendingAction === button.dataset.action
            ? (syncPendingAction === "push" ? "Push 중..." : "Pull 중...")
            : (label.dataset.syncOriginal ?? label.textContent);
        }
      }
    };

    window.addEventListener("message", (event) => {
      if (event.data?.type === "refreshPending") {
        refreshPending = Boolean(event.data.pending);
        applyRefreshPending();
        return;
      }
      if (event.data?.type === "syncPending") {
        syncPendingAction = event.data.pending ? event.data.action : null;
        applySyncPending();
        return;
      }
      if (event.data?.type === "clearCommitMessage") {
        const input = document.querySelector("#sidebar-commit-message");
        if (input) input.value = "";
      }
    });

    window.addEventListener("gitnext:refresh", () => { applySyncPending(); applyRefreshPending(); });

    document.addEventListener("click", (event) => {
      const toolToggle = event.target.closest("[data-toggle-tools]");
      if (toolToggle) {
        const toolPanel = document.querySelector("[data-tool-panel]");
        const opening = toolPanel?.hasAttribute("hidden");
        if (opening) toolPanel?.removeAttribute("hidden");
        else toolPanel?.setAttribute("hidden", "");
        toolToggle.setAttribute("aria-expanded", String(Boolean(opening)));
        return;
      }

      const button = event.target.closest("button[data-action]");
      if (!button) return;
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
        tool: button.dataset.tool ?? null,
        untracked: button.dataset.untracked === "1",
        message: document.querySelector("#sidebar-commit-message")?.value ?? "",
      };
      if (message.type === "focusCommit") {
        document.querySelector("#sidebar-commit-message")?.focus();
        return;
      }
      if (message.type === "refresh") {
        if (refreshPending) return;
        refreshPending = true;
        applyRefreshPending();
        vscode.postMessage(message);
        return;
      }
      if (["pull", "push"].includes(message.type)) {
        if (syncPendingAction) return;
        syncPendingAction = message.type;
        applySyncPending();
        vscode.postMessage(message);
        return;
      }
      const row = button.closest(".scm-file");
      if (row && button.classList.contains("mini-action") && ["sidebarStage", "sidebarUnstage"].includes(message.type)) {
        button.disabled = true;
        row.classList.add(message.type === "sidebarStage" ? "is-moving-up" : "is-moving-down");
        const stageTraceId = String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000));
        message.stageTraceId = stageTraceId;
        const started = performance.now();
        if (window.gitNextPerfEnabled) window.gitNextStageClicks.set(stageTraceId, started);
        if (window.gitNextPerfEnabled) console.debug("[Git Next perf] op=stage:dispatch:" + stageTraceId + " ms=" + Math.round(performance.now() - started));
        vscode.postMessage(message);
        return;
      }
      vscode.postMessage(message);
    });
  `;
