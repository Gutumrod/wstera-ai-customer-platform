# Shared AI Engine

**Status:** Citation identity validation is implemented in `citation-integrity.ts`; answer orchestration, evidence sufficiency, provider selection, safety policy and usage accounting remain unimplemented. **Phase:** G1 foundation.

## Responsibility

Answer orchestration, evidence sufficiency, model provider selection, safety policy and usage accounting.

## Dependency and security rule

No vendor SDK imports here. Never claim unsupported answer or fabricated citation.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

This module currently implements citation identity validation only. No answer generation, sufficiency policy, provider integration, or usage accounting is implemented.
