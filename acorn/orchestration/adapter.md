# Adapter Contract

Acorn's automatic conversation transport is [the Orca adapter](./orca.md). Load it only after explicit Human authorization under [orchestration.md](./orchestration.md). Economy remains the default; no standalone Acorn CLI runner is provided.

## Dispatch

The project ticket owns scope and acceptance.

- Economy: carry ticket/session pick and an optional one-line Human instruction. The receiver reads the ticket.
- Orca: derive the adapter's compact, self-contained Task spec with Target, Change, Constraints, Ownership, and observable Acceptance, plus the ticket path. This is the execution boundary; do not duplicate the full ticket or conversation history.

Never broaden ticket scope or authorize another ticket through a worker prompt. Role overrides and `confirm-only` remain binding.

## Completion

Return result and actual verification evidence. Include changed files, blockers, contract impact, untested areas, and next action only when relevant.

Orca workers must use their exact live preamble to send `worker_done` with explicit outcome and Task/Dispatch authority. A prose summary is not lifecycle settlement. Human-facing reports stay compact; the runtime report retains the evidence required for review.

Adapters do not change the Acorn lifecycle. Coordinator reviews completion, owns BOARD/state, and routes required QA. No adapter or Worker declares the ticket Done on its own.
