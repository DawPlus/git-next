# Acorn Brain

Purpose: Turn a product or engineering idea into the smallest useful Acorn ticket set before implementation.

Load this skill when the Human explicitly invokes `@acornBrain`, asks to plan a feature before coding, or wants an idea converted into executable tickets.

## Boundary

Brain plans and publishes project-owned tickets. It does not implement code, choose a runtime executor, or manage execution state after ticket creation.

The project must already have Acorn Kit installed. Before planning, confirm these project contracts exist:
- `acorn/config.json`
- the configured ticket board, normally `docs/tickets/board.md`

If they are missing, stop and tell the Human to install or repair Acorn Kit instead of inventing a parallel structure.

## Planning Depth

Use the lightest path that preserves correctness.

- Small and clear: create the ticket directly.
- Ambiguous: ask only questions that block safe planning.
- If the Human says “알아서”, “use your judgment”, “just handle it”, or equivalent, stop preference questions, choose conservative defaults, and record only material assumptions.
- Large or architectural: settle only decisions that materially affect execution, then split work only where tickets have independent outcomes or verification boundaries.

Do not force a PRD, design ceremony, or separate WORK document.

## Planning Flow

1. Identify the Human's actual outcome.
2. Inspect only the minimum project context needed to plan accurately.
3. Define scope, constraints, acceptance, verification, and real dependencies.
4. Split only when independent execution or verification makes the split useful.
5. Publish compact ticket Markdown into the project's existing ticket body location. When no location is established, use config `ticketBodyPath` (fallback `docs/tickets/active/{ID}.md`), replacing `{ID}` with the ticket ID and creating the parent directory. If the configured BOARD links ticket bodies (for example an `active/` directory), follow that convention.
6. Register each ticket in the configured BOARD without changing its header or column order.
7. Stop. Coordinator/Worker/QA own execution from there.

## Ticket Contract

Use the project's ticket ID convention. The default is `T-YYMMDD-NN`, with `NN` reset to `01` each day.

Initialize dates and `repairs_used` under `acorn/workflow/tickets.md`. Preserve existing project metadata formats; new tickets use its compact front matter. Do not copy the example timestamp.

Each ticket should be compact:

```md
# T-YYMMDD-NN — Short title

## Goal
One outcome.

## Do
- Required work only.

## Keep
- Only constraints that are not obvious from the project.

## Done
- Observable acceptance conditions.

## Role
worker

## Read
- Optional: best 1-2 starting files or Code Map area.

## Depends
- Optional: blocking ticket IDs only.
```

Omit `Keep`, `Read`, and `Depends` when they add no value. Add extra detail only for real ambiguity, safety, migrations, shared contracts, or verification requirements.

## BOARD Publishing

For each created ticket:
- add one row using the existing BOARD header and column order;
- adapt to the columns the project already owns instead of inventing a second schema;
- use `ready` when the ticket can start now;
- use `blocked` only when a real dependency or Human decision prevents start;
- populate `Next` and any existing ownership column such as `Role` or `Area` using the project's current responsibility names;
- populate optional columns such as `Mode`, `Read Budget`, `Links`, `Body`, `QA`, and `Notes` only when those columns already exist;
- when a `Body` column exists, link the ticket body using the BOARD's existing relative-path convention;
- use `implementation` and `1+2` only when the BOARD has `Mode` and `Read Budget` columns;
- keep notes short.

Never replace, reset, reorder, or normalize an existing BOARD merely to match the default Acorn schema.

## Context Compression

Pass decisions, not conversation history.

Prefer exact requirements, durable decisions, relevant entry points, required interfaces, and the minimum dependency context. Do not preload broad docs, unrelated tickets, archives, raw logs, or the whole repository.

## Stop Condition

Brain is done when the created ticket set lets an executor begin without re-deciding product intent, scope, completion criteria, or known blocking dependencies.
