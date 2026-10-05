# Git Next Manual Smoke Test

Use this after installing the packaged VSIX in an Extension Development Host or a clean VS Code profile.

## Header and sidebar

- [ ] Top header shows icon-only Graph / AI / Refresh / Tools / Help.
- [ ] Tooltips and aria labels match each icon.
- [ ] Tools opens exactly 9 top-level entries.
- [ ] No old More menu or standalone AI History / Remote / Branch Compare buttons remain.

## Source Control

- [ ] Changed files render and open diffs.
- [ ] Stage / Unstage one file works.
- [ ] Stage All / Unstage All works.
- [ ] Commit input creates a commit from staged files.
- [ ] Commit message helper opens beside the Commit area.
- [ ] Partial Commit guidance opens VS Code Source Control guidance.

## Branch

- [ ] Local and Remote columns render separately.
- [ ] Tracking pairs show a connector and animated signal.
- [ ] Reduced-motion preference disables the signal animation.
- [ ] Remote-only branch can create a local tracking branch.
- [ ] Compare and Merge actions work from the Branch workspace.
- [ ] Remote settings opens and returns to the Branch workspace.
- [ ] Cleanup candidates can be reviewed without deleting anything until confirmation.

## Recovery and safety

- [ ] Recovery exposes Undo, Reflog, and Conflict / in-progress recovery.
- [ ] Merge/Rebase/Cherry-pick/Revert in-progress state exposes Continue / Abort guidance.
- [ ] Protected branch actions show stronger warnings.
- [ ] Destructive actions still require explicit confirmation.

## AI

- [ ] AI header icon opens diagnosis.
- [ ] Provider-off state fails gracefully with guidance.
- [ ] Configured provider returns diagnosis cards.
- [ ] Guide and Guided Practice open from diagnosis.
- [ ] Rescue routes through Git Next actions and confirmation safeguards.
- [ ] Diagnosis history opens and restores a previous diagnosis.

## Sync and graph

- [ ] Pull / Push show current upstream relationship.
- [ ] Ahead / Behind / Diverged states render correctly.
- [ ] Graph opens, refreshes, filters, and selects commits.
- [ ] Commit detail opens changed files and before/after diff.

## Packaging sanity

- [ ] Install the generated VSIX successfully.
- [ ] Extension activates from the Git Next activity-bar icon.
- [ ] README, CHANGELOG, LICENSE, assets, package.json, and dist are present.
- [ ] Development-only acorn/, docs/, src/, test/, scripts/, .superpowers/, and AGENTS.md are not packaged.
