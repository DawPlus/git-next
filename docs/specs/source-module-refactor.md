# Source Module Refactor

> Execution is governed by Acorn ticket `T-261005-01`. This document is design reference material, not an independent dispatch or workflow authority.

## Goal

Make Git Next easier to navigate and maintain by splitting oversized source modules along existing responsibilities, without changing user-visible behavior.

## Current state

The largest modules are `sidebar-view.mjs` (982 lines), `graph-view.mjs` (953), `git-workflows.mjs` (942), `git-safety.mjs` (600), and `glossary-view.mjs` (587). The view files embed CSS and browser scripts; workflow and safety files combine several separate Git tasks.

## Design

- Keep existing entry modules and their exported names as compatibility facades. Existing callers and tests continue importing from the same paths.
- Split workflow functions into focused modules for Git operations and previews, change workspace/staging, history, remote/PR workflows, recovery, and repository diagnostics.
- Split safety code into tracking/repository inspection and policy/guards, while keeping preflight behavior behind `git-safety.mjs`.
- Move graph layout/filter logic out of `graph-view.mjs`; keep the graph view as the composition entry point. Put its embedded styles and browser interactions in adjacent modules.
- Keep `sidebar-view.mjs` as the sidebar composition and markup entry point; split its styles by shell, change list, and Git tools, and put browser interactions in an adjacent module.
- Move glossary terms and scenario data out of `glossary-view.mjs`; retain its existing rendering and lookup exports through the same entry module.
- Add new runtime modules to `scripts/build.mjs` so the copied `dist` output resolves every import.

## Constraints

- Preserve exact Git commands, return shapes, error behavior, Korean copy, markup, CSS, and browser interactions.
- Add no runtime dependencies and do not change the extension's public commands or settings.
- Split by cohesive responsibility; avoid creating one-file-per-function modules.
- Preserve current import paths through re-exports unless an existing behavior makes that impractical.

## Acceptance

- Existing tests pass unchanged; add only focused tests needed to prove extracted exports and browser assets are still composed.
- `npm test`, `npm run build`, and `git diff --check` pass.
- Built `dist` modules resolve without missing imports.
- No feature, UX, or wording changes are included.

## Delivery approach

Implement in reviewable slices: workflow and safety modules, graph and sidebar view assets, then glossary data. Verify each slice with its focused tests; finish with the full suite and build.
