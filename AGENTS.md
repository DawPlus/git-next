# git-next Agent Guide

Installed by Acorn.

## Start

Read this file first. Reuse unchanged guidance within valid session context; reload after edits or context loss. Do not preload `acorn/` or project docs.

Route from the user's current request and load only what that route needs:
- if `docs/roles.md` exists and the current work uses project-specific roles, read only the matching role entry; project implementation assignments/ownership override Acorn defaults. QA gating remains `config.roles.qa.executor`; resolve a conflicting QA entry before dispatch.
- normal question -> answer normally; no workflow state needed.
- tiny/local/low-risk change -> Quick: use the relevant `docs/code_map.md` area or local context index when useful, read only directly related files, change, focused verify, report. No ticket by default.
- work with coordination/risk or unclear classification -> `acorn/workflow/workflow.md`, then Coordinator.
- explicit Human request to automatically dispatch/supervise named tickets in Orca -> Coordinator plus `acorn/orchestration/orchestration.md`; ticket selection alone never enables automation.
- explicit ticket/session pick -> read that project-owned ticket, then the assigned worker guidance.
- returned worker completion report -> Coordinator review, AI QA, then Done without routine Human approval; use WORKFLOW for the shared one-repair default and Human escalation.
- continue/resume -> revalidate `acorn/state.json` against the configured ticket board, then load only the active ticket/role.
- explicit closeout request such as "문서정리 후 마무리" -> `acorn/workflow/closeout.md`; if the close target is ambiguous, ask instead of guessing.
- interrupted/repeated failure -> `acorn/rules/recovery.md`.
- Acorn system/config question -> `acorn/acorn.md` or `acorn/config.json` only as needed.

Discipline and optional routing:
- implementation/refactor/code review, including Quick -> if `docs/development.md` exists, read it once per valid context; it owns project coding style and approval boundaries for product changes.
- Human communication/reporting -> Caveman Ultra required; use installed skill or `acorn/skills/caveman/SKILL.md`.
- code Build/refactor/review -> Ponytail required; Worker owns loading with `acorn/skills/ponytail/SKILL.md` fallback.
- explicit `@acornBrain` or idea-to-ticket planning -> `acorn/skills/brain/SKILL.md`; Brain clarifies only blocking ambiguity and publishes project-owned tickets directly.
- Coordinator/planning/review -> `acorn/agents/coordinator.md`; load `acorn/philosophy.md` only when planning depth or operating principles affect the decision.
- implementation -> `acorn/agents/worker.md`
- QA -> `acorn/agents/qa.md`
- final user summary -> `acorn/report/report.md`
- always-applicable constraints when needed -> `acorn/rules/core.md`
- installed domain knowledge -> matching `acorn/skills/<name>/SKILL.md`
- project knowledge/memory/artifacts -> relevant project-owned docs/source outside `acorn/`

## Core Rules

- Natural language is the primary interface. Do not require the user to learn Acorn CLI commands.
- Treat post-completion feedback as a new request: classify before ticket creation, link related history only when needed.
- Keep Quick work ticketless by default; use `acorn/workflow/workflow.md` for detailed classification/escalation.
- Human and Agent are interchangeable executors. Treat Acorn roles as responsibilities, not fixed people or models; follow project-owned/configured assignments when they differ from defaults.
- Role boundaries are hard ownership boundaries. An assigned role must not implement another role's owned work; return cross-role needs to Coordinator.
- Do not scan directories or load unrelated Acorn/project docs by default.
- Do not preload ticket history, EOD history, or unrelated state.
- Revalidate cached state against project truth before resuming.
- Before selected-ticket edits/resume, check existing `acorn/state.json`; nonterminal/uncertain automation routes to Coordinator + `acorn/rules/recovery.md` (dispatched workers follow their live preamble).
- Do not commit or publish unless the user explicitly asks.
- Preserve product wording/content and requested scope. Propose unrequested additions/changes and wait for the Human's answer before applying them; already approved work needs no repeated approval.
- Verify with the smallest useful check and report failures or untested areas honestly.
- Keep project documentation outside `acorn/`; project role overrides belong in `docs/roles.md`.
- Use lowercase filenames for new project documents; preserve tool-required names such as `AGENTS.md` and `SKILL.md` and existing project paths.

Make the smallest useful next move.
