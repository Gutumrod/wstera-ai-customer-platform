# Task P3A — Business action executor (PLANNED)

**Status:** PLANNED. Not authorised to start. Blocked until Phase 3 gating is agreed (ADR-007).
Owner order 2026-10-25 allowed the *contract and reducer* only, not execution.

## Goal

Wire `BusinessActionExecutorPort` to one real side-effect boundary, behind authorisation, explicit
confirmation, idempotency and verification — without letting model text reach a write.

## Scope (proposed)

- One executor adapter for a single action kind (likely `draft_order`), in `platform/adapters/`.
- Durable action store with unique idempotency key per workspace.
- Audit writer using the existing conversation/audit adapters.
- Negative tests: replay, duplicate confirm, cross-workspace, executor failure mid-flight.

## Acceptance (proposed)

- A duplicate event never produces a second business record.
- An unconfirmed state-changing action never reaches the executor.
- Executor failure surfaces as `failed`, never as `verified`.
- Evidence is re-runnable; `npm run check` plus a documented manual scenario.

## Out of scope

Payments, refunds, stock mutation, LINE delivery, any production or hosted database.
