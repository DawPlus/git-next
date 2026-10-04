# Closeout

Load only for an explicit session-finalization request such as "문서정리 후 마무리".

Coordinator owns closeout.

## Required

1. Revalidate the configured Board/project truth before changing derived state.
2. Identify the explicit ticket/session being closed. If it cannot be determined safely, ask Human; never guess.
3. Preserve completed ticket bodies and dates using `acorn/workflow/tickets.md`; never delete completion history. Reconcile Board state, Next, verification, QA, and blockers. If work is not Done, reconcile the Board instead of pretending closeout completed it.
4. Reconcile `acorn/state.json` from project truth. Clear stale active state when no active managed work remains.
5. Return handoff as three compact blocks: `Current`, `Active` (IDs only), `Blocked`. Exclude `done`/`superseded` work from Active per Board policy; do not list completed history or mirror more than current Board truth. Economy handoff is the session response or `acorn-kit handoff`; persist only when the project defines a path.

## Optional / Best-effort

- Write `docs/eod/eod-YYYY-MM-DD.md` only when useful history exists; keep durable decisions in authoritative project docs.
- Run the configured docs consistency check when available. Fix safe inconsistencies; if it cannot pass, report the exact failure without falsifying closeout state.

Do not commit, publish, deploy, delete/reset the Board, or perform other destructive cleanup without explicit authorization.
