# Source Module Refactor Implementation Plan

> **Execution ownership:** Acorn ticket `T-261005-01` is the source of truth. Use this document only as an implementation reference after that ticket is selected through the Acorn workflow. External planning/execution skills do not authorize dispatch, role bypass, QA bypass, or scope expansion. Preserve project changes and do not commit.

**Goal:** Split the oversized Git Next source modules by responsibility without changing behavior or existing import paths.

**Architecture:** Keep current modules as public facades. Move cohesive implementation groups into adjacent modules, with view CSS and webview scripts in separate modules and the build script copying all runtime files into `dist`.

**Tech Stack:** Node.js ES modules, `node:test`, VS Code extension webviews.

**Spec:** `docs/specs/source-module-refactor.md`

## Global Constraints

- Preserve Git commands, return values, errors, UI copy, HTML, CSS, and webview behavior exactly.
- Add no dependencies or product features.
- Keep current import paths and exported names through facade re-exports.
- Do not commit, overwrite, or revert the existing worktree changes.
- Split cohesive responsibilities; do not create one module per function.

## Review Focus

- Remote tracking failure, ahead/behind, and rewrite detection keep current outcomes; verify with `test/git-workflows.test.mjs` and `test/safe-guard.test.mjs`.
- Dirty, untracked, staged, and renamed paths retain their parsing; verify with `test/repository-fixtures.test.mjs` and `test/git-actions-advanced.test.mjs`.
- Graph filtering/layout and empty states remain the same; verify with `test/graph-view.test.mjs`.
- Sidebar and glossary HTML still include their current styles and browser handlers; verify with `test/workspace-views.test.mjs` and `test/glossary.test.mjs`.
- Every new runtime module is present and resolvable in `dist`; verify after `npm run build` by importing each new `.mjs` module from `dist`.

---

### Task 1: Split Git workflow responsibilities

**Files:**
- Create: `src/git-command.mjs` for the shared workflow Git runner and name-status parser.
- Create: `src/git-operation-workflows.mjs` for conflict operations, operation previews, impact previews, and state-delta wrappers.
- Create: `src/git-change-workflows.mjs` for change workspace parsing, stage/unstage/discard, and local/remote file comparison.
- Create: `src/git-history-workflows.mjs` for branch/commit/stash/file history and lease preview.
- Create: `src/git-remote-workflows.mjs` for remote configuration and pull-request preparation.
- Create: `src/git-recovery-workflows.mjs` for recovery points, undo/restore, and reflog.
- Create: `src/git-diagnostics.mjs` for next-action, Git Doctor, retry, and undo guidance.
- Move commit message suggestions into `src/git-change-workflows.mjs`.
- Modify: `src/git-workflows.mjs` into re-exports for its existing public API.
- Modify: `scripts/build.mjs` to copy the new runtime modules.
- Test: `test/git-workflows.test.mjs`, `test/git-actions-advanced.test.mjs`.

**Interfaces:** Existing exports from `src/git-workflows.mjs` keep their names and signatures. New modules own implementation exports; cross-module Git execution uses `runGit(cwd, args, env = {})` and `parseNameStatus(raw)` from `src/git-command.mjs`.

- [ ] Run the focused workflow/action tests before moving code and record baseline.
- [ ] Move cohesive functions and helpers without changing command arguments, result shapes, or messages.
- [ ] Re-export every former `git-workflows.mjs` export from its existing path, including remote/PR helpers.
- [ ] Run `node --test test/git-workflows.test.mjs test/git-actions-advanced.test.mjs`.
- [ ] Build and import the new workflow modules from `dist`.

### Task 2: Split Git safety inspection and policy

