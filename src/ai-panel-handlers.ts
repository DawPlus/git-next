function createAiPanelHandlers(core: any, getMenus: any, openGuidePanel: any) {
  const {
    getCwd,
    getState,
    getOrCreateWebviewPanel,
    setWebviewHtml,
  } = core;
  const aiDiagnosisState = new WeakMap<any, any>();
  const aiPracticeState = new WeakMap<any, any>();

  async function openAiDiagnosisPanel(context: any, diagnosis: any, provider = "AI", historyId: string | null = null) {
    const { renderAiDiagnosisWorkspace } = await import("./workspace-views.mjs");
    const { panel, created } = getOrCreateWebviewPanel(
      "gitNext.aiDiagnosis",
      "Git Next · AI 진단",
      { enableScripts: true, retainContextWhenHidden: true },
    );
    aiDiagnosisState.set(panel, { diagnosis, provider, historyId });
    setWebviewHtml(panel.webview, renderAiDiagnosisWorkspace({ diagnosis, provider } as any));
    if (!created) return panel;

    panel.webview.onDidReceiveMessage(async (message) => {
      const current = aiDiagnosisState.get(panel) ?? {};
      if (message?.type === "open-guide" && current.diagnosis?.guideKey) {
        await openGuidePanel(context, current.diagnosis.guideKey);
        return;
      }
      if (message?.type === "history") {
        await openAiHistoryPanel(context);
        return;
      }
      if (message?.type === "guided-practice" && current.diagnosis?.guideKey) {
        await openAiPracticePanel(
          context,
          current.diagnosis,
          current.provider,
          current.historyId,
        );
        return;
      }
      if (message?.type === "rescue" && current.diagnosis?.recommendedAction) {
        await getMenus().runAiRecommendedAction(
          panel,
          current.diagnosis.recommendedAction,
          context,
          "graph",
          {},
          current.historyId,
        );
      }
    });
    context.subscriptions.push(panel);
    return panel;
  }

  async function openAiPracticePanel(context: any, diagnosis: any, provider = "AI", historyId: string | null = null) {
    const [{ GUIDES }, { buildPracticePlan, evaluatePracticeStep }, { renderAiPracticeWorkspace }] = await Promise.all([
      import("./git-guide.mjs"),
      import("./ai-practice.mjs"),
      import("./workspace-views.mjs"),
    ]);
    const guide = GUIDES[diagnosis?.guideKey] ?? null;
    const plan = buildPracticePlan(diagnosis?.guideKey, guide?.steps ?? []);
    const { panel, created } = getOrCreateWebviewPanel(
      "gitNext.aiPractice",
      "Git Next · 직접 해보기",
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const state = { diagnosis, provider, historyId, plan, results: [] };
    aiPracticeState.set(panel, state);
    const refresh = () => {
      const current = aiPracticeState.get(panel) ?? state;
      setWebviewHtml(panel.webview, renderAiPracticeWorkspace(current));
    };
    refresh();
    if (!created) return panel;

    panel.webview.onDidReceiveMessage(async (message) => {
      const current = aiPracticeState.get(panel);
      if (!current) return;
      if (message?.type === "back") {
        await openAiDiagnosisPanel(context, current.diagnosis, current.provider, current.historyId);
        return;
      }
      if (message?.type === "practice-action" && current.diagnosis?.recommendedAction) {
        await getMenus().runAiRecommendedAction(
          panel,
          current.diagnosis.recommendedAction,
          context,
          "graph",
          {},
          current.historyId,
        );
        return;
      }
      if (message?.type === "check-step") {
        const index = Number(message.index);
        const step = current.plan[index];
        if (!step) return;
        const cwd = getCwd();
        const repositoryState = cwd ? await getState(cwd) : { kind: "no-repository" };
        current.results[index] = evaluatePracticeStep(step, repositoryState);
        aiPracticeState.set(panel, current);
        refresh();
      }
    });
    context.subscriptions.push(panel);
    return panel;
  }

  async function openAiHistoryPanel(context: any) {
    const { renderAiHistoryWorkspace } = await import("./workspace-views.mjs");
    const { panel, created } = getOrCreateWebviewPanel(
      "gitNext.aiHistory",
      "Git Next · AI 진단 기록",
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const refresh = () => setWebviewHtml(
      panel.webview,
      renderAiHistoryWorkspace(context.globalState.get("gitNext.aiDiagnosisHistory", [])),
    );
    refresh();
    if (!created) return panel;

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message?.type !== "open-entry") return;
      const history = context.globalState.get("gitNext.aiDiagnosisHistory", []);
      const entry = history.find((item) => item?.id === message.id);
      if (entry) await openAiDiagnosisPanel(context, entry.diagnosis, entry.provider, entry.id);
    });
    context.subscriptions.push(panel);
    return panel;
  }

  return {
    openAiDiagnosisPanel,
    openAiPracticePanel,
    openAiHistoryPanel,
  };
}

module.exports = { createAiPanelHandlers };
