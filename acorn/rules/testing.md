# Test Execution Strategy

This is an Acorn Kit operating rule, not a project ticket.

## Purpose

Keep development feedback fast without skipping final verification. Test depth increases with the scope of completion.

## 1. During Development

Run only the tests directly related to the code being changed.

- Prefer the smallest relevant test target.
- Do not run the full suite after every small edit.
- Re-run focused tests while iterating until the change is stable.

## 2. When a Ticket Is Completed

Run tests covering the ticket's affected behavior and nearby integration surface.

- Verify the ticket acceptance criteria.
- Include regression tests for directly affected modules or flows.
- Expand beyond focused tests only when the change has broader impact.

## 3. Before Final Integration

Before merge, release, or another final integration checkpoint, run the full project verification.

- Full test suite
- Build
- Project-required static or consistency checks
- Any release-specific verification required by the repository

## Principle

Use the narrowest useful verification while developing, then increase verification scope as work approaches completion.

Focused while editing. Impact-based when closing a ticket. Full verification before integration.
