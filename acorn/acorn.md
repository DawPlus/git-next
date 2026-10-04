# Acorn

Acorn is the lightweight development harness for `git-next`. It provides a small default workflow and contracts for Humans and AI workers while loading as little context as practical. These are project-adjustable defaults, not a fixed team topology.

## Canonical Flow

`Request -> Coordinator Define -> Ticket -> Dispatch -> Worker -> Verify -> Completion Report -> Coordinator Review -> QA -> Done`

Same-scope defects loop through repair and Coordinator Review. Separate work is classified as a new request. Human interruption is reserved for real decisions, authorization, or configured QA.

## Boundary

Harness:
- `AGENTS.md`: minimal entry/router.
- `acorn/workflow/`: canonical lifecycle.
- `acorn/agents/`: Coordinator, Worker, and QA behavior.
- `acorn/orchestration/`: transport and optional adapter contracts.
- `acorn/rules/`: constraints and recovery.
- `acorn/skills/`: core skills (`brain`, `caveman`, `ponytail`) and installed domain skills. Brain turns Human intent directly into project-owned tickets and BOARD rows; it does not execute them.
- `acorn/config.json`: configuration. Human-facing role names may be capitalized; persisted executor values use lowercase. `roles.qa.executor` defaults to `agent`; legacy `human` and `off` remain explicit project overrides. AI QA passes -> Done without Human approval; automatic repair defaults to one additional attempt. Projects should set focused verification commands in `validationCommands` when known.
- `acorn/state.json`: compact recovery cache, not workflow truth. Board `State` is authoritative; `state.phase` only caches the current workflow step. `activeTicket: null` means idle; `next` mirrors the lowercase configured executor/role value from Board `Next` or is null. Revalidate it against project truth before use.

State cache fields (written by Coordinator; status/handoff display verification and QA):
- `classification`: last request size (`quick`, `minor`, `feature`, `major`), or null while idle.
- `agentVerification`: `pending`, `passed`, `failed`, or `partial`; reflects recorded verification evidence, never inferred success.
- `qa`: `pending`, `passed`, `failed`, or `off`; `off` only when configured. Human QA requires an actual Human result.
- `updatedAt`: ISO timestamp of the last cache update, or null before use.

Ticket bodies follow existing project conventions first; `config.ticketBodyPath` supplies the fallback path with `{ID}` substitution. Communication/coding discipline and classification rules live in the entrypoint/workflow, not duplicate config switches.

Project-owned:
- tickets, contracts, decisions/memory, QA artifacts, requirements, EOD, and domain documentation.

Do not read this file every session. `AGENTS.md` is the normal entrypoint.
