---
description: Create a new feature or update branch following this repo's naming convention
---

Create a new git branch following the convention in CLAUDE.md.

Arguments: $ARGUMENTS

- If given one argument (a feature name), create `<feature-name>-main` off of `main` and check it out.
- If given two arguments (a feature name, then an update name), create `<feature-name>-<update-name>` off of the existing `<feature-name>-main` branch and check it out. If `<feature-name>-main` doesn't exist yet, ask before picking a base.
- Exception: if the feature is bank sync (CSV import, review inbox, SimpleFIN sync, category rules, or anything touching them), do NOT create a new branch — check out the existing `feature-bank-sync` branch instead.
- Refuse to create a branch name that omits the feature-name prefix.
- After creating the branch, run `git branch --show-current` to confirm, and report the branch name back to the user.
