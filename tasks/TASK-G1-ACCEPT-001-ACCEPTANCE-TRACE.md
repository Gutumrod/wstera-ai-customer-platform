# Task G1-ACCEPT-001 — One-shop acceptance trace

**Status: PLANNED — last G1 task; starts only after HOST-004, PR #23, HOST-002, WEBCHAT-001 and HANDOFF-002 are merged and the Owner has given the `wstera-lab` write GO.** Base: `main` @ `9b4f997`. Runs on schema `aicp` in `wstera-lab`; Docker Desktop was withdrawn by `D-20261025-11`.

## Goal

Produce one reproducible browser/E2E trace from authenticated knowledge upload through cited visitor answer, durable handoff and staff resume, plus negative cross-workspace cases — on synthetic data only.

## Scope

- Use `wstera-lab` with `APP_ENV=lab` once HOST-004 makes lab mode start and the Owner GO exists; seed only synthetic data. `scripts/seed-local.mjs` is local-only at `9b4f997`, so HOST-004 or this task must provide a guarded lab seed.
- **Second workspace fixture**: extend the seed (or add a test-only script) with a second synthetic workspace, owner and web connection so cross-workspace denial is testable for real. Do not weaken the single-owner default for normal local use.
- Run the full flow and capture evidence: upload FAQ/PDF/CSV → review → approve → Thai question → cited extractive answer → handoff request → staff claim → staff reply → authorized resume.
- Negative cases: visitor from workspace B cannot read workspace A; forged connection id; revoked membership mid-session; provider-flag-off assertion.
- Record observed values only: test counts, latency P50/P95 where measurable, and the commands used. No cost estimate presented as a measurement (provider is off).

## Out of scope

Hosted deployment, real customer data, live model/provider, LINE, payment, pricing, production migration.

## Acceptance

- Evidence directory with raw logs/SQL/browser trace, reproducible by command, not screenshots alone.
- Every acceptance criterion in `plans/PLAN-G1-WEB-RAG-MVP.md` mapped to an evidence artifact or explicitly marked `NOT RUN`.
- Independent reviewer and Owner review the evidence before any "G1 accepted" claim. `BUILD_PASS != PRODUCTION_READY != LIVE_PROVEN != OPERATED_STABLE`.

## Stop conditions

- If the `wstera-lab` flow cannot run, stop and report with the error; do not substitute mocks for the trace.
- If a step needs a provider call, stop — that is an Owner decision.

## Evidence

```
EVIDENCE .worktrees/docs-g1-plan-20261025 scripts/seed-local.mjs:57-74 @9b4f997 "Seeded one local synthetic owner, workspace, and web connection."
EVIDENCE .worktrees/docs-g1-plan-20261025 reports/G1-HOST-001-IMPLEMENTATION.md:26 @9b4f997 "The current machine has no Docker daemon (`docker info` cannot connect and Docker Desktop is not installed), so local Supabase startup and authenticated browser-to-Storage end-to-end testing are unavailable here."
EVIDENCE .worktrees/docs-g1-plan-20261025 plans/PLAN-G1-WEB-RAG-MVP.md:40 @9b4f997 "A reproducible browser/E2E trace demonstrates upload → approval → question → cited answer → handoff → staff response/resume."
```

## PR

Evidence-only PR (report + fixtures + scripts). No self-merge.
