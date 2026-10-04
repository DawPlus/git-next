# Workflow

Canonical managed-work lifecycle:

`Request -> Coordinator Define -> Ticket -> Dispatch -> Worker -> Verify -> Completion Report -> Coordinator Review -> QA -> Done`

Quick work may use `Request -> Change -> Verify -> Report` with no ticket.

Automatic dispatch and repair supervision require a current explicit Human request scoped to named tickets. In Orca, load `acorn/orchestration/orchestration.md` and its adapter; ordinary ticket picks and `transport.default` do not authorize automation. The conversation Agent coordinates the loop; no standalone Acorn CLI runner exists.

## Request / Ticket Decision

All requests, including post-completion bugs, improvements, and usage feedback, enter here. Classify before creating a ticket; Human usage/approval is not a stage of the default completion cycle.

Classify by coordination value, not ceremony:
- `quick`: tiny, local, low-risk -> no ticket.
- `minor`: use a ticket when another role/shared asset is involved or acceptance is unclear; otherwise treat it like Quick.
- `feature` / `major`: managed work; ticket by default.

Escalation signals: cross-role ownership, dependency, schema/migration, config, shared/risky assets, broad file impact, or unclear acceptance.

## Coordinator Define

Coordinator owns scope, routing, dependencies, acceptance, and unresolved decisions.
- Select only the Worker roles required by the work.
- Write the ticket as a compact source-of-truth work record: `Goal / Do / Keep / Done / Role`; add `Depends` only when required.
- Follow `acorn/workflow/tickets.md` for ticket dates, repair counts, and archival; keep fields short and omit repeated Harness rules or discoverable implementation detail.
- Give each shared asset/contract one responsible role.
- Ask Human only for ambiguous product/UX, destructive actions, breaking contracts/migrations, permissions, risky git, or external decisions.
- Do not design speculative implementation details.

## Dispatch / Worker

Dispatch one scoped ticket/session pick. Economy carries only the ticket/session pick plus an optional one-line instruction; the Worker reads the referenced ticket as source of truth. Authorized Orca dispatch uses `acorn/orchestration/adapter.md` and the Orca adapter for payload and readiness evidence.
Coordinator marks implementation/repair `State=in_progress`, `Next=<assigned worker role>` only once work starts: Worker pickup in Economy, or a ready receipt in Orca. Preparing a prompt or an uncertain/failed launch is not a start. QA dispatch keeps `State=ready_for_qa`, `Next=qa`.
Worker:
- stays inside scope and ownership;
- for behavior-changing implementation, follows `RED -> GREEN -> REFACTOR`: add/update the smallest relevant test, observe the expected failure, implement the minimum passing change, then refactor only when useful;
- skips test-first only when it is not meaningfully applicable and records why;
- makes the smallest working change;
- routes cross-role/out-of-scope dependencies back to Coordinator;
- runs focused verification and relevant regression checks;
- returns a compact Completion Report with TDD evidence when applicable.

## Verify

Run the smallest useful checks for the changed scope. Never invent PASS.
A same-scope failure permits one automatic repair by default: initial implementation + one repair = at most two implementation attempts. `workflow.maxAgentRetries` counts additional repairs; missing defaults to 1, zero permits none, invalid/negative/non-integer values block execution. Verification, review, and QA share this budget. Record `repairs_used` on the ticket before starting each repair; preserve it across role/session/Task changes and recovery.

Retry only with a concrete cause hypothesis and correction. Missing access/environment or no useful hypothesis -> block immediately rather than spending the repair. On exhaustion, set `blocked`, `Next=human`; report `expected / actual failure / attempted fix / remaining cause candidates / help needed`. Human and Agent diagnose together. Resume only after an agreed direction and explicit additional repair allowance recorded on the same ticket; never reset prior counts. Orca additionally requires ticket-scoped auto-resume authorization.

## Coordinator Review

Coordinator reviews the Completion Report against scope, acceptance, contracts, ownership, and verification evidence. Worker does not change Board/state; Coordinator moves returned managed work to `review` with `Next=coordinator`.
- accepted -> `ready_for_qa`, `Next=qa`; AI performs QA, then Coordinator marks Done on passing evidence.
- Explicit legacy project overrides remain supported: QA `off` skips this gate, QA `human` waits at `ready_for_qa`, `Next=human`. Neither is the new default; do not silently change preserved config.
- same-scope defect -> repair on the same ticket and review again.
- separate/new work -> create or propose a follow-up ticket, then dispatch it through the same lifecycle.
- Human decision required -> block and ask only that decision.

## QA

Default `roles.qa.executor=agent`: AI validates original acceptance criteria and meaningful side effects, reusing sufficient evidence and adding only missing checks. A QA role does not require spawning another Agent; a fresh verification pass is enough unless risk or the authorized adapter requires independent execution.

Human final approval and open-ended real-world usage are not default acceptance gates. Done means the agreed, AI-verifiable scope passed, not that future defects are impossible. Report checks not run; never convert an observed failure or an unverified required acceptance condition into PASS.
- same-scope failure -> repair loop on the same ticket.
- separate issue or post-Done feedback -> Request classification; use Quick when eligible, otherwise a new linked ticket. Do not reopen completed work by default.

## Done

After required gates pass:
- mark managed work done without waiting for Human approval;
- timestamp and archive the complete ticket under `acorn/workflow/tickets.md`; never delete its history;
- keep project truth/continuity artifacts consistent;
- report the result compactly.

Done never authorizes commit, push, publish, deploy, or unrelated work.

Closeout is a separate explicit session-finalization intent. Load `acorn/workflow/closeout.md` to reconcile Board/project truth, state, compact handoff, selective EOD, and docs consistency.
