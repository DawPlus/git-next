# Git Next

> Git을 잘 몰라도, 지금 무슨 일이 일어나는지는 알 수 있게.

Git Next는 **Git 그래프 + Safe Guard + 쉬운 한국어 가이드**를 한 화면에 묶은 VS Code 확장입니다.  
단순히 Git 명령을 대신 실행하는 것보다, **실행 전에는 무엇이 바뀌는지**, **실패하면 왜 그런지**, **다음에는 무엇을 해야 하는지**를 이해하기 쉽게 보여주는 데 집중합니다.

---

## ✨ 핵심 경험

### 🌿 그래프 중심 Git

커밋, 브랜치, HEAD, 로컬/원격 ref를 한눈에 보고 현재 위치를 이해할 수 있습니다.

```text
작업 파일
   ↓ Commit
내 로컬 Git
   ↓ Push
원격 저장소
```

그래프 lane에는 흐름 애니메이션이 적용되어 분기와 병합 방향을 더 쉽게 따라갈 수 있습니다.

### 🛡️ Safe Guard

Pull, Push, 브랜치 전환, 위험 작업 전에 현재 저장소 상태를 확인합니다.

짧게 `실패`라고 끝내지 않고 가능한 경우 다음 순서로 설명합니다.

```text
현재 어떤 상태인가
        ↓
왜 지금 위험한가
        ↓
무엇이 잘못될 수 있는가
        ↓
다음에 무엇을 하면 되는가
```

Git 원문 상세 정보는 숨기지 않되, 사용자 설명보다 한 단계 아래에 표시합니다.

### 🧭 상황별 가이드

Git 오류 메시지를 그대로 외울 필요가 없습니다.

- 작업 중인데 Pull 해야 할 때
- Pull 충돌이 예상될 때
- Push가 거절됐을 때
- 로컬과 원격이 Diverged 되었을 때
- Upstream이 없을 때
- 원격 기록이 Force Push/Rebase로 바뀐 것 같을 때
- Merge가 끝나지 않았을 때

Conflict 화면의 `<<<<<<< HEAD`, `=======`, `>>>>>>>`도 **내 변경 / 경계 / 들어온 변경** 기준으로 설명합니다.

### 📖 움직이는 Git 용어 설명

용어를 정의만 하지 않고 **어디에서 어디로 이동하는지** 보여줍니다.

- Commit: 작업 파일 → 내 로컬
- Push: 내 로컬 → 원격
- Pull: 원격 → 내 로컬
- Fetch: 원격 → 원격 정보
- Stash: 작업 파일 → 임시 보관
- Revert / Reset / Rebase / Cherry-pick 등 주요 Git 개념

작업 파일, 로컬, 원격, 브랜치, 태그, Stash 노드는 아이콘과 색상으로 구분됩니다.

---

## 🧰 주요 기능

| 영역 | 기능 |
| --- | --- |
| 그래프 | 커밋 그래프, branch/ref, HEAD, merge lane, 검색/필터, compact mode |
| 동기화 | Pull / Push, ahead / behind / diverged 상태, Push 전 Pull 옵션 |
| 브랜치 | 생성, 전환, 추적 브랜치 생성, 이름 변경, 삭제 |
| 태그 | 로컬 태그 생성 / 삭제 |
| Stash | 저장, Apply, Pop, 삭제 |
| 커밋 작업 | Cherry-pick, Revert, 커밋 기준 브랜치/태그 생성 |
| 안전 | dirty tree, detached HEAD, 진행 중 작업, 원격 기록 재작성 감지 |
| 가이드 | Pull/Push 실패 분석, Conflict 설명, 해결 순서 안내 |
| 비교 | 브랜치별 고유 커밋과 변경 파일 비교 |
| 복구 | Undo 가이드, Reflog 기반 복구 브랜치 |
| 협업 | Remote 관리, PR 준비 상태 확인 및 GitHub/GitLab handoff |
| 기록 | Git Next에서 실행한 최근 작업 타임라인 |
| 도움 | Commit 메시지 초안, 상황별 가이드, Git 용어 설명 |

---

## 🎛️ 사이드바

Git Next 사이드바는 Git Next 전용 메뉴와 상태 확인에 집중합니다. 파일 변경사항, Stage/Unstage, Commit은 VS Code 기본 Source Control을 사용합니다.

```text
Repository                        ↻
main                     동기화됨
origin/main

    ↓ 받기        ↑ 보내기

        Git 도구
  Branch   Tag   Stash
           더보기

도움말

        Safe Guard
           대기
```

기본 Source Control을 복제하지 않고, Git Next의 Graph, Pull/Push, Compare, Branch, Stash, 도움말, Safe Guard 기능을 좌측 탭에서 그대로 사용할 수 있습니다.

---

## 🧠 Git Next가 지키는 원칙

1. **위험한 작업은 먼저 설명합니다.**
2. **모르는 상태에서는 안전하다고 단정하지 않습니다.**
3. **Git 원문은 보존하지만 먼저 사람말로 설명합니다.**
4. **Force Push나 기록 삭제를 쉬운 지름길처럼 추천하지 않습니다.**
5. **Human QA가 마지막입니다.**

---

## 🚀 개발 실행

```bash
npm install
npm test
npm run build
```

VS Code에서 프로젝트를 연 뒤 Extension Development Host로 실행합니다.

명령 팔레트:

```text
Git Next: 그래프 열기
```

---

## 📦 VSIX 만들기

```bash
npm test
npm run build
npm run package
```

생성된 `.vsix` 파일은 다음처럼 설치할 수 있습니다.

```bash
code --install-extension git-next-<version>.vsix
```

---

## 🇰🇷 UI 언어

사용자가 직접 보는 버튼, 상태, 오류, 경고, 가이드는 한국어를 기본으로 합니다.

다만 Git 자체 개념을 익히는 데 도움이 되는 `HEAD`, `origin/main`, `Pull`, `Push`, `Rebase`, `Stash` 같은 용어는 한국어 설명과 함께 유지합니다.

---

Git Next의 목표는 Git을 감추는 것이 아니라, **Git이 지금 무엇을 하고 있는지 겁먹지 않고 이해하게 만드는 것**입니다.
