import { TERMS, SCENARIOS, getGlossaryTerms, getScenarios } from "./glossary-data.mjs";
import { escapeHtml } from "./view-shared.mjs";
import { getFixedT, getLocale } from "./view-shared.mjs";

export { TERMS, SCENARIOS, getGlossaryTerms, getScenarios } from "./glossary-data.mjs";

function nodeKind(label) {
  const value = String(label).toLowerCase();
  if (/원격|origin|remote/.test(value)) return "remote";
  if (/stash/.test(value)) return "stash";
  if (/branch|브랜치|main|feature/.test(value)) return "branch";
  if (/tag|v\d/.test(value)) return "tag";
  if (/commit|커밋|기록|head|현재|이전|history|current|previous|base|picked|revert|original/.test(value)) return "commit";
  if (/작업|파일|변경|work|file|change|edit/.test(value)) return "work";
  return "local";
}

function nodeIcon(kind) {
  const icons = {
    work: `<svg viewBox="0 0 24 24"><path d="M5 4.5h9l5 5v10H5z"></path><path d="M14 4.5v5h5"></path></svg>`,
    local: `<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="12" rx="2"></rect><path d="M9 20h6M12 17v3"></path></svg>`,
    remote: `<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.4-1.4A4.5 4.5 0 0 0 7 18Z"></path></svg>`,
    stash: `<svg viewBox="0 0 24 24"><path d="M5 7h14v11H5z"></path><path d="M8 4h8M8 12h8M12 9v6"></path></svg>`,
    branch: `<svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle><circle cx="18" cy="9" r="2"></circle><path d="M6 7v10M8 15c5 0 8-2 8-4"></path></svg>`,
    tag: `<svg viewBox="0 0 24 24"><path d="M4 5v6l9 9 7-7-9-9H5a1 1 0 0 0-1 1Z"></path><circle cx="8" cy="8" r="1"></circle></svg>`,
    commit: `<svg viewBox="0 0 24 24"><path d="M4 12h5M15 12h5"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  };
  return icons[kind] ?? icons.local;
}

function renderFlowNode(label) {
  const kind = nodeKind(label);
  return `<span class="flow-node ${kind}">
    <span class="flow-icon" aria-hidden="true">${nodeIcon(kind)}</span>
    <span>${escapeHtml(label)}</span>
  </span>`;
}

function renderFlow(flow, tone, animation = "push", tFn?: (key: string, params?: any) => string) {
  const [from, to] = flow;
  const fromKind = nodeKind(from);
  const toKind = nodeKind(to);
  const ariaLabel = tFn
    ? tFn("glossary.flowAriaLabel", { from, to })
    : `${escapeHtml(from)}와 ${escapeHtml(to)}의 Git 관계`;
  return `<div class="flow ${escapeHtml(tone)} semantic-${escapeHtml(animation)}" aria-label="${escapeHtml(ariaLabel)}">
    ${renderFlowNode(from)}
    <span class="flow-track flow-stage" aria-hidden="true">
      <span class="flow-actor actor-a actor-${fromKind}">${nodeIcon(fromKind)}</span>
      <span class="flow-peer actor-b actor-${toKind}">${nodeIcon(toKind)}</span>
      <span class="flow-copy actor-copy">${nodeIcon("commit")}</span>
      <span class="semantic-mark"></span>
      <svg class="branch-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M2 18 H36"></path>
        <path d="M36 18 C54 18 60 2 98 2"></path>
        <path d="M36 18 C54 18 60 34 98 34"></path>
      </svg>
      <svg class="merge-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M2 2 C40 2 46 18 64 18"></path>
        <path d="M2 34 C40 34 46 18 64 18"></path>
        <path d="M64 18 H98"></path>
      </svg>
      <svg class="diverged-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M2 18 H34"></path>
        <path d="M34 18 C52 18 60 3 98 3"></path>
        <path d="M34 18 C52 18 60 33 98 33"></path>
      </svg>
      <svg class="rebase-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path class="base-line" d="M2 28 H98"></path>
        <path class="old-line" d="M18 28 C34 28 36 8 54 8 H82"></path>
      </svg>
      <svg class="cherry-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path class="source-line" d="M4 7 H96"></path>
        <path class="target-line" d="M4 29 H96"></path>
        <path class="copy-line" d="M34 7 C52 7 58 29 78 29"></path>
      </svg>
      <svg class="stash-lines semantic-shape" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M8 18 H28 C46 18 52 7 70 7"></path>
      </svg>
    </span>
    ${renderFlowNode(to)}
  </div>`;
}

export function renderGlossaryHtml(options: { locale?: string } = {}) {
  const locale = options?.locale ?? getLocale();
  const tFn = getFixedT(locale);
  const terms = getGlossaryTerms(locale);
  const cards = terms.map((item) => {
    const search = [
      item.term,
      item.ko,
      item.summary,
      item.effect,
      item.example,
      ...item.flow,
    ].join(" ").toLowerCase();

    const toneLabel =
      item.tone === "remote"
        ? tFn("glossary.toneRemote")
        : item.tone === "danger"
        ? tFn("glossary.toneDanger")
        : item.tone === "warning"
        ? tFn("glossary.toneWarning")
        : tFn("glossary.toneLocal");

    return `
      <article class="term ${escapeHtml(item.tone)}" data-search="${escapeHtml(search)}">
        <div class="term-head">
          <div>
            <div class="term-ko">${escapeHtml(item.ko)}</div>
            <h2>${escapeHtml(item.term)}</h2>
          </div>
          <span class="term-kind">${escapeHtml(toneLabel)}</span>
        </div>
        <p class="summary">${escapeHtml(item.summary)}</p>
        ${renderFlow(item.flow, item.tone, item.animation, tFn)}
        <div class="effect">${escapeHtml(item.effect)}</div>
        <div class="example"><span>${escapeHtml(tFn("glossary.exampleLabel"))}</span>${escapeHtml(item.example)}</div>
      </article>`;
  }).join("");

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(tFn("glossary.shellTitle"))}</title>
<style>
*{box-sizing:border-box}
body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}
main{max-width:1060px;margin:0 auto;padding:20px 24px 52px}
header{position:sticky;top:0;z-index:3;padding:8px 0 14px;background:color-mix(in srgb,var(--vscode-editor-background) 94%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--vscode-panel-border)}
h1,h2,p{margin:0}
h1{font-size:19px}
.intro{margin-top:4px;color:var(--vscode-descriptionForeground);font-size:13px}
.search{width:100%;margin-top:10px;padding:7px 9px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:5px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);outline:none}
.search:focus{border-color:var(--vscode-focusBorder)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.term{position:relative;min-width:0;padding:15px;border:1px solid color-mix(in srgb,var(--vscode-panel-border) 82%,transparent);border-radius:8px;background:color-mix(in srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background)) 70%,transparent);transition:border-color 140ms ease,background 140ms ease,transform 140ms ease;animation:termIn 220ms ease-out both}
.term:nth-child(2n){animation-delay:35ms}.term:nth-child(3n){animation-delay:70ms}.term:nth-child(5n){animation-delay:105ms}
.term::before{content:"";position:absolute;left:-1px;top:12px;bottom:12px;width:2px;border-radius:999px;background:transparent;transition:background 140ms ease}
.term:hover,.term:focus-within{border-color:color-mix(in srgb,var(--vscode-focusBorder) 72%,var(--vscode-panel-border));background:color-mix(in srgb,var(--vscode-list-hoverBackground) 62%,var(--vscode-editor-background));transform:translateY(-1px)}
.term:active{transform:scale(.995);border-color:var(--vscode-focusBorder)}
.term:hover::before,.term:focus-within::before{background:var(--vscode-focusBorder)}
.term-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.term-ko{color:var(--vscode-descriptionForeground);font-size:13px}
.term h2{margin-top:1px;font-size:17px;letter-spacing:-.01em}
.term-kind{flex:none;padding:3px 8px;border:1px solid var(--vscode-panel-border);border-radius:999px;color:var(--vscode-descriptionForeground);font-size:12px}
.summary{margin-top:9px;font-size:15px;line-height:1.55;font-weight:650}
.flow{display:grid;grid-template-columns:minmax(86px,auto) minmax(52px,1fr) minmax(86px,auto);align-items:center;gap:8px;margin-top:12px}
.flow-node{display:flex;align-items:center;gap:6px;min-width:0;padding:6px 8px;border:1px solid transparent;border-radius:6px;font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.flow-node>span:last-child{overflow:hidden;text-overflow:ellipsis}
.flow-icon{display:inline-grid;place-items:center;flex:none;width:20px;height:20px;border-radius:5px}
.flow-icon svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.flow-node.work{color:var(--vscode-gitDecoration-modifiedResourceForeground);background:color-mix(in srgb,var(--vscode-gitDecoration-modifiedResourceForeground) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-gitDecoration-modifiedResourceForeground) 28%,transparent)}
.flow-node.local,.flow-node.commit{color:var(--vscode-textLink-foreground);background:color-mix(in srgb,var(--vscode-textLink-foreground) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-textLink-foreground) 28%,transparent)}
.flow-node.remote{color:var(--vscode-charts-blue,var(--vscode-textLink-foreground));background:color-mix(in srgb,var(--vscode-charts-blue,var(--vscode-textLink-foreground)) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-charts-blue,var(--vscode-textLink-foreground)) 28%,transparent)}
.flow-node.stash{color:var(--vscode-charts-purple,var(--vscode-textLink-foreground));background:color-mix(in srgb,var(--vscode-charts-purple,var(--vscode-textLink-foreground)) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-charts-purple,var(--vscode-textLink-foreground)) 28%,transparent)}
.flow-node.branch{color:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground));background:color-mix(in srgb,var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground)) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground)) 28%,transparent)}
.flow-node.tag{color:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground));background:color-mix(in srgb,var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground)) 10%,transparent);border-color:color-mix(in srgb,var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground)) 28%,transparent)}
.flow-track{position:relative;height:28px;overflow:visible}
.flow-track::before{content:"";position:absolute;left:4%;right:5%;top:50%;height:1px;background:color-mix(in srgb,var(--vscode-descriptionForeground) 48%,transparent);transform:translateY(-50%)}
.flow-track::after{content:"";position:absolute;right:4%;top:50%;width:6px;height:6px;border-top:1.5px solid var(--vscode-descriptionForeground);border-right:1.5px solid var(--vscode-descriptionForeground);transform:translateY(-50%) rotate(45deg)}
.flow-actor,.flow-peer,.flow-copy,.semantic-mark{position:absolute;top:50%;transform:translate(-50%,-50%);z-index:2}
.flow-actor,.flow-peer,.flow-copy{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;background:var(--vscode-editor-background)}
.flow-actor svg,.flow-peer svg,.flow-copy svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.flow-copy{left:34%;top:20%;opacity:0;color:var(--vscode-textLink-foreground)}
.flow-actor{left:4%;color:var(--vscode-textLink-foreground)}
.flow-peer{left:96%;opacity:0;color:var(--vscode-charts-purple,var(--vscode-textLink-foreground))}
.actor-work{color:var(--vscode-gitDecoration-modifiedResourceForeground)}
.actor-remote{color:var(--vscode-charts-blue,var(--vscode-textLink-foreground))}
.actor-stash{color:var(--vscode-charts-purple,var(--vscode-textLink-foreground))}
.actor-branch{color:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground))}
.actor-tag{color:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground))}
.actor-commit,.actor-local{color:var(--vscode-textLink-foreground)}
.semantic-mark{left:50%;opacity:0;color:var(--vscode-editorWarning-foreground);font-size:15px;font-weight:800;background:var(--vscode-editor-background);padding:0 3px}
.semantic-shape{display:none;position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.semantic-shape path{fill:none;stroke:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground));stroke-width:1.6;vector-effect:non-scaling-stroke;stroke-linecap:round}
.merge-lines path{stroke:var(--vscode-textLink-foreground)}
.diverged-lines path{stroke:var(--vscode-editorWarning-foreground)}
.rebase-lines .base-line{stroke:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground))}
.rebase-lines .old-line{stroke:var(--vscode-editorWarning-foreground);stroke-dasharray:3 3;opacity:.7}
.cherry-lines .source-line{stroke:var(--vscode-descriptionForeground);opacity:.6}
.cherry-lines .target-line{stroke:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground))}
.cherry-lines .copy-line{stroke:var(--vscode-textLink-foreground);stroke-dasharray:3 3;opacity:.8}
.stash-lines path{stroke:var(--vscode-charts-purple,var(--vscode-textLink-foreground));stroke-dasharray:4 3;opacity:.72}
.term:hover .flow-track::before{background:color-mix(in srgb,var(--vscode-focusBorder) 52%,transparent)}
.semantic-commit .flow-track::before,.semantic-commit .flow-track::after{display:block}
.semantic-fetch .flow-track::after{display:block;right:auto;left:62%;transform:translate(-50%,-50%) rotate(-135deg)}
.semantic-fetch .semantic-mark{left:62%;opacity:1;width:10px;height:10px;padding:0;border:1.5px solid var(--vscode-textLink-foreground);border-radius:50%;font-size:0}
.semantic-fetch .flow-track::before{right:38%}
.semantic-branch .flow-track::before,.semantic-branch .flow-track::after,
.semantic-merge .flow-track::before,.semantic-merge .flow-track::after,
.semantic-diverged .flow-track::before,.semantic-diverged .flow-track::after,
.semantic-rebase .flow-track::before,.semantic-rebase .flow-track::after,
.semantic-cherry-pick .flow-track::before,.semantic-cherry-pick .flow-track::after{display:none}
.semantic-branch .branch-lines{display:block}
.semantic-merge .merge-lines{display:block}
.semantic-diverged .diverged-lines{display:block}
.semantic-rebase .rebase-lines{display:block}
.semantic-cherry-pick .cherry-lines{display:block}
.semantic-stash .stash-lines{display:block}
.semantic-detached .semantic-mark{opacity:1;color:var(--vscode-editorWarning-foreground);font-size:9px;border:1px solid currentColor;border-radius:4px}
.semantic-detached .semantic-mark::before{content:"HEAD"}
.semantic-ahead-behind .semantic-mark{opacity:1;font-size:9px;color:var(--vscode-descriptionForeground)}
.semantic-ahead-behind .semantic-mark::before{content:"↕ commits"}
.semantic-stash .semantic-mark::before{content:"STASH";font-size:8px}
.semantic-cherry-pick .semantic-mark{display:none}
.semantic-commit .actor-a{animation:semCommit 2.3s ease-in-out infinite}
.semantic-push .actor-a{animation:semPush 2.2s ease-in-out infinite}
.semantic-pull .actor-a{animation:semPull 2.2s ease-in-out infinite}
.semantic-fetch .actor-a{animation:semFetch 2.2s ease-in-out infinite}
.semantic-branch .actor-a{animation:semBranchA 2.4s ease-in-out infinite}.semantic-branch .actor-b{opacity:1;animation:semBranchB 2.4s ease-in-out infinite}
.semantic-head .actor-a{animation:semHead 2.2s ease-in-out infinite;border-radius:50%}
.semantic-detached .actor-a{animation:semDetachedCommit 2.4s ease-in-out infinite}.semantic-detached .actor-b{opacity:1;color:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground));animation:semDetachedBranch 2.4s ease-in-out infinite}.semantic-detached .semantic-mark{animation:semDetachedHead 2.4s ease-in-out infinite}
.semantic-merge .actor-a{animation:semMergeA 2.4s ease-in-out infinite}.semantic-merge .actor-b{opacity:1;animation:semMergeB 2.4s ease-in-out infinite}
.semantic-conflict .actor-a{animation:semConflictA 1.8s ease-in-out infinite}.semantic-conflict .actor-b{opacity:1;color:var(--vscode-editorWarning-foreground);animation:semConflictB 1.8s ease-in-out infinite}.semantic-conflict .semantic-mark{content:"";opacity:1}.semantic-conflict .semantic-mark::before{content:"×"}
.semantic-rebase .actor-a{animation:semRebaseFirst 2.8s ease-in-out infinite}.semantic-rebase .actor-b{opacity:1;animation:semRebaseSecond 2.8s ease-in-out infinite}.semantic-rebase .semantic-mark{opacity:1;left:72%;top:78%;width:7px;height:7px;padding:0;border-radius:50%;background:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground));font-size:0}
.semantic-stash .flow-track::before,.semantic-stash .flow-track::after{display:block}
.semantic-stash .actor-a{animation:semStashAside 2.5s ease-in-out infinite}.semantic-stash .actor-b{opacity:1;color:var(--vscode-charts-purple,var(--vscode-textLink-foreground));animation:semStashShelf 2.5s ease-in-out infinite}.semantic-stash .semantic-mark{opacity:1;color:var(--vscode-charts-purple,var(--vscode-textLink-foreground));left:72%;top:18%;border:1px dashed currentColor;border-radius:5px;padding:1px 4px;background:var(--vscode-editor-background)}
.semantic-cherry-pick .actor-a{left:34%;top:20%;opacity:1;animation:semCherrySource 2.5s ease-in-out infinite}.semantic-cherry-pick .actor-b{left:86%;top:80%;opacity:1;color:var(--vscode-charts-green,var(--vscode-gitDecoration-addedResourceForeground));animation:semCherryTarget 2.5s ease-in-out infinite}.semantic-cherry-pick .actor-copy{opacity:1;animation:semCherryCopy 2.5s ease-in-out infinite}.semantic-cherry-pick .semantic-mark{left:56%;top:50%}
.semantic-revert .actor-a{left:38%;animation:semOriginal 2.4s ease-in-out infinite}.semantic-revert .actor-b{opacity:1;left:68%;animation:semRevert 2.4s ease-in-out infinite}
.semantic-reset .actor-a{animation:semReset 2.2s ease-in-out infinite}.semantic-reset .actor-b{opacity:.45;left:78%;animation:semFadeTail 2.2s ease-in-out infinite}
.semantic-tag .actor-a{left:48%;animation:semCommitPulse 2.4s ease-in-out infinite}.semantic-tag .semantic-mark{opacity:1;color:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground));animation:semTag 2.4s ease-in-out infinite}.semantic-tag .semantic-mark::before{content:"TAG";font-size:8px}
.semantic-upstream .actor-a{animation:semUpstreamA 2.4s ease-in-out infinite}.semantic-upstream .actor-b{opacity:1;animation:semUpstreamB 2.4s ease-in-out infinite}
.semantic-ahead-behind .actor-a{animation:semAheadLocal 2.4s ease-in-out infinite}.semantic-ahead-behind .actor-b{opacity:1;animation:semBehindRemote 2.4s ease-in-out infinite}
.semantic-diverged .actor-a{animation:semDivergeLocal 2.4s ease-in-out infinite}.semantic-diverged .actor-b{opacity:1;animation:semDivergeRemote 2.4s ease-in-out infinite}
.semantic-force-push .actor-a{animation:semForce 1.9s cubic-bezier(.2,.85,.3,1) infinite}.semantic-force-push .actor-b{opacity:1;color:var(--vscode-errorForeground);animation:semRemoteReplace 1.9s ease-in-out infinite}
.term:hover .actor-a,.term:hover .actor-b,.term:hover .semantic-mark{animation-duration:1.55s}
.effect{margin-top:11px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 70%,transparent);color:var(--vscode-descriptionForeground);font-size:13px;line-height:1.55}
.example{margin-top:7px;font-size:13px;line-height:1.55}
.example span{display:inline-block;margin-right:5px;color:var(--vscode-textLink-foreground);font-weight:700}
@keyframes semCommit{0%,12%{left:4%;opacity:.2}55%,78%{left:78%;opacity:1;transform:translate(-50%,-50%) scale(1)}100%{left:78%;opacity:.2;transform:translate(-50%,-50%) scale(.72)}}
@keyframes semPush{0%{left:2%;opacity:.1}18%{opacity:1}82%{left:98%;opacity:1}100%{left:98%;opacity:.1}}
@keyframes semPull{0%{left:2%;opacity:.1}18%{opacity:1}82%{left:98%;opacity:1}100%{left:98%;opacity:.1}}
@keyframes semFetch{0%{left:96%;opacity:.15}55%{left:62%;opacity:1}75%{left:62%;opacity:1;transform:translate(-50%,-50%) scale(.8)}100%{left:62%;opacity:.2}}
@keyframes semBranchA{0%,24%{left:10%;top:50%}72%,100%{left:90%;top:10%}}@keyframes semBranchB{0%,24%{left:10%;top:50%;opacity:.15}72%,100%{left:90%;top:90%;opacity:1}}
@keyframes semHead{0%,20%{left:18%}50%{left:50%}80%,100%{left:82%}}
@keyframes semDetachedCommit{0%,100%{left:58%;top:50%;opacity:1}}@keyframes semDetachedBranch{0%,100%{left:82%;top:50%;opacity:1}}@keyframes semDetachedHead{0%,28%{left:82%;top:50%;opacity:.35}64%,100%{left:58%;top:18%;opacity:1}}
@keyframes semMergeA{0%,18%{left:8%;top:8%;opacity:.3}68%,100%{left:72%;top:50%;opacity:1}}@keyframes semMergeB{0%,18%{left:8%;top:92%;opacity:.3}68%,100%{left:72%;top:50%;opacity:1}}
@keyframes semConflictA{0%,12%{left:8%}45%{left:47%}60%{left:38%}75%{left:46%}100%{left:40%}}@keyframes semConflictB{0%,12%{left:92%}45%{left:53%}60%{left:62%}75%{left:54%}100%{left:60%}}
@keyframes semRebaseFirst{0%,16%{left:28%;top:18%;opacity:1}34%{left:28%;top:5%;opacity:.7}58%{left:60%;top:5%;opacity:.9}74%,100%{left:66%;top:78%;opacity:1}}@keyframes semRebaseSecond{0%,26%{left:46%;top:18%;opacity:1}44%{left:46%;top:5%;opacity:.65}68%{left:76%;top:5%;opacity:.9}84%,100%{left:84%;top:78%;opacity:1}}
@keyframes semStashAside{0%,18%{left:18%;top:50%;opacity:1;transform:translate(-50%,-50%) scale(1)}52%,76%{left:72%;top:18%;opacity:1;transform:translate(-50%,-50%) scale(.82)}86%,100%{left:72%;top:18%;opacity:.15;transform:translate(-50%,-50%) scale(.55)}}@keyframes semStashShelf{0%,100%{left:72%;top:18%;transform:translate(-50%,-50%) scale(1)}52%{transform:translate(-50%,-50%) scale(1.08)}}
@keyframes semCherrySource{0%,100%{transform:translate(-50%,-50%) scale(1)}48%{transform:translate(-50%,-50%) scale(1.08)}}@keyframes semCherryCopy{0%,22%{left:34%;top:20%;opacity:0;transform:translate(-50%,-50%) scale(.55)}36%{opacity:1}72%{left:76%;top:80%;opacity:1;transform:translate(-50%,-50%) scale(.95)}88%,100%{left:76%;top:80%;opacity:.1;transform:translate(-50%,-50%) scale(.55)}}@keyframes semCherryTarget{0%,62%{transform:translate(-50%,-50%) scale(1)}78%,90%{transform:translate(-50%,-50%) scale(1.15)}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes semOriginal{0%,100%{opacity:1}50%{opacity:.65}}@keyframes semRevert{0%,30%{opacity:0;transform:translate(-50%,-50%) scale(.3)}70%,100%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}}
@keyframes semReset{0%,15%{left:88%;opacity:1}75%,100%{left:22%;opacity:1}}@keyframes semFadeTail{0%,30%{opacity:.7}80%,100%{opacity:.08}}
@keyframes semCommitPulse{0%,100%{transform:translate(-50%,-50%) scale(.9)}50%{transform:translate(-50%,-50%) scale(1.08)}}@keyframes semTag{0%,25%{left:50%;top:5%;opacity:0}65%,100%{left:50%;top:28%;opacity:1}}
@keyframes semUpstreamA{0%,100%{left:14%}50%{left:42%}}@keyframes semUpstreamB{0%,100%{left:86%}50%{left:58%}}
@keyframes semAheadLocal{0%,100%{left:28%;top:50%;transform:translate(-50%,-50%) scale(1)}50%{left:34%;top:50%;transform:translate(-50%,-50%) scale(1.18)}}@keyframes semBehindRemote{0%,100%{left:72%;top:50%;transform:translate(-50%,-50%) scale(.82)}50%{left:68%;top:50%;transform:translate(-50%,-50%) scale(1)}}
@keyframes semDivergeLocal{0%,22%{left:34%;top:50%;opacity:.4}72%,100%{left:88%;top:10%;opacity:1}}@keyframes semDivergeRemote{0%,22%{left:34%;top:50%;opacity:.4}72%,100%{left:88%;top:90%;opacity:1}}
@keyframes semForce{0%,8%{left:4%;opacity:.2}58%,88%{left:96%;opacity:1;transform:translate(-50%,-50%) scale(1.18)}100%{left:96%;opacity:.1}}@keyframes semRemoteReplace{0%,35%{left:88%;opacity:1}65%,100%{left:100%;opacity:0;transform:translate(-50%,-50%) scale(.35)}}
@keyframes termIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:720px){main{padding:16px 14px 40px}.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(tFn("glossary.headerTitle"))}</h1>
    <div class="intro">${escapeHtml(tFn("glossary.headerSub"))}</div>
    <input class="search" id="q" type="search" placeholder="${escapeHtml(tFn("glossary.searchPlaceholder"))}" />
  </header>
  <section class="grid">${cards}</section>
</main>
<script>
const input=document.querySelector("#q");
input.addEventListener("input",()=>{
  const q=input.value.trim().toLowerCase();
  for(const item of document.querySelectorAll(".term")){
    item.hidden=Boolean(q)&&!item.dataset.search.includes(q);
  }
});
</script>
</body>
</html>`;
}


export function getMatchingScenarios(state) {
  return new Set(SCENARIOS.filter((scenario) => scenario.matches(state)).map(({ id }) => id));
}


export function getLiveTermExample(term, state, options: { locale?: string } = {}) {
  if (state?.kind !== "repository") return null;
  const locale = options?.locale ?? getLocale();
  const tFn = getFixedT(locale);
  const tracking = state.tracking;
  const remote = state.upstream ?? tFn("glossary.live.defaultRemote");
  const branchName = state.branch ?? tFn("glossary.live.defaultBranch");
  const detachedHead = tFn("glossary.live.detachedHead");

  if (term === "HEAD" && state.head) {
    return tFn("glossary.live.head", {
      head: state.head.slice(0, 8),
      branch: state.branch ?? detachedHead,
    });
  }
  if (term === "Branch" && state.branch) {
    return tFn("glossary.live.branch", { branch: state.branch });
  }
  if (["Upstream", "Remote", "Origin"].includes(term)) {
    return state.upstream
      ? tFn("glossary.live.upstreamConnected", { branch: state.branch, upstream: state.upstream })
      : tracking?.kind === "no-upstream"
      ? tFn("glossary.live.upstreamMissing")
      : null;
  }
  if (term === "Push") {
    return tracking?.kind === "no-upstream"
      ? tFn("glossary.live.pushNoRemote", { branch: branchName })
      : tracking
      ? tFn("glossary.live.pushWithRemote", { remote, ahead: tracking.ahead })
      : null;
  }
  if (term === "Pull") {
    return tracking?.kind === "no-upstream"
      ? tFn("glossary.live.pullNoRemote")
      : tracking
      ? tFn("glossary.live.pullWithRemote", { remote, behind: tracking.behind })
      : null;
  }
  if (term === "Ahead / Behind") {
    return tracking && tracking.kind !== "no-upstream"
      ? tFn("glossary.live.aheadBehind", { ahead: tracking.ahead, behind: tracking.behind })
      : null;
  }
  if (term === "Diverged") {
    return tracking && tracking.kind !== "no-upstream"
      ? tracking.kind === "diverged"
        ? tFn("glossary.live.diverged", { ahead: tracking.ahead, behind: tracking.behind })
        : tFn("glossary.live.divergedFallback", { kind: tracking.kind })
      : null;
  }
  return null;
}
