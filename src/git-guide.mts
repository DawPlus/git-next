import { escapeHtml } from "./view-shared.mjs";
import {
  getFixedT,
  getLocale,
  getTranslations,
  normalizeLocale,
} from "./view-shared.mjs";

export interface GuideItem {
  title: string;
  summary: string;
  example: string;
  steps: string[];
  avoid: string;
}

export function getGuides(localeCandidate?: string | null): Record<string, GuideItem> {
  const locale = normalizeLocale(localeCandidate);
  const translations = getTranslations(locale);
  const guideBundle = translations?.guide?.guides ?? getTranslations("ko")?.guide?.guides ?? {};
  return guideBundle;
}

export const GUIDES: Record<string, GuideItem> = new Proxy({} as Record<string, GuideItem>, {
  get(_target, prop: string) {
    return getGuides(getLocale())[prop];
  },
  ownKeys() {
    return Object.keys(getGuides(getLocale()));
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const obj = getGuides(getLocale());
    if (prop in obj) {
      return {
        value: obj[prop],
        writable: false,
        enumerable: true,
        configurable: true,
      };
    }
    return undefined;
  },
  has(_target, prop: string) {
    return prop in getGuides(getLocale());
  },
});

export function classifyGuide({
  action,
  code,
  detail = "",
  message = "",
}: {
  action?: string;
  code?: string | null;
  detail?: string;
  message?: string;
} = {}) {
  const text = `${code ?? ""} ${detail} ${message}`.toLowerCase();

  if (/dirty-working-tree|working-tree-dirty|dirty-incoming-overlap/.test(text) && action === "pull") return "dirty-pull";
  if (/pull-conflict|conflict|unmerged|automatic merge failed/.test(text)) return "pull-conflict";
  if (/detached-head/.test(text)) return "detached-head";
  if (/rebase-in-progress|cherry-pick-in-progress|revert-in-progress/.test(text)) return "operation-in-progress";
  if (/non-fast-forward|rejected/.test(text) && action === "push") return "push-rejected";
  if (/diverged|diverg/.test(text)) return "diverged";
  if (/no-upstream|no upstream|no tracking information/.test(text)) return "no-upstream";
  if (/history-rewrite|rewritten|force-push|forced update/.test(text)) return "remote-rewritten";
  if (/merge-in-progress|merge_head|merge 작업/.test(text)) return "merge-in-progress";

  return null;
}

function renderMarkerGuide(tFn: (key: string) => string) {
  return `<section class="marker-card" id="merge-conflict">
    <div class="eyebrow">${escapeHtml(tFn("guide.marker.eyebrow"))}</div>
    <h2>${escapeHtml(tFn("guide.marker.title"))}</h2>
    <p>${tFn("guide.marker.desc")}</p>
    <div class="marker-grid">
      <div class="marker local"><span>${escapeHtml(tFn("guide.marker.localLabel"))}</span><code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code><pre>${escapeHtml(tFn("guide.marker.localDesc"))}</pre></div>
      <div class="marker sep"><span>${escapeHtml(tFn("guide.marker.sepLabel"))}</span><code>=======</code><pre>${escapeHtml(tFn("guide.marker.sepDesc"))}</pre></div>
      <div class="marker incoming"><span>${escapeHtml(tFn("guide.marker.incomingLabel"))}</span><code>&gt;&gt;&gt;&gt;&gt;&gt;&gt; origin/main</code><pre>${escapeHtml(tFn("guide.marker.incomingDesc"))}</pre></div>
    </div>
    <div class="choice-grid">
      <div><strong>${escapeHtml(tFn("guide.marker.choiceLocalTitle"))}</strong><span>${escapeHtml(tFn("guide.marker.choiceLocalDesc"))}</span></div>
      <div><strong>${escapeHtml(tFn("guide.marker.choiceIncomingTitle"))}</strong><span>${escapeHtml(tFn("guide.marker.choiceIncomingDesc"))}</span></div>
      <div><strong>${escapeHtml(tFn("guide.marker.choiceBothTitle"))}</strong><span>${escapeHtml(tFn("guide.marker.choiceBothDesc"))}</span></div>
      <div><strong>${escapeHtml(tFn("guide.marker.choiceEditTitle"))}</strong><span>${escapeHtml(tFn("guide.marker.choiceEditDesc"))}</span></div>
    </div>
  </section>`;
}

