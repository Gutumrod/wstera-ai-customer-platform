# Channel Ports

**Status:** Initial provider-neutral TypeScript contracts implemented in Phase 0C; transport adapters and runtime validation remain unimplemented. **Planned phase:** Phase 0 contracts.

## Responsibility

Provider-neutral inbound message, outbound reply, origin/capability and delivery contracts.

`index.ts` defines `InboundMessage`, `TrustedWorkspaceContext`, `ChannelPort` and normalized `ChannelError`. A normalized message is data only: `connectionId` and external IDs must be resolved/used by trusted server code and do not authorize a workspace.

## Dependency and security rule

External user identity scoped to trusted connection; no tenant auth derived from payload.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
