import { TERMS, SCENARIOS, getMatchingScenarios, getLiveTermExample } from "./glossary-view.mjs";
import { GUIDES } from "./git-guide.mjs";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shell(title, body, script = "") {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:14px}
main{max-width:1080px;margin:0 auto;padding:22px 24px 56px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
h1,h2,h3,p{margin:0}h1{font-size:20px}.sub{margin-top:5px;color:var(--vscode-descriptionForeground);font-size:13px;line-height:1.5}
.toolbar{display:flex;gap:7px;flex-wrap:wrap}.btn{border:1px solid var(--vscode-button-border,var(--vscode-panel-border));border-radius:6px;padding:7px 10px;color:var(--vscode-foreground);background:var(--vscode-list-inactiveSelectionBackground);cursor:pointer;font:inherit;font-size:13px}.btn:hover{background:var(--vscode-list-hoverBackground)}.btn.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.btn.primary:hover{background:var(--vscode-button-hoverBackground)}.btn.danger{color:var(--vscode-errorForeground)}.btn:active{transform:scale(.98)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{border:1px solid color-mix(in srgb,var(--vscode-panel-border) 82%,transparent);border-radius:8px;padding:14px;background:color-mix(in srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background)) 72%,transparent);transition:background 130ms ease,border-color 130ms ease,transform 130ms ease}.card:hover{background:color-mix(in srgb,var(--vscode-list-hoverBackground) 55%,var(--vscode-editor-background))}.card.selected{border-color:var(--vscode-focusBorder);background:color-mix(in srgb,var(--vscode-focusBorder) 9%,var(--vscode-editor-background));transform:translateY(-1px)}.card h2,.card h3{font-size:15px}.meta{margin-top:5px;color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.45}.row{display:flex;align-items:center;gap:9px}.row .grow{min-width:0;flex:1}.badge{display:inline-block;border:1px solid var(--vscode-panel-border);border-radius:999px;padding:2px 7px;font-size:11px;color:var(--vscode-descriptionForeground)}.badge.warn{color:var(--vscode-editorWarning-foreground)}.badge.danger{color:var(--vscode-errorForeground)}
.list{display:grid;gap:7px}.file{display:flex;align-items:center;gap:9px;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 68%,transparent);padding:9px 2px}.file:last-child{border-bottom:0}.compact-list{gap:0;max-height:52vh;overflow:auto}.compact-file{min-height:28px;padding:3px 2px;gap:7px}.compact-file .badge{min-width:34px;text-align:center;font-size:10px}.badge.new{color:var(--vscode-gitDecoration-untrackedResourceForeground,var(--vscode-gitDecoration-addedResourceForeground))}.compact-action{padding:4px 7px;font-size:11px}.commit-file{width:100%;border-left:0;border-right:0;border-top:0;color:inherit;background:transparent;text-align:left;cursor:pointer;font:inherit}.commit-file:hover{background:var(--vscode-list-hoverBackground)}.path{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actions{display:flex;gap:4px}.icon{width:26px;height:26px;padding:0;display:grid;place-items:center}
.section{margin-top:16px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.section-title h2{font-size:15px}.empty{padding:22px;border:1px dashed var(--vscode-panel-border);border-radius:8px;text-align:center;color:var(--vscode-descriptionForeground)}
.input{width:100%;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;padding:9px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font:inherit;font-size:14px;outline:none}.input:focus{border-color:var(--vscode-focusBorder)}
.tabs{display:inline-flex;border:1px solid var(--vscode-panel-border);border-radius:7px;padding:2px;background:var(--vscode-list-inactiveSelectionBackground)}.tab{border:0;border-radius:5px;padding:6px 10px;background:transparent;color:var(--vscode-foreground);cursor:pointer;font:inherit;user-select:none}.tab-radio{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}.knowledge-grid{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#knowledge-tab-terms:checked~header .tab[for="knowledge-tab-terms"],#knowledge-tab-guides:checked~header .tab[for="knowledge-tab-guides"]{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}#knowledge-tab-terms:checked~#terms{display:grid}#knowledge-tab-guides:checked~#guides{display:grid}
.term,.guide-card{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px;background:color-mix(in srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background)) 72%,transparent);transition:transform 140ms ease,border-color 140ms ease,background 140ms ease;animation:knowledgeCardIn 220ms ease-out both}
.term:nth-child(2),.guide-card:nth-child(2){animation-delay:35ms}.term:nth-child(3),.guide-card:nth-child(3){animation-delay:70ms}.term:nth-child(4),.guide-card:nth-child(4){animation-delay:105ms}.term:nth-child(5),.guide-card:nth-child(5){animation-delay:140ms}.term:nth-child(6),.guide-card:nth-child(6){animation-delay:175ms}
.term:hover,.guide-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--vscode-focusBorder) 70%,var(--vscode-panel-border));background:color-mix(in srgb,var(--vscode-list-hoverBackground) 58%,var(--vscode-editor-background))}
.term-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.term-ko{color:var(--vscode-descriptionForeground);font-size:13px}.term h2,.live-example{margin-top:7px;padding:7px 8px;border-radius:6px;background:color-mix(in srgb,var(--vscode-textLink-foreground) 8%,transparent);font-size:11px;line-height:1.4}.live-example span{display:block;margin-bottom:2px;color:var(--vscode-textLink-foreground);font-size:10px;font-weight:700}.scenario-heading{grid-column:1/-1}.scenario-match{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:10px;background:var(--vscode-testing-iconPassed);color:var(--vscode-editor-background);font-size:10px;vertical-align:middle}.scenario-card.matches-state{border-color:var(--vscode-testing-iconPassed)}.guide-card h2{font-size:15px}.term-kind{flex:none;padding:3px 8px;border:1px solid var(--vscode-panel-border);border-radius:999px;color:var(--vscode-descriptionForeground);font-size:12px}.summary{margin-top:9px;font-size:15px;line-height:1.55;font-weight:650}
.flow{display:grid;grid-template-columns:minmax(84px,auto) minmax(70px,1fr) minmax(84px,auto);align-items:center;gap:8px;margin-top:13px}.flow-node{display:flex;align-items:center;gap:6px;min-width:0;padding:6px 8px;border:1px solid transparent;border-radius:6px;font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.flow-icon{display:inline-grid;place-items:center;flex:none;width:20px;height:20px;border-radius:5px}.flow-icon svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
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
.effect{margin-top:11px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 70%,transparent);color:var(--vscode-descriptionForeground);font-size:13px;line-height:1.55}.example{margin-top:7px;font-size:13px;line-height:1.55}.example span{margin-right:7px;color:var(--vscode-textLink-foreground);font-weight:700}
.guide-card p{margin-top:6px;color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.55}.guide-visual{position:relative;height:52px;margin-top:11px;border:1px solid color-mix(in srgb,var(--vscode-panel-border) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--vscode-editor-background) 86%,transparent);overflow:hidden}.guide-line{position:absolute;left:16%;right:16%;top:50%;height:1px;background:color-mix(in srgb,var(--vscode-descriptionForeground) 45%,transparent)}.guide-path{display:none;position:absolute;inset:0;width:100%;height:100%;overflow:visible}.guide-path path{display:none;fill:none;stroke:color-mix(in srgb,var(--vscode-descriptionForeground) 52%,transparent);stroke-width:1.4;vector-effect:non-scaling-stroke;stroke-linecap:round}.guide-path .local{stroke:var(--vscode-textLink-foreground)}.guide-path .remote{stroke:var(--vscode-charts-blue,var(--vscode-textLink-foreground))}.guide-path .stash{stroke:var(--vscode-charts-purple,var(--vscode-textLink-foreground));stroke-dasharray:3 3}.guide-visual.split .split-path,.guide-visual.stash .stash-path,.guide-visual.detached .detached-path{display:block}.guide-node,.guide-token,.guide-warning{position:absolute;top:50%;transform:translate(-50%,-50%);z-index:2}.guide-node{width:10px;height:10px;border:2px solid currentColor;border-radius:50%;background:var(--vscode-editor-background)}.guide-node.a{left:16%;color:var(--vscode-textLink-foreground)}.guide-node.b{left:84%;color:var(--vscode-charts-blue,var(--vscode-textLink-foreground))}.guide-token{left:16%;width:13px;height:13px;border-radius:4px;background:var(--vscode-textLink-foreground);opacity:.9;box-shadow:0 0 0 2px color-mix(in srgb,var(--vscode-textLink-foreground) 14%,transparent)}.guide-token.b{display:none;background:var(--vscode-charts-blue,var(--vscode-textLink-foreground));box-shadow:0 0 0 2px color-mix(in srgb,var(--vscode-charts-blue,var(--vscode-textLink-foreground)) 14%,transparent)}.guide-warning{left:50%;color:var(--vscode-editorWarning-foreground);font-weight:800;font-size:15px;opacity:0}.guide-visual.incoming .guide-token.a{animation:guideIncoming 2.2s ease-in-out infinite}.guide-visual.push .guide-token.a{animation:guidePushReject 2.15s ease-in-out infinite}.guide-visual.push .guide-warning{animation:guideWarn 2.15s ease-in-out infinite}.guide-visual.conflict .guide-token.a{animation:guideConflictA 2s ease-in-out infinite}.guide-visual.conflict .guide-token.b{display:block;animation:guideConflictB 2s ease-in-out infinite}.guide-visual.conflict .guide-warning{animation:guideConflictWarn 2s ease-in-out infinite}.guide-visual.split .guide-line{display:none}.guide-visual.split .guide-path{display:block}.guide-visual.split .guide-node.a{left:84%;top:26%}.guide-visual.split .guide-node.b{top:74%}.guide-visual.split .guide-token.a{left:48%;animation:guideSplitA 2.35s ease-in-out infinite}.guide-visual.split .guide-token.b{display:block;left:48%;animation:guideSplitB 2.35s ease-in-out infinite}.guide-visual.detached .guide-path,.guide-visual.stash .guide-path{display:block}.guide-visual.detached .guide-line,.guide-visual.stash .guide-line{display:none}.guide-visual.detached .guide-token.a{animation:guideDetach 2.35s ease-in-out infinite}.guide-visual.stash .guide-token.a{animation:guideStash 2.3s ease-in-out infinite}.guide-visual.stage .guide-token.a{animation:guideStage 2.1s ease-in-out infinite}.guide-visual.branch .guide-token.a{animation:guideBranch 2.2s ease-in-out infinite}.guide-visual.blocked .guide-token.a{animation:guideBlocked 2.15s ease-in-out infinite}.guide-visual.blocked .guide-warning{animation:guideBlockedWarn 2.15s ease-in-out infinite}.guide-visual.recovery .guide-token.a{left:78%;animation:guideRecovery 2.2s ease-in-out infinite}.guide-visual.operation .guide-token.a{animation:guideOperation 2.2s ease-in-out infinite}.guide-visual.operation .guide-warning{animation:guideOperationWarn 2.2s ease-in-out infinite}.guide-visual.rewrite .guide-token.a{animation:guideRewrite 2.25s ease-in-out infinite}.guide-visual.rewrite .guide-node.b{animation:guideRemotePulse 2.25s ease-in-out infinite}.guide-visual.remote-gone .guide-token.a{animation:guideBranch 2.2s ease-in-out infinite}.guide-visual.remote-gone .guide-node.b{animation:guideRemoteGone 2.2s ease-in-out infinite}.guide-example{margin-top:10px;padding:9px 10px;border-left:3px solid var(--vscode-textLink-foreground);border-radius:5px;background:color-mix(in srgb,var(--vscode-textLink-foreground) 7%,transparent);font-size:12px;line-height:1.55}.guide-example strong{display:block;margin-bottom:3px;color:var(--vscode-foreground);font-size:11px}.guide-steps-title{margin-top:11px;font-size:11px;font-weight:700;color:var(--vscode-foreground)}.guide-card ol{margin:6px 0 0;padding-left:19px}.guide-card li{margin:6px 0;font-size:12px;line-height:1.5}.avoid{margin-top:10px;padding-top:8px;border-top:1px solid var(--vscode-panel-border);font-size:11px;color:var(--vscode-editorWarning-foreground)}
.guide-card:target{border-color:var(--vscode-focusBorder);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-focusBorder) 24%,transparent)}
@keyframes knowledgeCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes guideIncoming{0%,14%{left:84%;opacity:.25}72%,88%{left:16%;opacity:1}100%{left:16%;opacity:.25}}@keyframes guidePushReject{0%,16%{left:16%;opacity:.9}58%{left:72%;opacity:1}72%{left:61%;opacity:1}88%,100%{left:61%;opacity:.25}}@keyframes guideWarn{0%,46%{opacity:0;transform:translate(-50%,-50%) scale(.6)}58%,76%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:0}}@keyframes guideConflictA{0%,18%{left:16%}55%,72%{left:46%}100%{left:40%}}@keyframes guideConflictB{0%,18%{left:84%}55%,72%{left:54%}100%{left:60%}}@keyframes guideConflictWarn{0%,42%{opacity:0}55%,80%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}100%{opacity:0}}@keyframes guideSplitA{0%,18%{left:48%;top:50%;opacity:.3}68%,88%{left:82%;top:26%;opacity:1}100%{left:82%;top:26%;opacity:.25}}@keyframes guideSplitB{0%,18%{left:48%;top:50%;opacity:.3}68%,88%{left:82%;top:74%;opacity:1}100%{left:82%;top:74%;opacity:.25}}@keyframes guideDetach{0%,24%{left:78%;top:50%}68%,88%{left:52%;top:20%}100%{left:52%;top:20%;opacity:.3}}@keyframes guideStash{0%,18%{left:20%;top:50%}62%,84%{left:70%;top:22%}100%{left:70%;top:22%;opacity:.3}}@keyframes guideStage{0%,16%{left:18%;opacity:.35}66%,88%{left:50%;opacity:1}100%{left:50%;opacity:.3}}@keyframes guideBranch{0%,18%{left:22%;top:50%}68%,88%{left:78%;top:50%}100%{left:78%;top:50%;opacity:.3}}@keyframes guideBlocked{0%,18%{left:22%;top:50%;opacity:.9}54%{left:58%;top:50%;opacity:1}68%{left:50%;top:50%;opacity:1}86%,100%{left:50%;top:50%;opacity:.3}}@keyframes guideBlockedWarn{0%,44%{opacity:0}54%,78%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:0}}@keyframes guideRecovery{0%,16%{left:78%;opacity:1}70%,88%{left:26%;opacity:1}100%{left:26%;opacity:.3}}@keyframes guideOperation{0%,18%{left:20%}42%{left:44%}58%,78%{left:50%}100%{left:50%;opacity:.3}}@keyframes guideOperationWarn{0%,45%{opacity:0}58%,82%{opacity:1}100%{opacity:0}}@keyframes guideRewrite{0%,16%{left:18%;opacity:.4}58%,76%{left:82%;opacity:1}84%{left:70%;opacity:.5}100%{left:82%;opacity:.25}}@keyframes guideRemotePulse{0%,42%,100%{transform:translate(-50%,-50%) scale(1);opacity:1}62%{transform:translate(-50%,-50%) scale(1.45);opacity:.35}}@keyframes guideRemoteGone{0%,42%{opacity:1;transform:translate(-50%,-50%) scale(1)}72%,100%{opacity:.08;transform:translate(-50%,-50%) scale(.45)}}@keyframes semCommit{0%,12%{left:4%;opacity:.2}55%,78%{left:78%;opacity:1;transform:translate(-50%,-50%) scale(1)}100%{left:78%;opacity:.2;transform:translate(-50%,-50%) scale(.72)}}
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
@media (prefers-reduced-motion:reduce){.flow-actor,.flow-peer,.flow-copy,.semantic-mark,.guide-token,.guide-warning{animation:none!important}.flow-actor{left:42%;top:50%;opacity:.9}.flow-peer{left:62%;top:50%;opacity:.8}.semantic-conflict .flow-actor{left:43%}.semantic-conflict .flow-peer{left:57%;opacity:1}.semantic-conflict .semantic-mark{opacity:1}.semantic-diverged .flow-actor{left:38%;top:30%}.semantic-diverged .flow-peer{left:62%;top:70%;opacity:1}.semantic-branch .branch-lines{display:block}.guide-token{left:50%;top:50%;opacity:.9}.guide-warning{opacity:.8}.term,.guide-card{animation:none;transition:none}.term:hover,.term:focus-within,.guide-card:hover{transform:none}}
@media(max-width:720px){main{padding:16px 14px 40px}.grid,.knowledge-grid{grid-template-columns:1fr}.flow{grid-template-columns:minmax(74px,auto) minmax(52px,1fr) minmax(74px,auto)}}
</style>
</head>
<body><main>${body}</main><script>${script}</script></body></html>`;
}

export function renderChangesWorkspace(data, notice = null) {
  const renderFile = (file, area) => {
    const statusLabel = file.status === "??" ? "신규" : file.status || "수정";
    return `<div class="file compact-file">
      <span class="badge ${file.status === "??" ? "new" : ""}">${esc(statusLabel)}</span>
      <span class="path" title="${esc(file.path)}">${esc(file.path)}</span>
      <div class="actions">
        ${area === "staged"
          ? `<button class="btn icon" data-action="unstage" data-path="${esc(file.path)}" title="Staging에서 빼기">−</button>`
          : `<button class="btn icon" data-action="stage" data-path="${esc(file.path)}" title="Staging에 넣기">+</button>`}
        <button class="btn compact-action" data-action="compare-file" data-path="${esc(file.path)}">비교</button>
        <button class="btn danger compact-action" data-action="discard" data-path="${esc(file.path)}" data-untracked="${file.untracked ? "1" : "0"}">되돌리기</button>
      </div>
    </div>`;
  };
  const staged = data.staged.map((f) => renderFile(f, "staged")).join("");
  const unstaged = data.unstaged.map((f) => renderFile(f, "unstaged")).join("");
  const body = `
