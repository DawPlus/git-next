import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

for (const file of ["extension.js", "extension-core.js", "sync-handler.js", "git-menu-handlers.js", "panel-handlers.js", "ai-panel-handlers.js", "webview-host.js", "webview-message-handler.js", "git-state.mjs", "git-actions.mjs", "git-command.mjs", "git-workflows.mjs", "git-integration-workflows.mjs", "git-operation-workflows.mjs", "git-change-workflows.mjs", "git-history-workflows.mjs", "git-remote-workflows.mjs", "git-recovery-workflows.mjs", "git-diagnostics.mjs", "git-guidance.mjs", "ai-diagnosis.mjs", "ai-provider.mjs", "ai-history.mjs", "ai-practice.mjs", "git-safety.mjs", "git-tracking.mjs", "git-risk.mjs", "git-preflight.mjs", "safe-guard.mjs", "graph-state.mjs", "graph-styles.mjs", "graph-interactions.mjs", "graph-view.mjs", "sidebar-shell-styles.mjs", "sidebar-changes-styles.mjs", "sidebar-tools-styles.mjs", "sidebar-interactions.mjs", "sidebar-view.mjs", "view-shared.mjs", "glossary-data.mjs", "glossary-view.mjs", "git-guide.mjs", "workspace-views.mjs"]) {
  await copyFile(
    new URL(`../src/${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
}
