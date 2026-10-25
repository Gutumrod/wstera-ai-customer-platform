# Business Action Ports

**Status:** DTOs, ports and a pure lifecycle reducer are implemented
(`contracts/business-actions/index.ts` + `modules/business-actions/`). No executor, no side effect,
no caller. **Planned phase for execution:** Phase 3+ gated (see ADR-007 in `architecture/DECISIONS.md`).

## Responsibility

Typed proposal, authorization, confirmation, idempotent execute, verify and audit.

## Dependency and security rule

Not needed for MVP. No payment, order or booking writes from model text.

- A model may only raise a proposal. Risk comes from the action kind, never from the proposal.
- A state-changing action cannot execute without an explicit confirmation; a read-only action may.
- Re-confirming with the same confirmation id is idempotent; a different id is refused.
- Records are workspace-scoped; acting across workspaces is denied.
- Terminal records (`verified`, `rejected`) accept no further events.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No executor exists in this folder or its module: wiring an executor to a real order or payment
system is a separate reviewed task with its own gate.