<header><div><h1>변경사항 · Commit</h1><div class="sub">Commit에 넣을 파일을 + / −로 직접 고르고, 실행 전 최종 내용을 확인합니다.</div></div><div class="toolbar"><button class="btn" data-action="refresh">새로고침</button><button class="btn" data-action="compare-remote">Local ↔ Remote</button></div></header>
${notice ? `<div class="card"><strong>${esc(notice.message)}</strong>${notice.detail ? `<div class="meta">${esc(notice.detail)}</div>` : ""}</div>` : ""}
<section class="section"><div class="section-title"><h2>Staged · Commit에 포함</h2><div class="toolbar"><span class="badge">${data.staged.length}</span>${data.staged.length ? '<button class="btn compact-action" data-action="unstage-all">전체 −</button>' : ""}</div></div><div class="card list compact-list">${staged || '<div class="empty">아직 Staging된 파일이 없습니다.</div>'}</div></section>
<section class="section"><div class="section-title"><h2>변경사항 · 아직 미포함</h2><div class="toolbar"><span class="badge">${data.unstaged.length}</span>${data.unstaged.length ? '<button class="btn compact-action" data-action="stage-all">전체 +</button>' : ""}</div></div><div class="card list compact-list">${unstaged || '<div class="empty">추가로 선택할 변경사항이 없습니다.</div>'}</div></section>
<section class="section"><div class="section-title"><h2>Commit</h2><span class="badge">Local only</span></div><div class="card"><input class="input" id="message" placeholder="Commit message 입력" /><div class="toolbar" style="margin-top:10px"><button class="btn primary" data-action="commit">Commit 만들기</button><button class="btn" data-action="undo-commit">마지막 로컬 Commit 취소</button></div><div class="meta">Commit은 현재 Staged 파일만 포함합니다. Push는 별도 작업입니다.</div></div></section>`;
  const script = `
