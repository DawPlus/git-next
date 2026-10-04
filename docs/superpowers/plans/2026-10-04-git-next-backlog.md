# Git Next Backlog Implementation Plan

> **For agentic workers:** Execute inline, ticket by ticket. Each linked ticket is the authoritative scope and acceptance spec.

**Goal:** Complete every remaining active Git Next ticket from T-261004-02 through T-261004-29.

**Architecture:** Keep each ticket as an independently reviewed change. Implement in dependency order, reusing existing Git state, Safe Guard, graph, and workspace patterns. Do not combine unrelated ticket changes.

**Tech Stack:** Node.js, VS Code Extension API, Git CLI, node:test.

**Spec:** `docs/tickets/active/T-261004-02.md` through `docs/tickets/active/T-261004-29.md`.

## Global Constraints

- Follow `AGENTS.md`, `docs/development.md`, and each ticket's Keep section.
- Preserve the existing working changes for T-261004-31 and all other user changes.
- Use RED → GREEN → REFACTOR for behavior changes; run focused tests, `npm test`, and `npm run build` as acceptance requires.
- Never commit or publish; the Human has not requested either.
- Keep history-changing actions guarded and explicitly confirmed; never mutate from diagnostic or educational views.

## Review Focus

- Remote tracking refs can be stale or missing; only claim state the local Git data supports.
- Dirty worktrees, divergent history, and in-progress operations must fail closed for unsafe actions.
- Destructive recovery, branch cleanup, stash, and override flows require an explicit user action and accurate target.
- Graph focus/highlights must preserve HEAD, refs, lane readability, and full-graph escape.
- Empty, unavailable, and large history states must remain understandable and bounded.

---

### Task 1: T-261004-02 — Git Doctor

Read `docs/tickets/active/T-261004-02.md`; implement its detection, explanation, and navigation criteria. Verify tests and build, then complete/archive the ticket.

### Task 2: T-261004-03 — Recovery points

Read `docs/tickets/active/T-261004-03.md`; add guarded local recovery refs and a recovery action. Verify tests and build, then complete/archive the ticket.

### Task 3: T-261004-04 — Stash overlap preview

Read `docs/tickets/active/T-261004-04.md`; show file-level overlap before Apply/Pop without claiming certainty. Verify tests and build, then complete/archive the ticket.

### Task 4: T-261004-05 — Graph sync focus

Read `docs/tickets/active/T-261004-05.md`; add Push, Pull, and divergence focus with a full-graph escape. Verify tests and build, then complete/archive the ticket.

### Task 5: T-261004-06 — Merge-base highlight

Read `docs/tickets/active/T-261004-06.md`; identify and explain the common ancestor in compare context. Verify tests and build, then complete/archive the ticket.

### Task 6: T-261004-07 — Branch cleanup assistant

Read `docs/tickets/active/T-261004-07.md`; list conservative cleanup candidates and require confirmation before deletion. Verify tests and build, then complete/archive the ticket.

### Task 7: T-261004-08 — Push/Pull impact preview

Read `docs/tickets/active/T-261004-08.md`; align commit/file summaries, graph emphasis, and available overlap warnings. Verify tests and build, then complete/archive the ticket.

### Task 8: T-261004-09 — Before/after action state

Read `docs/tickets/active/T-261004-09.md`; show only meaningful temporary state deltas after supported actions. Verify tests and build, then complete/archive the ticket.

### Task 9: T-261004-10 — First Push wizard

Read `docs/tickets/active/T-261004-10.md`; guide no-upstream Push using configured remotes and explicit tracking setup. Verify tests and build, then complete/archive the ticket.

### Task 10: T-261004-11 — Force-with-lease explanation

Depends on Task 7. Read `docs/tickets/active/T-261004-11.md`; explain the protected remote tip and fail closed on mismatch. Never enable bare `--force`. Verify tests and build, then complete/archive the ticket.

### Task 11: T-261004-12 — PR readiness

Read `docs/tickets/active/T-261004-12.md`; summarize readiness and provide host handoff without CI integration. Verify tests and build, then complete/archive the ticket.

