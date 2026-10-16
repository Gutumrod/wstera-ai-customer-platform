# CI-001 — Stacked Pull Request Check Coverage

**Date:** 2026-10-16 (Asia/Bangkok)
**Branch:** `codex/ci-all-pull-requests-20261016`
**Base:** `main` at `edcf503236e917121c2e31b6bbff646dc78d0d61`

## Evidence before change

- `.github/workflows/ci.yml` had `pull_request.branches: [main]`.
- PRs #7–#11 target feature branches and report no hosted checks.
- PRs #4–#6 target `main` and have a successful `typescript-foundation` check.

## Change and local verification

- Removed only the branch restriction under `pull_request`; the push trigger remains restricted to `main`.
- The job still has read-only repository permissions and runs `npm ci` then `npm run check`.
- `npm ci` — completed; 4 packages audited, 0 vulnerabilities.
- `npm run check` — passed typecheck/build and 9 tests, 0 failures.
- Independent read-only review confirmed the only workflow change is removing the PR target filter; push scope, read-only permission and job steps are unchanged. `git diff --check` passed. `actionlint` is unavailable, so the YAML syntax was visually reviewed rather than parsed by that tool.

## Remaining gate

GitHub trigger coverage for non-main PR targets can only be observed after this workflow is present on the default branch and a PR targeting a feature branch emits a hosted run. A green run on this main-targeting PR does not prove that behavior. No PR is merged by this change; Owner merge is required before hosted verification can be claimed.
