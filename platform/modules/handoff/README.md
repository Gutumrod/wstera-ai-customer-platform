# Human Handoff Module

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 minimal; Phase 2 durable pilot.

## Responsibility

Operator assignment and durable AI-pause, staff reply, authorized release/resume.

## Dependency and security rule

A customer chat command must not silently release operator ownership.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
