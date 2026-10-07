export const GRAPH_INTERACTIONS = `
    const vscode = acquireVsCodeApi();
    let filterTimer;
    let syncPendingAction = null;

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
      if (event.data?.type !== "syncPending") return;
      syncPendingAction = event.data.pending ? event.data.action : null;
      applySyncPending();
    });
    window.addEventListener("gitnext:refresh", applySyncPending);

    const graphTable = () => document.querySelector(".graph-table");
    const clearActiveLane = () => {
      graphTable()?.classList.remove("has-active-lane");
      for (const item of document.querySelectorAll(".lane-active")) item.classList.remove("lane-active");
    };
    const setActiveLane = (lane) => {
      clearActiveLane();
      const table = graphTable();
      if (!table || lane == null) return;
      table.classList.add("has-active-lane");
      for (const item of document.querySelectorAll('[data-lane="' + lane + '"]')) item.classList.add("lane-active");
    };
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

    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (actionButton) {
        const action = actionButton.dataset.action;
        if (["pull", "push"].includes(action)) {
          if (syncPendingAction) return;
          syncPendingAction = action;
          applySyncPending();
        }
        vscode.postMessage({ type: action, guideKey: actionButton.dataset.guideKey ?? null });
        return;
      }
      const commitButton = event.target.closest("button[data-commit-action]");
      if (commitButton) {
        vscode.postMessage({ type: "commitMenu", commit: commitButton.dataset.commitAction });
        return;
      }
      const row = event.target.closest(".commit-row[data-lane]");
      if (row) vscode.postMessage({ type: "openCommitDetails", commit: row.dataset.commitId });
    });

    document.addEventListener("mouseover", (event) => {
      const row = event.target.closest(".commit-row[data-lane]");
      if (row) setActiveLane(row.dataset.lane);
    });
    document.addEventListener("mouseout", (event) => {
      if (event.target.closest(".commit-row[data-lane]")) clearActiveLane();
    });
    document.addEventListener("focusin", (event) => {
      const row = event.target.closest(".commit-row[data-lane]");
      if (row) setActiveLane(row.dataset.lane);
    });
    document.addEventListener("focusout", (event) => {
      if (event.target.closest(".commit-row[data-lane]")) clearActiveLane();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("button")) return;
      const row = event.target.closest(".commit-row[data-lane]");
      if (!row) return;
      event.preventDefault();
      vscode.postMessage({ type: "openCommitDetails", commit: row.dataset.commitId });
    });
    document.addEventListener("input", (event) => {
      if (event.target?.id !== "filter-query") return;
      clearTimeout(filterTimer);
      filterTimer = setTimeout(sendFilters, 180);
    });
    document.addEventListener("change", (event) => {
      if (!["filter-ref", "filter-scope", "filter-focus", "filter-limit", "filter-density"].includes(event.target?.id)) return;
      sendFilters();
    });
  `;
