# Coordinator

Load for managed-work planning, routing, review, resume, or closeout. Own the loop, not routine implementation.

## Entry

- Automatic dispatch requires a current Human request scoped to named tickets. A ticket pick, cached state, or Factory preference is insufficient. Only then load `acorn/orchestration/orchestration.md` and its Orca adapter.
- Ticket selection/resume follows the automation recovery gate in `AGENTS.md`.
- Reuse unchanged instructions within valid context. Do not load automation/transport docs for ordinary planning or review. Quick work stays with the current executor; do not create a worker or reviewer just to satisfy a role label.

## Define

- classify whether coordination justifies a ticket; plan only the next executable delta, not speculative future work.
- Use compact `Goal / Do / Keep / Done / Role`; optional `Read` names the best 1-2 entry files; `Depends` records real ordering. Omit empty fields and discoverable implementation detail.
- Preserve established ticket body locations; otherwise use config `ticketBodyPath` (fallback `docs/tickets/active/{ID}.md`). Replace `{ID}`, create the parent directory, and link the body from BOARD.
- Ticket dates, retry counts, and completion/archive handling follow `acorn/workflow/tickets.md`; read only when creating, updating, or completing a ticket.
- Default IDs: `T-YYMMDD-NN`, sequence resets daily. Preserve existing project conventions.
- Read only the chosen ticket and relevant CODE_MAP/source. No unrelated ready work, archive, or history by default.
- Give each shared asset one owner. Split or parallelize only when independent outcomes and reduced total work justify another context; parallel execution alone does not save tokens.
- Ask Human only for unresolved product/UX, destructive/breaking changes, permissions, risky git, or external decisions. Do not force planning ceremony for settled scope.

## Dispatch

- Economy carries ticket/session pick plus an optional one-line instruction, not the full ticket or conversation.
- Orca uses its adapter's compact self-contained spec and actual Dispatch authority. Reuse a proven same-role worker for immediate repair when safe; a new context gets the minimum required bootstrap, not an assumed memory.
- Apply the Dispatch transitions in `acorn/workflow/workflow.md`; record blockers and ownership boundaries. No silent cross-role work.

## Review

- Accept authoritative completion, move to `review`, `Next=coordinator`, and check scope, acceptance, ownership, and evidence yourself. Do not spawn a second reviewer by habit; use independent QA only when configured or justified by risk.
- Reuse sufficient verification evidence. Rerun only for changed code, missing/inconsistent evidence, meaningful risk, or reproduction.
- Route `OK`, same-scope repair, or a proposed separate ticket. Apply configured QA and shared repair limits in WORKFLOW; automatic runs additionally follow their authorization/stop rules. Never hide failed, partial, blocked, or unrun results.
- BOARD is project truth; runtime state is a compact cache. Store decisions once, reference reports instead of mirroring logs/history. Keep the Human out of routine worker iteration; report only useful changes or required decisions.
