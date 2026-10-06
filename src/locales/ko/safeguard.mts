export const safeguard = {
  safe: "안전",
  warning: "주의",
  blocked: "차단",
  idle: "대기",
  status: "상태",
  passed: "안전 검사를 통과했습니다.",
  rules: {
    dirtyIncomingOverlap: {
      title: "Pull 전 겹치는 로컬 변경 차단",
      purpose: "내 로컬 수정 파일과 Remote에서 들어올 파일이 겹치면 먼저 알려줘요.",
      risk: "완화하면 Pull 중 충돌이 발생하거나 Git이 Pull을 멈출 수 있어요.",
    },
    noUpstream: {
      title: "Remote 연결이 없는 작업 중단",
      purpose: "Pull/Push 대상 브랜치가 정해지지 않으면 실행을 멈춰요.",
      risk: "올바른 대상을 알 수 없어 완화할 수 없어요.",
    },
    remoteHistoryRewritten: {
      title: "원격 기록 재작성 감지",
      purpose: "Remote 커밋 기록이 바뀐 경우 덮어쓰기 가능성을 알려줘요.",
      risk: "공유 커밋이 사라질 수 있어 세션에서 완화할 수 없어요.",
    },
    protectedBranch: {
      title: "보호 브랜치 위험 작업 경고",
      purpose: "main / master / release 같은 보호 브랜치에서 Force Push·삭제·Hard Reset을 한 번 더 막아요.",
      risk: "공유 기본 브랜치를 덮거나 지울 수 있어 세션에서 완화할 수 없어요.",
    },
  },
};