const vscode=acquireVsCodeApi();
for(const btn of document.querySelectorAll("[data-action]")){
 btn.addEventListener("click",()=>vscode.postMessage({type:btn.dataset.action,path:btn.dataset.path,untracked:btn.dataset.untracked==="1",message:document.querySelector("#message")?.value??""}));
}`;
  return shell("Git Next · 변경사항", body, script);
}

export function renderCompareWorkspace(comparison) {
  if (!comparison.ok) return shell("Git Next · Compare", `<header><div><h1>Local ↔ Remote</h1><div class="sub">${esc(comparison.message)}</div></div></header><div class="empty">${esc(comparison.detail || "")}</div>`);
  const groups = [
    ["both","양쪽에서 변경","warn"],
    ["local","로컬에서만 변경",""],
    ["remote","Remote에서만 변경",""],
  ];
  const bodyRows = groups.map(([scope,title,tone])=>{
    const rows = comparison.files.filter((f)=>f.scope===scope).map((f)=>`<div class="file"><span class="badge ${tone}">${scope==="both"?"양쪽":"변경"}</span><span class="path">${esc(f.path)}</span><span class="meta">${esc(f.localStatus||"-")} / ${esc(f.remoteStatus||"-")}</span><button class="btn" data-action="open-diff" data-path="${esc(f.path)}">Diff</button></div>`).join("");
    return `<section class="section"><div class="section-title"><h2>${title}</h2><span class="badge">${comparison.files.filter((f)=>f.scope===scope).length}</span></div><div class="card list">${rows||'<div class="empty">없음</div>'}</div></section>`;
  }).join("");
  const body=`<header><div><h1>Local ↔ Remote Compare</h1><div class="sub">최신 ${esc(comparison.upstream)}과 현재 로컬 상태를 읽기 전용으로 비교합니다.</div></div><button class="btn" data-action="refresh">Remote 새로고침</button></header>${bodyRows}`;
  const script=`const vscode=acquireVsCodeApi();for(const b of document.querySelectorAll("[data-action]"))b.addEventListener("click",()=>vscode.postMessage({type:b.dataset.action,path:b.dataset.path}));`;
  return shell("Git Next · Compare",body,script);
}

export function renderBranchWorkspace(state) {
  const refs = state.refs.filter((ref)=>ref.kind==="local"||ref.kind==="remote");
  const cards = refs.map((ref)=>`<button class="card branch-card ${ref.name===state.branch?"current":""}" data-branch="${esc(ref.name)}" data-kind="${esc(ref.kind)}" style="text-align:left;color:inherit;cursor:pointer">
    <div class="row"><div class="grow"><h2>${esc(ref.name)}</h2><div class="meta">${ref.name===state.branch?"현재 브랜치":ref.kind==="remote"?"Remote branch":"Local branch"}</div></div>${ref.name===state.branch?'<span class="badge">현재</span>':""}</div>
  </button>`).join("");
  const body=`<header><div><h1>Branch</h1><div class="sub">브랜치를 고르면 비교하거나 안전하게 전환할 수 있습니다.</div></div><button class="btn" data-action="create">새 브랜치</button></header><div class="grid">${cards||'<div class="empty">브랜치가 없습니다.</div>'}</div><section class="section card" id="selection"><h2>브랜치를 선택하세요</h2><div class="meta">선택은 실행이 아닙니다. 실제 변경 전에는 항상 Confirm을 받습니다.</div><div class="toolbar" style="margin-top:10px"><button class="btn" data-action="compare" disabled>비교</button><button class="btn primary" data-action="switch" disabled>전환</button><button class="btn" data-action="rename" disabled>이름 변경</button><button class="btn danger" data-action="delete" disabled>삭제</button></div></section>`;
  const script=`
