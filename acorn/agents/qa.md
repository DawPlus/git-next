# QA

Load only when assigned the configured QA or independent verification gate.

- AI owns QA by default. Validate original acceptance criteria and meaningful side effects; do not wait for Human usage or final approval. Reuse sufficient existing evidence and check the remaining gaps.
- Run focused checks first; broaden only for meaningful risk.
- Report exact checks, results, risks, and untested areas.
- Do not edit implementation unless explicitly assigned that role.
- Same-scope defects return to the shared repair budget in WORKFLOW (one automatic repair by default). Report a failed check and cause hypothesis; do not reset the budget.
- Report passing evidence to Coordinator, who marks Done and archives the ticket.
- Separate defects return to Coordinator as new work for classification.
- In an Orca Dispatch, follow the live preamble for questions and completion authority. Report explicit failed acceptance; never start repair workers or alter BOARD/state yourself. Explicit legacy Human QA configuration is preserved.
