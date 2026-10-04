export const GUIDES = {
  "dirty-pull": {
    title: "작업 중인데 Pull 해야 해요",
    summary: "내 로컬 변경과 원격 변경이 부딪힐 수 있어서 바로 Pull하지 않는 게 안전해요.",
    steps: [
      "지금 변경이 커밋 가능한 상태면 먼저 Commit해요.",
      "아직 Commit하기 애매하면 Stash로 잠깐 보관해요.",
      "그 다음 Pull해서 원격 변경을 받아요.",
      "Stash했다면 Apply/Pop으로 내 작업을 다시 가져와요.",
      "같은 파일의 같은 부분을 둘 다 바꿨다면 Conflict를 직접 정리해요.",
    ],
    avoid: "수정 파일이 많은 상태에서 무작정 Pull하거나 변경을 버리지 마세요.",
  },
  "pull-conflict": {
    title: "Pull하면 충돌할 가능성이 높아요",
    summary: "내 변경과 원격 변경이 같은 파일의 같은 부분을 건드린 것 같아요.",
    steps: [
      "충돌 예상 파일 목록을 먼저 확인해요.",
      "내 변경을 Commit 또는 Stash로 안전하게 보관해요.",
      "Pull/Merge 후 충돌 편집기에서 내 변경과 서버 변경을 비교해요.",
      "원하는 결과를 남기고 Conflict 표시를 제거한 뒤 Commit해요.",
    ],
    avoid: "어느 쪽이 맞는지 확인하지 않고 'Accept All'을 누르지 마세요.",
  },
  "push-rejected": {
    title: "Push가 거절됐어요",
    summary: "원격에 내가 아직 받지 않은 커밋이 있어서 내 기록을 바로 올릴 수 없어요.",
    steps: [
      "원격 변경을 Fetch/Pull로 먼저 확인해요.",
      "작업 중 변경이 있다면 Commit 또는 Stash로 보관해요.",
      "로컬과 원격 차이를 정리한 뒤 다시 Push해요.",
    ],
    avoid: "이유를 모른 채 Force Push로 덮어쓰지 마세요.",
  },
  diverged: {
    title: "로컬과 원격 기록이 갈라졌어요",
    summary: "내 쪽에도 새 커밋이 있고 원격에도 다른 새 커밋이 있어요.",
    steps: [
      "그래프에서 내 커밋과 원격 커밋을 먼저 확인해요.",
      "Merge 또는 Rebase 중 어떤 방식으로 정리할지 선택해요.",
      "충돌이 있다면 직접 정리한 뒤 Push해요.",
    ],
    avoid: "갈라진 이유를 확인하기 전 Force Push는 피하세요.",
  },
  "no-upstream": {
    title: "이 브랜치는 원격과 연결되지 않았어요",
    summary: "Push/Pull할 상대 원격 브랜치가 아직 정해지지 않았어요.",
    steps: [
      "연결할 원격 브랜치를 정해요.",
      "처음 Push할 때 upstream을 설정해요.",
      "이후부터 Pull/Push 기준이 그 원격 브랜치가 돼요.",
    ],
    avoid: "어느 원격으로 보낼지 확인하지 않고 새 브랜치를 만들지 마세요.",
  },
  "remote-rewritten": {
    title: "원격 기록이 다시 쓰인 것 같아요",
    summary: "누군가 Rebase 또는 Force Push로 원격 커밋 흐름을 바꿨을 수 있어요.",
    steps: [
      "바로 Push하지 말고 그래프에서 이전 원격과 현재 원격 차이를 확인해요.",
      "내 로컬 커밋이 어디에서 갈라졌는지 확인해요.",
      "필요하면 새 기준에 Rebase하거나 안전하게 Merge해요.",
    ],
    avoid: "기존 원격 기록을 확인하지 않고 다시 Force Push하지 마세요.",
  },
  "merge-in-progress": {
    title: "Merge가 아직 끝나지 않았어요",
    summary: "Git이 파일을 합치다가 멈춘 상태예요. 먼저 충돌을 끝내거나 Merge를 취소해야 해요.",
    steps: [
      "충돌 파일을 열어요.",
      "내 변경과 서버에서 들어온 변경을 비교해요.",
      "원하는 최종 내용을 남겨요.",
      "모든 충돌을 정리한 뒤 Merge를 계속하거나, 원치 않으면 Abort해요.",
    ],
    avoid: "충돌 중인 상태에서 다른 Pull/Push를 이어서 실행하지 마세요.",
  },
  "detached-head": {
    title: "Detached HEAD 상태예요",
    summary: "브랜치가 아니라 특정 커밋을 직접 보고 있어서 새 작업이 정상 브랜치 흐름에서 떨어질 수 있어요.",
    steps: ["유지할 변경이 있는지 확인해요.", "필요하면 현재 위치에서 새 브랜치를 만들어요.", "원래 작업할 브랜치로 이동한 뒤 Pull/Push를 다시 시도해요."],
    avoid: "Detached HEAD에서 중요한 작업을 계속 쌓은 뒤 위치를 바꾸지 마세요.",
  },
  "operation-in-progress": {
    title: "이전 Git 작업이 아직 진행 중이에요",
    summary: "Merge, Rebase, Cherry-pick, Revert 중 하나가 끝나지 않은 상태일 수 있어요.",
    steps: ["현재 진행 중인 작업 종류를 확인해요.", "충돌이 있다면 먼저 해결해요.", "Continue 또는 Abort로 작업을 끝낸 뒤 다음 Git 작업을 시작해요."],
    avoid: "진행 중인 작업 위에 Pull/Push나 다른 이력 변경 작업을 겹치지 마세요.",
  },
  "undo-local-commit": {
    title: "방금 만든 로컬 Commit을 취소하고 싶어요",
    summary: "아직 Push하지 않았다면 Commit만 취소하고 파일 변경은 그대로 남길 수 있어요.",
    steps: ["마지막 Commit이 Remote에 올라가지 않았는지 확인해요.", "Commit 취소를 실행해요.", "변경은 Staged 상태로 남으므로 다시 정리해 Commit해요."],
    avoid: "이미 Push한 Commit에 Reset을 사용하지 마세요. 공유 기록은 Revert가 더 안전해요.",
  },
  "pushed-recovery": {
    title: "이미 Push한 Commit을 되돌리고 싶어요",
    summary: "공유된 기록을 지우지 않고 반대 변경의 새 Commit을 만드는 Revert가 안전해요.",
    steps: ["되돌릴 Commit을 확인해요.", "Revert가 만드는 반대 변경을 확인해요.", "새 Revert Commit을 Push해 공유해요."],
    avoid: "팀이 쓰는 브랜치에서 이유 없이 Force Push로 기록을 지우지 마세요.",
  },
  "stash-before-risk": {
    title: "작업 중 변경을 잠깐 치워두고 싶어요",
    summary: "Commit하기 애매한 변경은 Stash로 보관한 뒤 브랜치 전환이나 Pull을 할 수 있어요.",
    steps: ["현재 변경 파일을 확인해요.", "Stash에 메모와 함께 저장해요.", "필요한 Git 작업을 한 뒤 Apply 또는 Pop으로 복원해요."],
    avoid: "Stash 내용을 확인하지 않고 Drop하지 마세요.",
  },
  "fetch-vs-pull": {
    title: "Fetch와 Pull 중 뭘 써야 하나요?",
    summary: "Fetch는 Remote 정보만 갱신하고, Pull은 그 변경을 현재 브랜치에 실제 반영해요.",
    steps: ["먼저 상태만 보고 싶으면 Fetch를 사용해요.", "Compare에서 들어올 변경을 확인해요.", "실제로 반영해도 안전할 때 Pull해요."],
    avoid: "무슨 변경이 들어오는지 모른 채 바로 Pull할 필요는 없어요.",
  },
  "merge-vs-rebase": {
    title: "Merge와 Rebase 중 어떤 걸 써야 하나요?",
    summary: "Merge는 흐름을 합친 기록을 남기고, Rebase는 내 Commit의 기준을 새로 만들어 기록을 정리해요.",
    steps: ["공유 브랜치인지 먼저 확인해요.", "기록 보존이 중요하면 Merge를 우선 고려해요.", "내 로컬 작업 정리가 목적이고 공유 전이라면 Rebase를 고려해요."],
    avoid: "이미 여러 사람이 공유한 Commit을 이유 없이 Rebase하지 마세요.",
  },
};