export function renderGuideHtml(selected = null, options: { locale?: string } = {}) {
  const locale = options?.locale ?? getLocale();
  const tFn = getFixedT(locale);
  const guides = getGuides(locale);
  const entries = Object.entries(guides);
  const cards = entries.map(([key, guide]) => `
    <article class="guide-card" id="${escapeHtml(key)}">
      <h2>${escapeHtml(guide.title)}</h2>
      <p>${escapeHtml(guide.summary)}</p>
      <ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      <div class="avoid"><strong>${escapeHtml(tFn("guide.avoidLabel"))}</strong> ${escapeHtml(guide.avoid)}</div>
    </article>`
  ).join("");

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(tFn("guide.shellTitle"))}</title>
<style>
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}
main{max-width:1040px;margin:0 auto;padding:22px 24px 56px}
header{margin-bottom:14px}h1,h2,p{margin:0}h1{font-size:20px}.intro{margin-top:5px;color:var(--vscode-descriptionForeground);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.guide-card,.marker-card{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px;background:color-mix(in srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background)) 72%,transparent);transition:transform 140ms ease,border-color 140ms ease,background 140ms ease;animation:cardIn 220ms ease-out both}
.guide-card:nth-child(2){animation-delay:35ms}.guide-card:nth-child(3){animation-delay:70ms}.guide-card:nth-child(4){animation-delay:105ms}.guide-card:nth-child(5){animation-delay:140ms}.guide-card:nth-child(6){animation-delay:175ms}
.guide-card:hover,.marker-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--vscode-focusBorder) 70%,var(--vscode-panel-border));background:color-mix(in srgb,var(--vscode-list-hoverBackground) 58%,var(--vscode-editor-background))}
.guide-card:active,.marker-card:active{transform:scale(.995);border-color:var(--vscode-focusBorder)}
.guide-card:target{border-color:var(--vscode-focusBorder);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-focusBorder) 24%,transparent)}
.guide-card h2,.marker-card h2{font-size:15px}.guide-card p,.marker-card p{margin-top:6px;color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.55}
.guide-card ol{margin:10px 0 0;padding-left:18px}.guide-card li{margin:6px 0;font-size:12px;line-height:1.5}
.avoid{margin-top:10px;padding-top:8px;border-top:1px solid var(--vscode-panel-border);font-size:11px;color:var(--vscode-editorWarning-foreground)}
.marker-card{margin-top:12px}.eyebrow{color:var(--vscode-descriptionForeground);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.marker-grid{display:grid;grid-template-columns:1fr;gap:6px;margin-top:12px}.marker{border-radius:6px;padding:9px;background:var(--vscode-list-inactiveSelectionBackground)}.marker span{display:block;font-weight:700;font-size:10px}.marker code{display:block;margin-top:4px;color:var(--vscode-textLink-foreground);font-size:10px}.marker pre{margin:5px 0 0;font:inherit;font-size:9px;color:var(--vscode-descriptionForeground)}
.choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}.choice-grid>div{padding:8px;border:1px solid var(--vscode-panel-border);border-radius:6px;transition:transform 120ms ease,background 120ms ease}.choice-grid>div:hover{transform:translateX(2px);background:var(--vscode-list-hoverBackground)}.choice-grid strong,.choice-grid span{display:block;font-size:9px}.choice-grid span{margin-top:3px;color:var(--vscode-descriptionForeground);line-height:1.35}
@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:720px){main{padding:16px 14px 40px}.grid,.choice-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header><h1>${escapeHtml(tFn("guide.headerTitle"))}</h1><div class="intro">${escapeHtml(tFn("guide.headerIntro"))}</div></header>
<section class="grid">${cards}</section>
${renderMarkerGuide(tFn)}
</main>
<script>
const selected=${JSON.stringify(selected)};
if(selected){
  const target=document.getElementById(selected);
  if(target) requestAnimationFrame(()=>target.scrollIntoView({block:"start"}));
}
</script>
</body></html>`;
}
