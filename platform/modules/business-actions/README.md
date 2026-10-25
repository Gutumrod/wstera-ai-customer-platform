# Business Actions (module)

**Status:** pure lifecycle reducer only. No executor, no payment, order or booking write.

## Responsibility

Freeze a validated proposal, derive its risk from the action kind, and decide state transitions
(`proposeBusinessAction`, `applyBusinessActionEvent`, `riskOfAction`, `assertSameWorkspace`).

## What this does NOT do

- No I/O, storage, vendor SDK or network call.
- No authorisation decision of its own: `BusinessActionAuthorizationPort` in
  `contracts/business-actions/` is the only authority, and it is not wired here.
- No executor: nothing in this module can charge, book, issue a refund or change stock.

Lifecycle: `proposed -> authorized -> confirmed -> executed -> verified`, with `rejected` and
`failed` as alternatives. A `requires_confirmation` action that reaches `execute` without a
confirmation is refused rather than downgraded; confirmation cannot skip authorisation.

## Known limitation

A record is plain data, so a caller that fabricates a fully consistent record (state plus ids)
cannot be distinguished from a stored one. Until an executor exists, persistence must add integrity
(server-side write or signature). This is recorded in `tasks/TASK-P3A-BUSINESS-ACTION-EXECUTOR.md`
and is not a substitute for that work.
