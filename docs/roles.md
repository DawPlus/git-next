# Project Role Overrides

Optional project-only role map. Keep only differences from Acorn defaults.

Rules:
- project override wins over Acorn default;
- `acorn/config.json` → `roles` registers role names and guide paths for CLI validation. Register a new BOARD role once, e.g. `"frontend": { "guide": "acorn/agents/worker.md" }`; do not duplicate its ownership or assignment there;
- this file owns project implementation assignments and path ownership. Changing who does FE/BE work only changes this file; it does not require changing the registered role or Acorn's worker guide. A matching entry overrides a legacy config executor; otherwise keep the configured default;
- QA is a workflow gate: `config.roles.qa.executor` defaults to `agent` (AI); legacy `human` and `off` remain explicit project overrides. Do not repeat or override that gate here. A conflicting QA entry must be reconciled before dispatch, never silently used to bypass Human QA;
- read only the matching role entry for current work;
- each role owns only its listed paths/area;
- do not cross into another role's owned area;
- cross-role work returns to Coordinator for a separate ticket or explicit handoff;
- shared files/contracts need one explicit owner before edits.

No project overrides are active in this template. The fenced example below is illustrative only: never infer assignments, ownership, or registered roles from it.

Example (inactive):

```text
frontend -> executor: agent | owns: src/**
backend  -> executor: agent | owns: server/**
tester   -> executor: agent | owns: test/**
shared   -> coordinator decides owner
```

Delete the example and define only roles this project actually uses. Write active entries outside code fences as `name -> ...` (optional list prefix; `→` also accepted). Doctor warns about unregistered names in that format, ignoring fenced examples; other prose formats are not validated.