**Files:**
- Create: `src/git-tracking.mjs` for tracking, upstream, HEAD, and working-tree inspection.
- Create: `src/git-risk.mjs` for pure action-risk and guard rules.
- Create: `src/git-preflight.mjs` for in-progress operation, remote rewrite, Push, and Pull checks.
- Modify: `src/git-safety.mjs` into re-exports for its existing public API.
- Modify: `scripts/build.mjs` to copy the new runtime modules.
- Test: `test/git-state.test.mjs`, `test/safe-guard-rules.test.mjs`, `test/safe-guard.test.mjs`, `test/repository-fixtures.test.mjs`.

**Interfaces:** Existing exports from `src/git-safety.mjs` keep their names and signatures. Tracking and preflight modules share the existing Git command result semantics; pure guard functions remain synchronous.

- [ ] Run the focused safety tests before moving code and record baseline.
- [ ] Move tracking and pure guard functions to their owning modules.
- [ ] Move preflight functions while preserving fetch behavior and fail-closed rewrite handling.
- [ ] Re-export every former `git-safety.mjs` export from its existing path.
- [ ] Run `node --test test/git-state.test.mjs test/safe-guard-rules.test.mjs test/safe-guard.test.mjs test/repository-fixtures.test.mjs`.
- [ ] Build and import the new safety modules from `dist`.

### Task 3: Separate graph logic and webview assets

**Files:**
- Create: `src/graph-state.mjs` for `layoutGraph` and `filterGraphState`.
- Create: `src/graph-styles.mjs` and `src/graph-interactions.mjs` for the existing embedded CSS and browser script.
- Modify: `src/graph-view.mjs` to compose the same HTML using those assets and re-export `layoutGraph` and `filterGraphState`.
- Modify: `scripts/build.mjs` to copy the new runtime modules.
- Test: `test/graph-view.test.mjs`.

**Interfaces:** `renderGraphHtml(state, notice = null, options = {})`, `layoutGraph(commits)`, and `filterGraphState(state, options = {})` remain available from `src/graph-view.mjs`.

- [ ] Run graph tests before the move and record baseline.
- [ ] Extract model functions and assets byte-for-byte; preserve composition order and script/style tags.
- [ ] Re-export the original graph API.
- [ ] Run `node --test test/graph-view.test.mjs` and build/import the new modules from `dist`.

### Task 4: Separate sidebar assets and glossary data

**Files:**
- Create: `src/sidebar-shell-styles.mjs`, `src/sidebar-changes-styles.mjs`, and `src/sidebar-tools-styles.mjs`, grouping the existing CSS by those UI responsibilities.
- Create: `src/sidebar-interactions.mjs` for the existing browser script.
- Modify: `src/sidebar-view.mjs` to compose the same HTML and keep `renderSidebarHtml` and `renderSafeGuardDetailsHtml` exports.
- Create: `src/glossary-data.mjs` for `TERMS` and `SCENARIOS`.
- Modify: `src/glossary-view.mjs` to import that data and keep all current exports.
- Modify: `scripts/build.mjs` to copy the new runtime modules.
- Test: `test/workspace-views.test.mjs`, `test/glossary.test.mjs`.

**Interfaces:** Existing sidebar and glossary exports retain their current paths, names, and signatures.

- [ ] Run focused sidebar/glossary tests before moving code and record baseline.
- [ ] Extract assets/data without changing Korean text, styling, or event handling; concatenate CSS in its current order.
- [ ] Re-export or retain all existing public exports.
- [ ] Run `node --test test/workspace-views.test.mjs test/glossary.test.mjs` and build/import the new modules from `dist`.

### Task 5: Full regression and output audit

**Files:**
- Modify: `scripts/build.mjs` only if the final runtime-module inventory is incomplete.
- Test: full `test/*.test.mjs` suite and built `dist` module imports.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Import every built module with `node --input-type=module -e 'import { resolve } from "node:path"; import { pathToFileURL } from "node:url"; for (const file of process.argv.slice(1)) await import(pathToFileURL(resolve(file)));' dist/*.mjs`.
- [ ] Run `git diff --check` and verify no product copy or behavior edits entered the diff.
- [ ] Record the resulting line counts for the refactored entry modules and their new focused modules.
