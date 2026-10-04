# Worker

Load only for assigned implementation work.

## Entry and ownership

- With a live Orca preamble, use its exact lifecycle authority and checkpoint/question/completion commands. No invented IDs, child workers, or edits after `worker_done`. A pause preserves work and reports an incomplete checkpoint, never false success.
- Without that preamble, follow the automation recovery gate in `AGENTS.md` before selected-ticket edits.
- Apply `docs/development.md` when present; reuse it within valid context. Before adding/changing unrequested product wording, content, design, or functionality, present the concrete proposal and wait for Human input. Do not polish copy or widen scope on your own.
- Read the assigned ticket/session pick first. Follow `Read`, or consult the relevant `docs/code_map.md` area when useful. Search exact symbols/paths before opening whole files. Use an existing context index if helpful; do not install one for this task.
- Reuse unchanged guidance, ticket context, and source excerpts already available. Reread after changes or context loss; a new worker must load its own minimum context. Start with directly related files and widen only for a concrete dependency.

## Implementation

- Load installed Ponytail once per valid session context; fallback: `acorn/skills/ponytail/SKILL.md`. Load domain skills only when needed.
- Make the smallest working change within assigned scope and ownership. Preserve unrelated behavior, contracts, files, and pre-existing changes. Do not invent requirements or silently widen scope.
- Shared assets need one owner. Return cross-role dependencies as `Need / Owner / Why`; do not implement another role's area.
- Worker never edits BOARD/state, another ticket, or declares Done/QA pass. `confirm-only` means read-only contract/impact analysis.
- Behavior changes use `RED -> GREEN -> REFACTOR`: observe a relevant test fail before implementation, then make it pass. If test-first is inapplicable (pure docs/config, generated artifacts, environment-only work), state why.
- Run focused verification and necessary regression checks. Do not repeat unchanged passing checks unless new edits, risk, missing evidence, or acceptance require it. Retain failures and untested areas honestly.

## Return and stop

Return result + verification, including RED/GREEN or a justified exception. Add changed files, contract impact, blockers, or next action only when useful. Prefer a failure excerpt and report path over full logs; omit empty fields and repeated ticket text. Human summary: Caveman Ultra, usually 1-3 lines; preserve full evidence in the runtime report when needed.

Update CODE_MAP only for a stale or durably useful entry. Stop when assigned work and checks are complete; no extra polishing or commit without explicit authorization.