const vscode=acquireVsCodeApi();let selected=null;let kind=null;
const buttons=[...document.querySelectorAll("#selection [data-action]")];
for(const card of document.querySelectorAll(".branch-card"))card.addEventListener("click",()=>{for(const c of document.querySelectorAll(".branch-card"))c.classList.remove("selected");card.classList.add("selected");selected=card.dataset.branch;kind=card.dataset.kind;document.querySelector("#selection h2").textContent=selected;for(const b of buttons)b.disabled=false;if(kind==="remote"){document.querySelector('[data-action="rename"]').disabled=true;document.querySelector('[data-action="delete"]').disabled=true;}});
for(const b of document.querySelectorAll("[data-action]"))b.addEventListener("click",(e)=>{e.stopPropagation();vscode.postMessage({type:b.dataset.action,branch:selected,kind});});
`;
  return shell("Git Next · Branch",body,script);
}

export function renderStashWorkspace(stashes, selectedDetails = null) {
  const cards=stashes.map((s)=>`<button class="card stash-card ${selectedDetails?.ref===s.ref?"selected":""}" data-ref="${esc(s.ref)}" style="text-align:left;color:inherit;cursor:pointer"><div class="row"><div class="grow"><h2>${esc(s.ref)}</h2><div class="meta">${esc(s.message)}${s.relative ? ` · ${esc(s.relative)}` : ""}</div></div></div></button>`).join("");
  const overlap=selectedDetails?.overlap?.length?`<div class="notice warning">현재 변경과 겹치는 파일 ${selectedDetails.overlap.length}개: ${selectedDetails.overlap.map(esc).join(", ")}<br>파일 단위 겹침이며 실제 충돌이 확정된 것은 아닙니다.</div>`:`<div class="notice">현재 변경과 파일 경로가 겹치지 않습니다. Apply/Pop 전 확인창에서 다시 확인합니다.</div>`;
  const detail=selectedDetails?`<section class="section card"><h2>${esc(selectedDetails.ref)}</h2><div class="meta">${esc(selectedDetails.stat||"")}</div>${overlap}<div class="list" style="margin-top:10px">${selectedDetails.files.map((f)=>`<div class="file"><span class="badge">${esc(f.status)}</span><span class="path">${esc(f.path)}</span></div>`).join("")||'<div class="empty">표시할 파일이 없습니다.</div>'}</div><div class="toolbar" style="margin-top:10px"><button class="btn" data-action="apply" data-ref="${esc(selectedDetails.ref)}">Apply</button><button class="btn primary" data-action="pop" data-ref="${esc(selectedDetails.ref)}">Pop</button><button class="btn danger" data-action="drop" data-ref="${esc(selectedDetails.ref)}">Drop</button></div></section>`:"";
  const body=`<header><div><h1>Stash</h1><div class="sub">Stash 내용을 먼저 확인하고 Apply / Pop / Drop을 선택합니다.</div></div><button class="btn" data-action="push">현재 변경 Stash</button></header><div class="grid">${cards||'<div class="empty">저장된 Stash가 없습니다.</div>'}</div>${detail}`;
  const script=`const vscode=acquireVsCodeApi();for(const c of document.querySelectorAll(".stash-card"))c.addEventListener("click",()=>vscode.postMessage({type:"select",ref:c.dataset.ref}));for(const b of document.querySelectorAll("[data-action]"))b.addEventListener("click",()=>vscode.postMessage({type:b.dataset.action,ref:b.dataset.ref}));`;
  return shell("Git Next · Stash",body,script);
}

function knowledgeNodeKind(label) {
  const value = String(label).toLowerCase();
  if (/원격|origin/.test(value)) return "remote";
  if (/stash/.test(value)) return "stash";
  if (/branch|브랜치|main|feature/.test(value)) return "branch";
  if (/tag|v\d/.test(value)) return "tag";
  if (/commit|커밋|기록|head|현재|이전/.test(value)) return "commit";
  if (/작업|파일|변경/.test(value)) return "work";
  return "local";
}

function knowledgeNodeIcon(kind) {
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

function renderKnowledgeFlow(flow, tone, animation = "push") {
  const [from, to] = flow;
  const node = (label) => { const kind = knowledgeNodeKind(label); return `<span class="flow-node ${kind}"><span class="flow-icon">${knowledgeNodeIcon(kind)}</span><span>${esc(label)}</span></span>`; };
  const fromKind = knowledgeNodeKind(from);
  const toKind = knowledgeNodeKind(to);
  return `<div class="flow ${esc(tone)} semantic-${esc(animation)}" aria-label="${esc(from)}와 ${esc(to)}의 Git 관계">
    ${node(from)}
    <span class="flow-track flow-stage" aria-hidden="true">
      <span class="flow-actor actor-a actor-${fromKind}">${knowledgeNodeIcon(fromKind)}</span>
      <span class="flow-peer actor-b actor-${toKind}">${knowledgeNodeIcon(toKind)}</span>
      <span class="flow-copy actor-copy">${knowledgeNodeIcon("commit")}</span>
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
    ${node(to)}
  </div>`;
}

export function renderCommitDetailsWorkspace(details) {
  const script = `const vscode=acquireVsCodeApi();for(const b of document.querySelectorAll("[data-action]"))b.addEventListener("click",()=>vscode.postMessage({type:b.dataset.action,path:b.dataset.path,oldPath:b.dataset.oldPath||null}));`;
  if (!details?.ok) {
    return shell("Git Next · Commit", `<header><div><h1>Commit 상세</h1><div class="sub">${esc(details?.message ?? "커밋 정보를 읽지 못했습니다.")}</div></div><div class="toolbar"><button class="btn" type="button" data-action="back-to-graph">← 그래프로 돌아가기</button></div></header><div class="empty">${esc(details?.detail ?? "")}</div>`, script);
  }

  const files = details.files.map((file) => `<button class="file commit-file" type="button" data-action="open-commit-diff" data-path="${esc(file.path)}" data-old-path="${esc(file.oldPath ?? "")}">
    <span class="badge">${esc(file.status)}</span>
    <span class="path" title="${esc(file.path)}">${esc(file.oldPath ? `${file.oldPath} → ${file.path}` : file.path)}</span>
    <span class="meta">Diff</span>
  </button>`).join("");

  const parents = details.parents.length
    ? details.parents.map((parent) => `<code>${esc(parent.slice(0, 10))}</code>`).join(" · ")
    : "Root commit";

  const body = `<header><div><h1>Commit 상세</h1><div class="sub">그래프에서 선택한 Commit이 실제로 바꾼 파일을 확인합니다.</div></div><div class="toolbar"><button class="btn" type="button" data-action="back-to-graph">← 그래프로 돌아가기</button></div></header>
  <section class="card">
    <h2>${esc(details.message.split("\n")[0] || "(메시지 없음)")}</h2>
    <div class="meta" style="margin-top:8px">${esc(details.id)} · ${esc(details.author)} &lt;${esc(details.email)}&gt;</div>
    <div class="meta">${esc(details.authoredAt)}</div>
    <div class="meta">Parent · ${parents}</div>
  </section>
  <section class="section">
    <div class="section-title"><h2>변경 파일</h2><span class="badge">${details.files.length}</span></div>
    <div class="card list">${files || '<div class="empty">변경 파일이 없습니다.</div>'}</div>
  </section>`;

  return shell("Git Next · Commit 상세", body, script);
}

function guideVisualKind(key) {
  if (/dirty-pull|fetch-vs-pull/.test(key)) return "incoming";
  if (/pull-conflict|merge-in-progress/.test(key)) return "conflict";
  if (/push-rejected/.test(key)) return "push";
  if (/diverged|merge-vs-rebase/.test(key)) return "split";
  if (/detached-head/.test(key)) return "detached";
  if (/stash-before-risk|stash-apply-vs-pop/.test(key)) return "stash";
  if (/switch-with-changes/.test(key)) return "blocked";
  if (/wrong-staged-file/.test(key)) return "stage";
  if (/operation-in-progress/.test(key)) return "operation";
  if (/undo-local-commit|pushed-recovery|reset-mistake/.test(key)) return "recovery";
  if (/remote-rewritten/.test(key)) return "rewrite";
  if (/remote-branch-gone/.test(key)) return "remote-gone";
  if (/no-upstream|worked-on-wrong-branch/.test(key)) return "branch";
  return "incoming";
}

function renderGuideVisual(key) {
  const kind = guideVisualKind(key);
  return `<div class="guide-visual ${kind}" aria-hidden="true">
    <span class="guide-line"></span>
    <svg class="guide-path" viewBox="0 0 100 52" preserveAspectRatio="none">
      <path class="split-path" d="M16 26 H48"></path>
      <path class="split-path local" d="M48 26 L84 13.5"></path>
      <path class="split-path remote" d="M48 26 L84 38.5"></path>
      <path class="stash-path stash" d="M20 26 L70 11.5"></path>
      <path class="detached-path local" d="M78 26 L52 10.5"></path>
    </svg>
    <span class="guide-node a"></span>
    <span class="guide-node b"></span>
    <span class="guide-token a"></span>
    <span class="guide-token b"></span>
    <span class="guide-warning">×</span>
  </div>`;
}

export function renderKnowledgeCenter({ tab = "terms", selected = null, state = null } = {}) {
  const termCards = TERMS.map((t) => `<article class="term knowledge ${esc(t.tone)}" data-search="${esc([t.term,t.ko,t.summary,t.effect,t.example,...t.flow].join(" ").toLowerCase())}">
    <div class="term-head">
      <div><div class="term-ko">${esc(t.ko)}</div><h2>${esc(t.term)}</h2></div>
      <span class="term-kind">${esc(t.tone === "remote" ? "원격" : t.tone === "danger" ? "주의" : t.tone === "warning" ? "확인" : "로컬")}</span>
    </div>
    <p class="summary">${esc(t.summary)}</p>
    ${renderKnowledgeFlow(t.flow, t.tone, t.animation)}
    <div class="effect">${esc(t.effect)}</div>
    <div class="example"><span>예시</span>${esc(t.example)}</div>
    ${getLiveTermExample(t.term, state) ? `<div class="live-example"><span>현재 저장소</span>${esc(getLiveTermExample(t.term, state))}</div>` : ""}
  </article>`).join("");

  const guideCards = Object.entries(GUIDES).map(([key, g]) => `<article class="guide-card knowledge" id="${esc(key)}" data-search="${esc([g.title,g.summary,g.example,...g.steps,g.avoid].join(" ").toLowerCase())}">
    <h2>${esc(g.title)}</h2>
    <p>${esc(g.summary)}</p>
    ${renderGuideVisual(key)}
    ${g.example ? `<div class="guide-example"><strong>이럴 때</strong>${esc(g.example)}</div>` : ""}
    <div class="guide-steps-title">이렇게 해보세요</div>
    <ol>${g.steps.map((s)=>`<li>${esc(s)}</li>`).join("")}</ol>
    <div class="avoid"><strong>피할 것</strong> ${esc(g.avoid)}</div>
  </article>`).join("");

  const matchedScenarios = getMatchingScenarios(state);
  const scenarioCards = SCENARIOS.map((scenario) => `<article class="guide-card knowledge scenario-card ${matchedScenarios.has(scenario.id) ? "matches-state" : ""}" id="scenario-${esc(scenario.id)}" data-search="${esc(Object.values(scenario).filter((value) => typeof value === "string").join(" ").toLowerCase())}">
    <h2>${esc(scenario.title)}${matchedScenarios.has(scenario.id) ? ` <span class="scenario-match">현재 저장소와 비슷해요</span>` : ""}</h2>
    <p><strong>상태</strong> ${esc(scenario.state)}</p>
    <p><strong>위험</strong> ${esc(scenario.risk)}</p>
    <p><strong>다음 행동</strong> ${esc(scenario.next)}</p>
  </article>`).join("");
  const activeTab = selected ? "guides" : tab;
  const body = `<input class="tab-radio" id="knowledge-tab-terms" name="knowledge-tab" type="radio" ${activeTab==="terms"?"checked":""} />
  <input class="tab-radio" id="knowledge-tab-guides" name="knowledge-tab" type="radio" ${activeTab==="guides"?"checked":""} />
  <header><div><h1>Git 도움말</h1><div class="sub">용어의 흐름과 실제 상황 해결법을 한곳에서 봅니다.</div></div><div class="tabs"><label class="tab" for="knowledge-tab-terms">용어</label><label class="tab" for="knowledge-tab-guides">상황별 가이드</label></div></header>
  <input id="q" class="input" type="search" placeholder="용어 또는 상황 검색" />
  <section id="terms" class="section knowledge-grid">${termCards}</section>
  <section id="guides" class="section knowledge-grid"><h2 class="scenario-heading">상황별 시나리오</h2>${scenarioCards}${guideCards}</section>`;

  const script = `const selected=${JSON.stringify(selected)};const q=document.querySelector("#q");function filter(){const s=q.value.trim().toLowerCase();for(const el of document.querySelectorAll(".knowledge"))el.hidden=Boolean(s)&&!el.dataset.search.includes(s);}q?.addEventListener("input",filter);if(selected){requestAnimationFrame(()=>document.getElementById(selected)?.scrollIntoView({block:"start"}));}`;
  return shell("Git Next · 도움말", body, script);
}
