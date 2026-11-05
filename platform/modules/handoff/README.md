# Human Handoff Module

**Status:** HANDOFF-002 candidate implements durable local PostgreSQL state, staff Inbox actions and customer Web Chat staff updates. Hosted migration/apply and independent review are pending. **Scope:** local prototype only.

## Responsibility

Operator claim, AI-pause state, staff-delivery metadata, and authorized release/resume transitions. Shared conversation state lives in `platform/modules/conversation/` so Web and LINE adapters use the same core.

## Dependency and security rule

A customer chat command must not silently release operator ownership. The runtime state machine exposes no customer release command. Production authorization, durable state, and atomic outbound pause enforcement remain required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

`PostgresConversationRepository` and the message/outbox adapters run under the local `knowledge_runtime` role in PGlite tests. The handoff notification outbox has no external dispatcher yet; no LINE or email is sent. Message retention duration and deletion workflow are not configured. This does not establish hosted or production delivery.
