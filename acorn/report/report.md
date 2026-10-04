# Report

Report is the final Human-facing summary produced after a manual run or orchestration run.

Keep it Caveman Ultra. Default to 1-3 short lines.

Usually report only:
- result;
- verification;
- next action only when the Human must do something.

Do not list files, implementation detail, or workflow metadata unless the Human needs them. Detailed evidence belongs in structured workflow state when available.

Example:
`완료. npm test·AI QA 통과.`

For `confirm-only`, report only the confirmed contract/impact, unresolved items, verification status, and next action.

Expand only when the work needs more evidence. Never hide failed, partial, or unrun verification.

Do not repeat Agent chatter, full logs, or implementation narration.

When blocked after the repair budget, report expected result, actual failure, attempted fix, remaining cause candidates, and needed Human help. Do not ask for routine final approval after passing QA.

EOD/history handling belongs to `acorn/workflow/closeout.md` and the project-owned `docs/eod/` guidance.

This file defines the report format only. Actual project reports belong to the project-owned documentation area outside `acorn/`.
