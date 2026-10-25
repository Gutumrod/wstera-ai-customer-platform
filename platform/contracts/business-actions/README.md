# Business Action Ports

**Status:** DTOs, ports and a pure lifecycle reducer are implemented
(`contracts/business-actions/index.ts` + `modules/business-actions/`). No executor, no side effect,
no caller. **Planned phase for execution:** Phase 3+ gated (see ADR-007 in `architecture/DECISIONS.md`).

## Responsibility

Typed proposal, authorization, confirmation, idempotent execute, verify and audit.

## Dependency and security rule

Not needed for MVP. No payment, order or booking writes from model text.

- A model may only raise a proposal. Risk comes from the action kind, never from the proposal, and
  the reducer re-derives it on every transition so a tampered `risk` field cannot unlock execution.
- Confirmation requires prior authorisation; there is no propose -> confirm shortcut.
- A state-changing action cannot execute without an explicit confirmation; a read-only action may.
- Re-confirming with the same confirmation id is idempotent; a different id is refused.
- Every event names the workspace it acts in; a mismatch with the proposal's workspace is denied.
- Terminal records (`verified`, `rejected`) accept no further events; an executed record cannot be
  rejected or failed afterwards.
- A record is plain data: a fully fabricated but internally consistent record cannot be told apart
  from a stored one. Persistence must add integrity (server-side write or signature) before any
  executor exists — see `tasks/TASK-P3A-BUSINESS-ACTION-EXECUTOR.md`.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No executor exists in this folder or its module: wiring an executor to a real order or payment
system is a separate reviewed task with its own gate.
