# CLAUDE.md

Instructions for Claude Code when working in this repository.

## Branching Convention

- Every new feature gets its own branch, named after the feature.
- **Main feature branch:** `<feature-name>-main` (e.g. `data-export-main`)
- **Update/follow-up branches** for that same feature: `<feature-name>-<update-name>` — the feature name always comes first, followed by a short name for the update (e.g. `data-export-pdf-fix`, `data-export-add-json`).
- Do not create a branch that omits the feature-name prefix.
- Do not stack unrelated side branches on top of a feature branch — updates to a feature branch off of that feature's own branch, using the naming pattern above.

### Exception
Bank sync work (CSV import, review inbox, SimpleFIN sync server, category rules, and anything touching them) stays on the existing `feature-bank-sync` branch — no side branches for it, per prior agreement with the user.

## Testing & Verification

After every change or new feature, before calling the work done:

1. **Write tests** for all new or changed behavior (`*.spec.ts` next to the code; server code under `server/`).
2. **Run the tests and make sure they all pass** — `npm test -- --watch=false` for the app, and `npm run server:test` (plus `npm run server:check`) when server code changed. Fix any failures, including pre-existing ones the change touches.
3. **Build the app** with `npm run build` and fix any errors.
4. **Run the app** (`npm start`, and `npm run server` if the sync server is involved) and check that the changed features actually work in the running application.
5. If anything fails at any step, fix the issue and repeat from step 2. Report the final test/build results honestly.

## Commit & Push

At the end of each code change — once tests pass, the build succeeds, and the app has been verified — commit the work and push it to the branch for that feature/update (e.g. `data-export-pdf-fix`, or `feature-bank-sync` for bank sync work). Use `git push -u origin <branch>` the first time a branch is pushed. Never commit or push directly to `main`.
