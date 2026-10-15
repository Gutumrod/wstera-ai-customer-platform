# Human Handoff Module

**Status:** PARTIAL LOCAL CORE in `platform/modules/conversation/`; persistent handoff and channel delivery are not implemented. **Planned phase:** Phase 1 minimal; Phase 2 durable pilot.

## Responsibility

Operator claim, AI-pause state, staff-delivery metadata, and authorized release/resume transitions. Shared conversation state lives in `platform/modules/conversation/` so Web and LINE adapters use the same core.

## Dependency and security rule

A customer chat command must not silently release operator ownership. The runtime state machine exposes no customer release command. Production authorization, durable state, and atomic outbound pause enforcement remain required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

The local in-memory repository is test-only and does not establish a production handoff or delivered staff response.
