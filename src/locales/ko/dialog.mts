export const dialog = {
  confirmMutation: {
    actionLabel: "작업: {action}",
    targetLabel: "대상: {target}",
    effectLabel: "변경: {effect}",
    riskLabel: "주의: {risk}",
    worktreeContext: "다른 작업 폴더 {count}개: {details}",
    safeguardLabel: "Safe Guard: {status}",
    safe: "확인됨",
    warning: "주의",
    blocked: "차단",
    defaultConfirmLabel: "실행",
    detachedHead: "분리된 HEAD",
  },
  safeguard: {
    relaxPrompt: "{title}을(를) Git Next를 닫을 때까지 완화할까요?\n목적: {purpose}\n위험: {risk}",
    relaxConfirmLabel: "세션 동안 완화",
    cannotRelax: "{title}은(는) 중요한 보호 규칙이라 완화할 수 없습니다. {risk}",
    dirtyIncomingOverlapWarning: "완화한 검사: 로컬 변경 파일과 Pull 대상 파일이 겹칩니다. Pull 중 Conflict가 생기거나 작업이 멈출 수 있습니다.",
    continuePullButton: "이번 Pull 계속",
    dirtyIncomingOverlapBlocked: "Pull을 실행하지 않았습니다.\n\n로컬에서 수정한 파일과 원격에서 받아올 파일이 겹칩니다. 그대로 Pull하면 작업이 중단되거나 충돌할 수 있어요.\n\n먼저 Commit하거나 Stash로 현재 작업을 보관한 뒤 다시 Pull해주세요.{overlappingFiles}",
    overlappingFilesLabel: "\n\n겹치는 파일: {files}",
  },
};