### Task 12: T-261004-13 — Gone upstream guidance

Depends on Task 6. Read `docs/tickets/active/T-261004-13.md`; explain likely causes and offer safe next actions without auto-deletion. Verify tests and build, then complete/archive the ticket.

### Task 13: T-261004-14 — Undo recommendation

Depends on Task 2. Read `docs/tickets/active/T-261004-14.md`; recommend one safe recovery path without running undo automatically. Verify tests and build, then complete/archive the ticket.

### Task 14: T-261004-15 — Detached HEAD guide

Read `docs/tickets/active/T-261004-15.md`; support keep-as-branch and return-to-branch paths with confirmation. Verify tests and build, then complete/archive the ticket.

### Task 15: T-261004-16 — In-progress operation dashboard

Depends on Task 1. Read `docs/tickets/active/T-261004-16.md`; summarize continue/abort outcomes and confirm before either action. Verify tests and build, then complete/archive the ticket.

### Task 16: T-261004-17 — Action risk badges

Depends on Task 1. Read `docs/tickets/active/T-261004-17.md`; display advisory risk and reason consistent with Safe Guard. Verify tests and build, then complete/archive the ticket.

### Task 17: T-261004-18 — Commit containment

Read `docs/tickets/active/T-261004-18.md`; report containment against HEAD or chosen ref and highlight that commit. Verify tests and build, then complete/archive the ticket.

### Task 18: T-261004-19 — Tag/release graph focus

Depends on Task 4. Read `docs/tickets/active/T-261004-19.md`; focus tags while keeping branch and HEAD context. Verify tests and build, then complete/archive the ticket.

### Task 19: T-261004-20 — File history to graph

Depends on Task 4. Read `docs/tickets/active/T-261004-20.md`; find bounded file history and navigate to highlighted commits. Verify empty and large-history behavior, then complete/archive the ticket.

### Task 20: T-261004-21 — Push/Pull movement preview

Depends on Task 7. Read `docs/tickets/active/T-261004-21.md`; animate the same previewed commit set, keep it skippable, and respect reduced motion. Verify tests and build, then complete/archive the ticket.

### Task 21: T-261004-22 — Stash message and preview

Read `docs/tickets/active/T-261004-22.md`; preview saved changes and allow a deliberate default message. Verify tests and build, then complete/archive the ticket.

### Task 22: T-261004-23 — Linked worktrees

Read `docs/tickets/active/T-261004-23.md`; summarize sibling worktrees and warn conservatively before relevant risky actions. Verify tests and build, then complete/archive the ticket.

### Task 23: T-261004-24 — Partial-stage guidance

Read `docs/tickets/active/T-261004-24.md`; explain VS Code SCM steps and link to Source Control without staging changes. Verify tests and build, then complete/archive the ticket.

### Task 24: T-261004-25 — Git scenario cards

Depends on Task 1. Read `docs/tickets/active/T-261004-25.md`; provide educational cards mapped to supported live findings. Verify tests and build, then complete/archive the ticket.

### Task 25: T-261004-26 — Live glossary examples

Read `docs/tickets/active/T-261004-26.md`; map relevant glossary entries to repository state with generic fallback. Verify tests and build, then complete/archive the ticket.

### Task 26: T-261004-27 — Commit message hints

Read `docs/tickets/active/T-261004-27.md`; show advisory draft hints without blocking commits or imposing policy. Verify tests and build, then complete/archive the ticket.

### Task 27: T-261004-28 — Failed-action timeline

Depends on Task 8. Read `docs/tickets/active/T-261004-28.md`; record safe failure summaries and recheck before confirmed retries. Verify tests and build, then complete/archive the ticket.

### Task 28: T-261004-29 — Safe Guard rule controls

Read `docs/tickets/active/T-261004-29.md`; expose session-only relaxations, visible reset, and explicit consequence confirmation. Preserve critical history-rewrite safeguards. Verify tests and build, then complete/archive the ticket.
