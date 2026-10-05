const vscode = require("vscode");
const path = require("node:path");

const core = require("./extension-core.js");
const { createSyncHandler } = require("./sync-handler.js");
const { createPanelHandlers } = require("./panel-handlers.js");
const { createGitMenus } = require("./git-menu-handlers.js");
const { createWebviewHost } = require("./webview-host.js");

const sync = createSyncHandler(core);
let menus;
let webviewHost;
const panels = createPanelHandlers(core, () => menus);
menus = createGitMenus(core, sync, panels, () => webviewHost);
webviewHost = createWebviewHost(core, panels, menus, sync);

function activate(context) {
  core.initialize(context);
  void webviewHost.registerBuiltInGitStateRefresh(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("git-next-diff", {
      provideTextDocumentContent: panels.getDiffDocumentContent,
    }),
  );

  const sidebar = vscode.window.registerWebviewViewProvider(
    "gitNext.sidebar",
    {
      resolveWebviewView: async (view) => {
        await webviewHost.initializeWebviewHost(view, context, "sidebar");
      },
    },
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const openGitNext = vscode.commands.registerCommand("gitNext.open", async () => {
    await webviewHost.openGraphPanel(context);
  });

  const openFileHistory = vscode.commands.registerCommand("gitNext.fileHistory", async (resourceUri) => {
    const cwd = core.getCwd(resourceUri);
    if (!cwd) return;

    let uri = resourceUri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      const files = await vscode.workspace.findFiles("**/*", "**/{.git,node_modules}/**", 2000);
      const selectedFile = await vscode.window.showQuickPick(
        files.map((file) => ({
          label: path.basename(file.fsPath),
          description: vscode.workspace.asRelativePath(file, false),
          uri: file,
        })),
        { placeHolder: "이력을 볼 파일 선택" },
      );
      uri = selectedFile?.uri;
    }
    if (!uri) return;

    const root = await core.getRepositoryRoot(cwd);
    const filePath = path.relative(root, uri.fsPath);
    const workflows = await import("./git-workflows.mjs");
    const history = await workflows.getFileHistory(root, filePath);
    if (!history.length) {
      await vscode.window.showInformationMessage("선택한 파일의 커밋 이력이 없습니다.");
      return;
    }

    const selected = await vscode.window.showQuickPick(
      history.map((commit) => ({
        label: commit.message || "(메시지 없음)",
        description: commit.id.slice(0, 8),
        detail: commit.id,
        commit,
      })),
      { placeHolder: `${vscode.workspace.asRelativePath(uri, false)} · 관련 커밋 선택` },
    );
    if (!selected) return;

    await webviewHost.openGraphPanel(context, {
      focus: "file-history",
      focusCommitIds: history.map(({ id }) => id),
      focusCommitId: selected.commit.id,
    });
  });

  context.subscriptions.push(sidebar, openGitNext, openFileHistory);
}

function deactivate() {}

module.exports = { activate, deactivate };
