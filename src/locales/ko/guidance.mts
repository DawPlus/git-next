export const guidance = {
  labels: {
    state: "상태: {value}",
    risk: "위험: {value}",
    next: "다음: {value}",
    stateFallback: "현재 상태를 확인할 수 없습니다.",
    riskFallback: "확인된 위험 정보를 읽을 수 없습니다.",
    nextFallback: "현재 저장소 상태를 다시 확인하세요.",
  },
  nextAction: {
    operation: {
      title: "{operation} 작업을 먼저 끝내주세요.",
      detail: "Continue 또는 Abort로 현재 작업을 정리한 뒤 다음 Git 작업을 진행하세요.",
    },
    remoteMissing: {
      title: "연결된 원격 브랜치가 사라진 것으로 보여요.",
      detail: "{upstream}를 자동으로 다시 만들지 않고 먼저 브랜치 상태를 확인합니다.",
      fallbackUpstream: "원격 브랜치",
    },
    refreshStale: {
      title: "원격에 새 변경이 있어요. 상태를 갱신해주세요.",
      detail: "Fetch/새로고침으로 원격 정보를 갱신한 뒤 Pull/Push 상태를 다시 계산해주세요.",
    },
    refreshMissing: {
      title: "원격 추적 정보가 오래됐어요.",
      detail: "Fetch/새로고침으로 원격 정보를 갱신한 뒤 Pull/Push 상태를 다시 계산해주세요.",
    },
    unknown: {
      title: "원격 상태를 확인할 수 없어요.",
      detail: "연결 또는 네트워크를 확인한 뒤 다시 새로고침해주세요.",
      detailRemote: "Remote 연결을 확인하고 새로고침해주세요.",
    },
    pullBlockedDirty: {
      title: "Pull 전에 겹치는 로컬 변경 {count}개를 먼저 정리해주세요.",
      detail: "{preview} · Commit 또는 Stash 후 Pull하세요.",
      moreCount: " 외 {count}개",
    },
    diverged: {
      title: "로컬과 원격에 서로 다른 Commit이 있어요. Pull {behind}부터 진행해주세요.",
      detail: "받을 Commit {behind}개 · 보낼 Commit {ahead}개 · Pull 후 Merge가 필요하면 Git Next가 안내합니다.",
    },
    behind: {
      titleWithChanges: "Commit 전에 Pull을 먼저 진행해주세요.",
      titleNoChanges: "원격에 새 Commit이 있어요. Pull을 먼저 진행해주세요.",
      detail: "원격이 {behind}커밋 앞서 있습니다.",
    },
    pushDirty: {
      title: "Push하지 않은 Commit이 있어요. 새 변경도 확인해주세요.",
      detail: "Push 대기 {ahead}개 · 현재 변경 {changes}개",
    },
    push: {
      title: "Commit 완료! 아직 Push하지 않은 Commit이 {ahead}개 있어요.",
      detail: "Push해도 됩니다.",
    },
    noUpstreamDirty: {
      title: "변경 내용을 Commit해주세요.",
      detail: "첫 Push에서 Remote 브랜치를 연결할 수 있어요.",
    },
    firstPush: {
      title: "아직 Remote에 연결되지 않았어요. 첫 Push가 필요해요.",
      detail: "Push하면 Remote와 현재 브랜치를 연결할 수 있어요.",
    },
    dirty: {
      title: "변경 내용을 확인하고 Commit해주세요.",
      detail: "아직 Commit하지 않은 변경이 있습니다.",
    },
    clean: {
      title: "로컬과 원격이 최신 상태예요.",
      detail: "지금은 추가로 필요한 Git 작업이 없습니다.",
    },
  },
  doctor: {
    operation: {
      state: "{operation} 진행 중",
      risk: "작업을 끝내기 전에 다른 Git 작업을 실행하면 상태가 더 복잡해질 수 있습니다.",
      recommendation: "충돌 파일과 Continue/Abort 방법을 확인하세요.",
    },
    detachedHead: {
      state: "현재 브랜치에 들어가 있지 않은 커밋을 보고 있음",
      risk: "여기서 만든 새 Commit은 나중에 찾기 어려워질 수 있습니다.",
      recommendation: "작업을 유지하려면 새 브랜치를 만들고, 아니라면 기존 브랜치로 돌아가세요.",
    },
    noUpstream: {
      state: "연결된 원격 브랜치가 없음",
      risk: "Pull하거나 Push할 원격 브랜치를 정할 수 없습니다.",
      recommendation: "첫 Push에서 현재 브랜치를 원격 브랜치와 연결해주세요.",
    },
    trackingUnknown: {
      state: "원격 추적 상태 확인 불가",
      risk: "로컬과 원격 중 어느 쪽이 앞섰는지 알 수 없습니다.",
      recommendation: "원격 저장소 연결을 확인한 뒤 새로고침해주세요.",
    },
    diverged: {
      state: "로컬 {ahead}개 앞섬 · 원격 {behind}개 앞섬",
      risk: "양쪽 기록이 갈라져 바로 동기화할 수 없습니다.",
      recommendation: "Branch 비교에서 양쪽 커밋을 확인하세요.",
    },
    behind: {
      state: "원격이 {behind}개 커밋 앞섬",
      risk: "로컬에 아직 없는 변경이 원격에 있습니다.",
      recommendation: "Pull 전에 변경 파일과 충돌 여부를 확인하세요.",
    },
    ahead: {
      state: "로컬이 {ahead}개 커밋 앞섬",
      risk: "현재 커밋은 원격에 아직 공유되지 않았습니다.",
      recommendation: "보낼 커밋을 확인하고 Push하세요.",
    },
    upstreamGone: {
      state: "연결된 원격 브랜치를 찾을 수 없음 · {upstream}",
      risk: "원격 브랜치가 삭제됐을 수 있습니다. 내 로컬 브랜치는 아직 남아 있습니다.",
      recommendation: "브랜치 정리 후보를 확인해주세요. 로컬 브랜치는 자동으로 삭제하지 않습니다.",
    },
    trackingRefMissing: {
      state: "원격 브랜치 연결 정보가 오래되었거나 없음 · {upstream}",
      risk: "원격 브랜치가 남아 있어도 내 컴퓨터의 정보가 오래됐을 수 있습니다.",
      recommendation: "원격 저장소 관리에서 Fetch를 실행해 최신 상태를 다시 확인해주세요.",
    },
    trackingRefStale: {
      state: "원격에 아직 Fetch하지 않은 새 변경이 있음 · {upstream}",
      risk: "현재 Pull/Push 숫자가 오래된 원격 추적 정보를 기준으로 계산됐을 수 있습니다.",
      recommendation: "Fetch로 원격 정보를 갱신한 뒤 Pull/Push 상태를 다시 확인해주세요.",
    },
    upstreamRemoteMissing: {
      state: "연결해 둔 원격 저장소 '{remote}'을 찾을 수 없음",
      risk: "원격 저장소 설정이 삭제되었거나 이름이 바뀌었을 수 있습니다.",
      recommendation: "원격 저장소 설정을 확인하거나 다시 추가해주세요.",
    },
    upstreamUnverified: {
      state: "연결된 원격 브랜치 상태를 확인할 수 없음 · {upstream}",
      risk: "원격 저장소에 연결하지 못해 브랜치가 남아 있는지 확인할 수 없습니다.",
      recommendation: "원격 저장소 연결을 확인한 뒤 Fetch를 다시 실행해주세요.",
    },
    dirty: {
      state: "커밋하지 않은 변경 {count}개",
      risk: "전환이나 복구 작업에서 로컬 내용을 잃을 수 있습니다.",
      recommendation: "Source Control에서 변경을 확인하고 Commit 또는 Stash하세요.",
    },
    remoteRewrite: {
      state: "원격 기록이 다시 작성됐을 수 있음",
      risk: "원격 커밋이 이전에 확인한 기록과 달라졌습니다.",
      recommendation: "Push를 멈추고 Compare에서 원격 기록을 확인하세요.",
    },
    healthy: {
      state: "정상 · {branch}",
      risk: "확인된 위험이 없습니다.",
      recommendation: "현재 Git 작업을 계속할 수 있습니다.",
      currentBranchFallback: "현재 브랜치",
    },
  },
  retry: {
    dirtyWorkingTree: "로컬 변경을 Commit 또는 Stash했는지 확인하세요.",
    noUpstream: "현재 브랜치가 Push할 원격 브랜치와 연결되어 있는지 확인해주세요.",
    diverged: "Remote에서 새로 온 커밋과 로컬 커밋을 비교하세요.",
    operationInProgress: "진행 중인 Merge/Rebase 작업을 계속하거나 취소하세요.",
    pull: "작업 폴더와 진행 중 Git 작업을 확인한 뒤 Pull하세요.",
    push: "현재 브랜치와 연결된 원격 브랜치의 차이를 확인한 뒤 Push해주세요.",
    commit: "Staged 파일과 Commit 메시지를 다시 확인하세요.",
    stashPush: "보관할 변경 파일과 Stash 메모를 다시 확인하세요.",
    default: "현재 저장소 상태를 확인한 뒤 작업을 다시 실행하세요.",
  },
  undo: {
    recoveryLabel: "복구 지점에서 브랜치 만들기",
    recoveryReason: "작업 전 커밋 위치가 보존되어 있어 원래 상태를 안전하게 되살릴 수 있습니다.",
    pushLabel: "Revert 커밋 만들기",
    pushReason: "이미 공유한 변경은 기록을 다시 쓰지 않고 반대 커밋을 추가하는 편이 안전합니다.",
    commitLabel: "마지막 로컬 Commit 취소",
    commitReason: "Push 전 커밋이면 파일 변경을 보존한 채 Commit만 취소할 수 있습니다.",
    pullLabel: "Pull 전 위치에서 복구 브랜치 만들기",
    pullReason: "Pull 전 Commit 위치를 새 브랜치로 보존해두면 필요할 때 돌아갈 수 있습니다.",
    switchBranchLabel: "브랜치 이동 전 위치에서 복구 브랜치 만들기",
    switchBranchReason: "이동 전 Commit 위치를 새 브랜치로 보존하면 나중에 다시 찾을 수 있습니다.",
    deleteBranchLabel: "삭제한 브랜치 복구하기",
    deleteBranchReason: "삭제된 브랜치의 마지막 Commit 위치를 찾아 새 브랜치로 다시 보존합니다.",
  },
};
