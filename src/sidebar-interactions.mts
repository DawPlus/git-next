export const SIDEBAR_INTERACTIONS = `
    const vscode = acquireVsCodeApi();

    window.addEventListener("message", (event) => {
      if (event.data?.type === "clearCommitMessage") {
        const input = document.querySelector("#sidebar-commit-message");
        if (input) input.value = "";
      }
    });

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
      const row = button.closest(".scm-file");
      if (row && button.classList.contains("mini-action") && ["sidebarStage", "sidebarUnstage"].includes(message.type)) {
        button.disabled = true;
        row.classList.add(message.type === "sidebarStage" ? "is-moving-up" : "is-moving-down");
        window.setTimeout(() => vscode.postMessage(message), 180);
        return;
      }
      vscode.postMessage(message);
    });
  `;
