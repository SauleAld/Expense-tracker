---
name: branch-workflow
description: Use whenever starting new feature work, creating a git branch, or asked to branch for a fix/update in this repo (expense-tracker-ai). Enforces the project's branch naming convention (<feature>-main for a new feature, <feature>-<update> for follow-up work), with the feature name always first, and the bank-sync exception.
---

# Branch workflow

This project has a strict git branching convention (also written into `CLAUDE.md`):

- New feature → `<feature-name>-main` (e.g. `data-export-main`)
- Update/follow-up work on an existing feature → `<feature-name>-<update-name>` (e.g. `data-export-pdf-fix`) — the feature name always comes first.
- Never create a branch that omits the feature-name prefix.
- Do not stack unrelated side branches on top of a feature branch; update branches branch off that feature's own branch.

## Exception: bank sync

All bank sync work (CSV import, review inbox, SimpleFIN sync server, category rules, and anything touching them) stays on the existing `feature-bank-sync` branch. Do not create side branches for it — check it out and commit there directly.

## When starting new work in this repo

1. Determine whether the request is a brand-new feature or an update to an existing one.
2. Determine the feature name — ask if it's ambiguous.
3. If it's bank sync, check out `feature-bank-sync`. Otherwise create/check out the correctly named branch per the rules above.
4. Confirm the branch you're on before making changes, and report it to the user.
