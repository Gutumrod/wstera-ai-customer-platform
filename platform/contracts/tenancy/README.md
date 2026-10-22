# Tenancy Contracts

**Status:** Trusted workspace identity type is implemented; runtime tenant authorization remains NOT IMPLEMENTED.

## Responsibility

Own provider-neutral tenancy identity contracts, including `TrustedWorkspaceContext` and the `ChannelId` identifier used to describe the trusted channel binding. Membership, connection ownership lookup, lifecycle and enforcement implementations belong to later scoped work.

`TrustedWorkspaceContext` is a data contract, not proof that a caller is authorized. A trusted host must resolve the workspace from server-owned authentication or verified connection ownership and enforce authorization at API and data boundaries.

Web and LINE are the current channel IDs. Adding another channel is a later explicit design decision.
