# Core Rules

These rules apply across the Acorn harness.

- Stay inside the confirmed request or ticket scope.
- Coordinator may route and adjust work within confirmed scope. Ask Human only for a real product/UX decision, destructive action, breaking contract/migration, permission, risky git action, or external dependency decision.
- Do not claim a command, test, Verify, or QA result that did not run.
- Do not commit, publish, deploy, or perform destructive actions unless explicitly authorized.
- Project knowledge and artifacts belong outside `acorn/`.
- External specs, plans, or planning/execution skills may support managed work, but they never replace the Acorn ticket/Board as source of truth or authorize dispatch, role-boundary bypass, QA bypass, or scope expansion. Treat them as references unless the selected ticket links them.
- Load only the Harness and project context needed for the current action.
- Reuse still-valid context; reload changed sources or lost context, not every handoff. New workers need their own minimal bootstrap.
- Search exact paths/symbols before bounded excerpts. Keep tool output to decisions, failures, IDs, and evidence needed next; retain errors/recovery actions and expand truncated output when correctness needs it.
- Prefer current-context work and proven same-role worker reuse over fresh agents. Another context must earn its cost through ownership, independence, or real parallel value. Never remove required QA or verification to save tokens.
- Start with the named or active file, then read at most `workflow.contextBudget.relatedFiles` directly related files by default.
- If more context or a wider implementation scope is needed, state why before expanding. Do not silently widen the work.
- When a ticket/session pick is already selected, do not explore unrelated ready work.
- Do not read archive, history, completed-ticket detail, or broad design docs unless the current task needs them.
- Stop at configured retry limits instead of looping.
- Never place secrets or sensitive project data into reusable Acorn Harness files.
