# Orca Conversation Adapter

New work requires [orchestration.md](./orchestration.md) authorization. Read-only recovery and settlement of already-owned workers need no new dispatch permission. The conversation Agent coordinates; Orca executes and owns lifecycle authority.

## Bootstrap once per valid context

- Use the installed `orchestration` skill. Resolve once: `ORCA_CLI_COMMAND`, else `orca-dev` with `ORCA_DEV_REPO_ROOT`, else `orca-ide` on Linux outside Orca terminals, else `orca`. Never switch executables after failure.
- Load `skills get orchestration` and `status --json` before lifecycle mutations. Reuse the guide within unchanged runtime/context; reload after upgrade, lost context, or capability/contract error. Load individual references only at their action gate, not `--full` by habit.
- Follow that live guide for caller binding and capabilities. Inside the Coordinator's Orca terminal omit `--from`; otherwise use only a proven runtime-issued handle. `ORCA` below is a placeholder, not a shell variable. No guessed IDs, implicit installs/services, or substitute subagents.
- Resolve ticket/BOARD/role overrides. For implementation, use the matching `docs/roles.md` assignment, then the configured executor, then the known supported current Agent. QA gating uses `config.roles.qa.executor`; resolve conflicting role text before dispatch. Inherit model/effort unless Human explicitly overrides. Human roles remain gates.
- Inspect existing bindings before creating a Run. Do not steal another conversation's authority or overlap a live/unverifiable editor, including direct Economy edits. Uncertain/orphaned bindings require live recovery.

## Dispatch

For a new authorized run:

```text
ORCA orchestration run-create --objective "<ticket scope>" --json
ORCA orchestration worker-start --spec "<scoped spec>" --worktree current --agent <configured_agent> --json
```

Record returned Run/Task/Dispatch, placement, and worker bindings immediately. A ready receipt is the start evidence for WORKFLOW's Dispatch transitions (implementation/repair vs QA). On failed/uncertain start, preserve receipt and follow live recovery; never blindly relaunch.

Default: serial workers in current workspace, preserving pre-existing changes. Remote/new-worktree/parallel placement requires live placement guidance and disjoint ownership. A self-contained spec carries only:

```text
Ticket: <ID, body and BOARD paths>
Target: <workspace, owned files/area>
Change: <concrete outcome or read-only QA>
Constraints: <Mode, Keep, dependencies; preserve existing work; no commit/push>
Ownership: <role; no BOARD/state edits or children>
Acceptance: <observable criteria and verification>
Read: AGENTS.md, <role guide>, <ticket>
Report: actual evidence/failures; exact live preamble for worker_done
```

No full ticket/history copies. Same-context follow-ups carry defect/acceptance deltas plus enough scope for the Task contract; fresh workers get their minimal bootstrap. Never assume a new worker retains prior context or use ad hoc terminal typing instead of supervised dispatch.

## Wait and account

```text
ORCA orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 45000 --json
```

- Use rolling blocking waits, not rapid polls or relay-only Agent turns. Report meaningful changes or required progress updates, not every empty wait. After three empty waits, enumerate the scoped fleet and follow exact live next-action receipts.
- Process every Delivery message before ack. Reply to in-scope questions by message ID; escalate actual Human decisions. Match completion to the expected Task/Dispatch/outcome/evidence. Persist accepted Dispatch before routing; replay/stale reports cannot advance BOARD or consume another retry.
- Accepted implementation completion -> BOARD `review`, `Next=coordinator`. Transport success is not ticket Done; Coordinator reviews evidence without an automatic extra reviewer.
- Before ack, choose immediate same-role reuse, explicitly user-requested retention, or `worker-release --dispatch <id> --json`. Reuse only a proven settled Agent with valid context, never another QA role or an active/unverifiable editor. No speculative idle retention.
- Ack via `check --ack <delivery_id>` per live guide; continue until expected Dispatches settle. Timeout/heartbeat/enqueue/contact loss is not completion or cleanup authority.

Keep normal tool output to required IDs, outcome, evidence, warnings/errors, delivery IDs and recovery/next-action fields. Scope `worker-list` by Run; use supported `task-list --brief`. Read bounded transcript tails/cursors only for missing evidence, errors, or uncertain liveness—not after every success. Never truncate away messages that need processing or recovery authority.

## Repair and QA

Persist the per-ticket repair reservation before launch; reconcile uncertain launches without resetting it. Load live coordinator/recovery references only when reuse/retry is needed.

For a positively failed/stopped attempt, retry the same Task/failed Dispatch. Prefer its proven settled terminal for immediate same-role repair when safe:

```text
ORCA orchestration worker-start --task <task_id> --retry-of <failed_dispatch_id> --worktree current --terminal <proven_handle> --json
```

If reuse is unavailable or context invalid, use explicit placement plus `--agent <configured_agent>` instead of `--terminal`; do not combine them. After successful Worker settlement but failed review/QA, create a repair Task in the same Run/ticket and reuse the suitable settled Worker if still available. Never `--retry-of` a succeeded Dispatch, evade Orca's failure circuit breaker, or reset Acorn's shared budget.

QA defaults to a read-only AI check; passing QA proceeds to Coordinator Done without Human approval. An explicitly preserved legacy Human QA setting ends automation at `ready_for_qa`; later automatic repairs require explicit auto-resume. Use live recovery instructions for stop/abandon; `unverifiable` is not exited.

## Stop and finish

Pause/cancel immediately forbids new Dispatches. Load live messaging guidance and request an active worker checkpoint:

```text
ORCA orchestration send --to dispatch:<dispatch_id> --subject "Pause requested" --body "Stop new edits; preserve work; report a checkpoint using your live lifecycle contract." --json
```

Record `pausing` until settlement or proven stop. Enqueue alone is not acknowledgment; report uncertainty. A failed checkpoint after pause never triggers repair. No release/replacement/stop claim on timeout, no generic terminal close/reset. Preserve work and use only live recovery authority.

Before ending, resolve all `worker-list --run <run_id> --terminal-state reclaimable --json` results. Record final outcome, evidence, repair count and blockers. Cancelled is not Done; resume requires explicit permission and live checks, without a retry reset.
