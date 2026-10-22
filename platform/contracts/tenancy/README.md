# Tenancy Contracts

**Status:** Trusted workspace and merchant-membership contracts are implemented; local host identity resolution exists for one controlled workspace.

## Responsibility

Own provider-neutral tenancy identity contracts, including `TrustedWorkspaceContext`, the `ChannelId` identifier, and merchant membership/role lookup ports. Supabase-specific membership persistence stays in its adapter.

`TrustedWorkspaceContext` is a data contract, not proof that a caller is authorized. A trusted host must resolve the workspace from server-owned authentication or verified connection ownership and enforce authorization at API and data boundaries.

The G1-HOST-001 resolver binds verified Auth identity to exactly one active workspace, membership and web connection. It fails closed on ambiguity; broader lifecycle and self-service onboarding remain later work. Web and LINE are the current channel IDs.
