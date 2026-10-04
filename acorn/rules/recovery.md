# Recovery

Use after interruption, stale context, repeated failure, or nonterminal/uncertain automation.

1. Read `acorn/state.json`.
2. Read `ticketBoardPath` from `acorn/config.json` and verify any active ticket against that project board.
3. Before selecting an executor, reconcile missing or terminal (`done`/`superseded`) active tickets and conflicting `next` values; trust the project SSOT. A missing Board row may have been archived: resolve only that ID's archive record under `acorn/workflow/tickets.md`, never scan all history or infer completion from absence. Never resume work solely because the cache names it.
4. Coordinator rebuilds the cache from project truth. If no active managed work remains, clear `activeTicket`, `classification`, `phase`, and `next`; reset `agentVerification`/`qa` to `pending` and refresh `updatedAt`. Never infer another active ticket. Preserve automation bindings and repair counts until live worker outcomes are settled; a terminal BOARD row does not prove worker termination.
5. Load the role named by the revalidated next executor only when work remains, then only linked project context needed to continue.
6. Treat handoff and state as continuation caches, never project truth. `status`, `handoff`, and `doctor` diagnose stale state without rewriting it.

Before any direct edits or Dispatch, reserve ownership for live/unverifiable workers; Economy fallback never bypasses this gate. Read-only inspection and settlement remain allowed. For an Orca automatic run, also load `acorn/orchestration/orchestration.md` and its adapter. A saved `automation` record cannot authorize execution. Require explicit Human auto-resume after pause, cancellation, interruption, or a Human gate; inspect live Orca bindings before any new Dispatch. Preserve repair counts and reserve ownership while worker liveness is unknown. Never create a fresh Run to bypass retry limits or duplicate a possibly active worker.

For failures, reconcile ticket `repairs_used` with cached `repairsUsed` using the higher count; default automatic repair budget is 1. Preserve prior attempts and any explicit Human-granted allowance. Resume after exhaustion only with an agreed correction and a recorded additional allowance. Isolate the first relevant cause. Do not repeat the same attempt beyond `workflow.maxAgentRetries`; return the evidence and smallest next recovery action to Human/Coordinator.