export function classifyGuide({ action, code, detail = "", message = "" } = {}) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkerGuide() {
  return `<section class="marker-card" id="merge-conflict">
    <div class="eyebrow">Merge Conflict</div>
    <h2>HEAD가 뭐고 서버 게 뭔지 헷갈릴 때</h2>
    <p><code>HEAD</code>는 서버 이름이 아니라 <strong>지금 내가 체크아웃한 현재 브랜치 쪽</strong>이에요.</p>
    <div class="marker-grid">
      <div class="marker local"><span>내 변경</span><code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code><pre>내가 수정한 내용</pre></div>
      <div class="marker sep"><span>경계</span><code>=======</code><pre>위/아래 두 변경을 나누는 선</pre></div>
      <div class="marker incoming"><span>서버에서 들어온 변경</span><code>&gt;&gt;&gt;&gt;&gt;&gt;&gt; origin/main</code><pre>Pull/Merge로 들어온 내용</pre></div>
    </div>
    <div class="choice-grid">
      <div><strong>내 변경 사용</strong><span>내가 작업한 내용을 남겨요.</span></div>
      <div><strong>서버 변경 사용</strong><span>원격에서 들어온 내용을 남겨요.</span></div>
      <div><strong>둘 다 사용</strong><span>둘 다 필요하면 합친 뒤 직접 정리해요.</span></div>
      <div><strong>직접 편집</strong><span>최종 결과를 원하는 형태로 손봐요.</span></div>
    </div>
  </section>`;
}

export function renderGuideHtml(selected = null) {
  const entries = Object.entries(GUIDES);
  const cards = entries.map(([key, guide]) => `
    <article class="guide-card" id="${escapeHtml(key)}">
      <h2>${escapeHtml(guide.title)}</h2>
      <p>${escapeHtml(guide.summary)}</p>
      <ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      <div class="avoid"><strong>피할 것</strong> ${escapeHtml(guide.avoid)}</div>
    </article>`
  ).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Git Next · 상황별 가이드</title>
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
@media(prefers-reduced-motion:reduce){.guide-card,.marker-card{animation:none;transition:none}.guide-card:hover,.marker-card:hover,.choice-grid>div:hover{transform:none}}
@media(max-width:720px){main{padding:16px 14px 40px}.grid,.choice-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header><h1>상황별 Git 가이드</h1><div class="intro">에러 문구 대신 “지금 무슨 상황이고 뭘 하면 되는지” 기준으로 설명해요.</div></header>
<section class="grid">${cards}</section>
${renderMarkerGuide()}
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
