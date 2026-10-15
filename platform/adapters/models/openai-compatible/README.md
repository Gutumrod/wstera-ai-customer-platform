# OpenAI-compatible Model Adapter

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

Implement typed ModelPort and EmbeddingPort with provider-specific config/errors.

## Dependency and security rule

No hard-coded credentials, fail closed, meter tokens, respect spend cap.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
