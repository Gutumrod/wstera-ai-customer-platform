# Task CI-001 — Run CI on stacked pull requests

**Status (2026-10-23):** The pull-request CI trigger change from PR #12 is merged on `main` via PR #16 (`857b2e5`). The consolidated candidate's `typescript-foundation` check passed on reviewed head `19288ec` (run `39840363749`).

## Problem

The CI workflow restricts `pull_request` events to branches targeting `main`. G1 PRs are intentionally stacked, so PRs targeting another feature branch receive no hosted check.

## Change

Remove the `pull_request.branches` filter so the existing foundation job runs for every pull request. Keep `push` restricted to `main`, preserve read-only token permissions, and keep the existing `npm ci` plus `npm run check` job.

## Acceptance

- The workflow syntax remains valid.
- Pull requests targeting `main` and feature branches both trigger `typescript-foundation`.
- Push CI remains limited to `main`.
- No deploy, write permission, paid service, or product runtime change is introduced.

## Verification limits

The updated workflow can be fully observed on stacked PRs only after this workflow change is merged to the default branch. Local tests cannot prove GitHub event trigger behavior; Owner merge remains a gate.
