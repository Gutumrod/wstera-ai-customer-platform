# LINE Channel Adapter

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 2.

## Responsibility

Raw HMAC signature, LINE message normalization, reply/push mapping and delivery errors.

## Dependency and security rule

Handle valid LINE test probe, idempotency, reply token limits, retry and handoff safely.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
