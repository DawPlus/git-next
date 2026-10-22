# Code Map

Project code entry points. Keep this map tiny and current.

Format:

```text
Area
Entry: path/to/main-file
Related: path/to/related-file, path/to/other-file
```

Rules:
- Record only useful entry points and important relationships.
- Do not catalog every file.
- Prefer 1 entry file and at most 2 related files per area.
- Update only when a change makes an existing map entry wrong or a repeatedly useful area has no entry.
- Remove stale entries instead of preserving history here.

## First Push
Entry: src/sync-handler.ts
Related: src/git-actions.mts, src/workspace-views.mts

## Stash guidance
Entry: src/stash-flow.mts
Related: src/git-actions.mts, src/panel-handlers.ts

- Git 작업 공통 보호: `src/repository-operation.mts` (창 간 common-dir 잠금/상태 지문), `src/extension-core.ts` (`onRepositoryMessage`, 확인 후 재검증). 패널/AI 경로 포함. 강제 종료 후 남은 `git-next-operation.lock`은 실행 중 작업 부재 확인 후 수동 삭제.
