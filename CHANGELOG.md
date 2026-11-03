# 변경 기록

## 0.2.7

- Push 거절 시 Pull을 1순위 권장 액션으로 제공하고 덮어쓰기 위험 문구 보강
- 갈라진(diverged) 브랜치 해결 프리뷰에 Merge 안전성 및 Rebase 재작성 안내 노출
- 충돌 해결 화면에 Current vs Incoming 명칭과 완료 컨트롤을 파일 목록 옆에 함께 배치
- 백그라운드 작업 중 추가 클릭 무시 시 패널 내부에 Busy 안내 배너 표시
- 사이드바 첫 화면 상단에 그래프·Sync·Safe Guard 우선 배치 (Changes는 안전 확인 후 노출)
- Push, Pull, 삭제, Discard/Undo 확인 대화상자 문구를 다국어(i18n) `dialog.confirm`으로 분리

## 0.2.6

- Commit 메시지 힌트·Stage/Commit 성공 후 다음 단계·Push 거절/갈라짐 안내를 쉬운 다음 행동 중심으로 보강

## 0.2.5

- Push/Pull 사전 검사(preflight) 지연을 줄임 (호스트 기준 약 175–200ms → 약 75–87ms)
- 진행 중 merge/rebase 등 표식을 파일시스템 경로로 빠르게 확인하고, 독립 검사를 병렬화
- 원격 기록 재작성 감지는 동시 호출만 한 번 fetch로 합치고, 클릭마다 새 원격 커밋은 놓치지 않도록 유지
- Stage 클릭 지연 측정용 `GIT_NEXT_PERF` 파일 로그·웹뷰 `stage:total` 브리지·픽스처 스크립트 추가
- 빈 저장소 첫 성공 안내, 조용한 새로고침/바쁜 클릭 실패 노출, 빌드 시 TypeScript 검사 강화
- README·Safe Guard 설명을 실수 방지(초보자 두려움 완화) 목표에 맞게 정리
- Marketplace 아이콘을 128×128로 축소해 1024KB 제한을 통과
- Push/Pull 실패·차단 안내를 ‘다음에 누를 곳’ 중심으로 강화하고 Continue/Abort 표현을 제거
- 사이드바·변경사항 기본 라벨을 Commit 대기 / 브랜치 밖 커밋 등 쉬운 말로 정리
- 빈 저장소 viewsWelcome·첫 Commit 안내 명령과 저장→Stage→Commit 힌트를 보강

## 0.1.7

- Safe Guard 메시지를 현재 상태, 위험 이유, 발생 가능한 문제, 다음 행동까지 설명하도록 확장
- 상황별 가이드와 Git 용어 카드에 가벼운 진입/hover 애니메이션 추가
- reduced-motion 환경에서는 새 애니메이션 자동 비활성화
- 그래프 상단 새로고침/Pull/Push 컨트롤에 아이콘 추가
- 그래프/사이드바 버튼 hover 피드백과 전환 효과 정리
- README를 현재 기능 구성과 제품 방향에 맞게 전면 개편
- 새 Git 기능 추가 없이 UI/설명 polish 중심으로 릴리스 마감

## 0.1.6

- 좌측 사이드바를 VS Code 스타일의 얇은 컨트롤 패널로 재구성
- 저장소/브랜치/동기화 상태 헤더 밀도 개선
- Pull/Push를 컴팩트 동기화 컨트롤로 정리
- 브랜치/태그/Stash를 설명이 붙은 Quick tools 목록으로 재구성
- 용어 설명/새로고침을 보조 유틸리티 영역으로 분리
- Safe Guard를 상태 점이 포함된 슬림 상태 행으로 개선
- 기존 컴팩트 그래프와 beam 애니메이션 유지

## 0.1.5

- 그래프 lane을 따라 흐르는 beam 애니메이션 추가
- reduced-motion 환경에서는 애니메이션 자동 비활성화
- 컴팩트 모드 행 높이/노드/lane 간격 추가 축소
- 컴팩트 메타/refs/작업 버튼 밀도 개선

## 0.1.4

- 그래프 컴팩트/기본 밀도 전환
- 커밋 검색, ref/범위/최근 개수 필터 추가
- 태그 생성/삭제
- 브랜치 생성/전환/이름 변경/삭제
- 원격 브랜치에서 로컬 추적 브랜치 생성 안내
- Stash 저장/적용/Pop/삭제
- 커밋 Cherry-pick/Revert
- 사이드바 용어 설명 버튼과 Git 용어 사전 추가
- 위험 작업 전/후 한글 안내와 확인 흐름 강화

## 0.1.3

- 멀티 브랜치 그래프 색상 팔레트 확장
- 분기/병합 선을 부드러운 곡선으로 개선
- merge parent lane 색 분리
- 현재 HEAD 노드 강조
- ref 라벨을 lane 색상과 연동

## 0.1.2

- Activity Bar 사이드바를 좁은 컨트롤 패널로 재구성
- 사이드바에 "그래프 보기" 추가, 전체 그래프는 중앙 에디터에 표시
- 사이드바/그래프 UI 밀도와 정보 계층 정리
- VSIX에 Safe Guard 런타임 모듈 포함

## 0.1.1

- VS Code Activity Bar에 Git Next 아이콘 추가
- Git Next 사이드바 Webview 추가
- 명령 팔레트의 "Git Next: 그래프 열기"가 사이드바를 열도록 변경

## 0.1.0

- 커밋 그래프와 브랜치/HEAD/로컬·원격 ref 표시
- 기본 Pull/Push와 ahead/behind/diverged 상태 표시
- 위험한 Push 차단과 선택형 Push 전 Pull
- 사용자 노출 버튼, 안내, 오류 메시지 한글화
- 실제 Git 임시 저장소 기반 자동 테스트 추가
