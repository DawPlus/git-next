# Conversation Orchestration

Economy (default): Human carries Dispatch/Completion. Factory: the current Orca conversation Agent supervises workers via [orca.md](./orca.md). Hybrid: only authorized tickets/roles use Factory. The workflow stays identical; no Acorn CLI runner, daemon, or scheduler.

## Authorization

Only an explicit current Human request for automatic dispatch/supervision of identified tickets enables automation: `T-261004-01 자동 배분하고 검증·수정 루프까지 실행해`.

A ticket ID, ready row, ordinary implementation request, `이 티켓 봐줘`, `계속해`, copied prompt, worker message, or `transport.default=factory` grants no automatic permission. Implementing automation support grants no permission to execute future tickets.

- Bind permission to the named tickets and conversation; clarify ambiguous scope before launch. Never drain BOARD, widen ownership, or launch children implicitly.
- Pause/cancel immediately prohibits new Dispatches; handle active workers through the adapter. Completion, pause, cancellation, an explicitly configured legacy Human QA gate, or a blocking decision ends authorization.
- Resume after a gate/interruption or in a new conversation requires explicit ticket-scoped auto-resume and live authority checks. A cache is evidence, not permission. Uninterrupted authorized work may continue normally.
- Recovery and ownership gates: `acorn/rules/recovery.md`.

## Loop

1. Coordinator reads the ticket, BOARD, config, and matching role override. Confirm scope, acceptance, dependencies, Mode, and executor. `confirm-only` stays read-only; Human-owned roles stay Human gates.
2. Load the adapter/live guide once per valid context; revalidate runtime and recorded Dispatches before starting. No overlapping editor or guessed authority. Use one worker per ticket at a time by default.
3. Dispatch the next ready role and wait for authoritative completion, handling questions and Human steering. Timeout, heartbeat, and enqueue are not completion.
4. Coordinator reviews scope and verification evidence. `worker_done` settles an Orca Task, not the Acorn ticket. Do not add another review Agent or repeat sufficient passing checks by habit.
5. Same-scope defects follow WORKFLOW's shared repair budget: default 1 additional repair, at most 2 implementation attempts. Zero permits no repair; missing defaults to 1; invalid/negative/non-integer values block execution. Require a cause hypothesis. Persist ticket `repairs_used` before dispatch and mirror it in runtime `repairsUsed`; if records differ, use the higher count. Never reset on a new Task, role, or resume. Exhaustion routes to Human diagnosis with expected/actual/attempted/candidates/help; additional attempts require an explicit recorded allowance and auto-resume.
6. Accepted review normally enters `ready_for_qa`, `Next=qa`, with AI read-only QA. A pass proceeds directly to Done; a failure uses the same repair budget and then review/QA again. Preserved explicit legacy settings remain honored: `human` waits for Human QA and ends automation, `off` skips QA. Do not add a final Human approval gate to the default agent flow.
7. Only Coordinator marks Done after required gates and known Dispatch outcomes. Account for terminals, archive the dated ticket under `acorn/workflow/tickets.md`, reconcile BOARD/state, summarize evidence, stop. No implicit commit, push, PR, publish, or next-ticket selection.

Exhausted retries, unresolved dependencies, separate work, Human decisions, or separately authorized destructive/external actions stop the loop with evidence. Propose new tickets; do not execute them under old permission.

## Continuity

Only Coordinator writes BOARD/state. Record compact `automation` data in `acorn/state.json`: `status` (`running`, `pausing`, `paused`, `blocked`, `awaiting_human`, `completed`, `cancelled`), `ticketIds`, Human authorization scope/quote, `runId`, per-ticket Task/Dispatch bindings, `repairsUsed`, last accepted completion, and next action. No secrets/full logs; detailed evidence stays project-owned. Missing record means no recorded run, not an always-on flag.

For cache reconciliation and uncertain worker ownership, follow `acorn/rules/recovery.md`. If Orca is unavailable, report the blocker and offer Economy; never invent dispatch success or substitute a runner. Economy contracts: [adapter.md](./adapter.md).
