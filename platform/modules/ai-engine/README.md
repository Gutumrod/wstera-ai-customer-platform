# Shared AI Engine

**Status:** Provider-neutral response orchestration, citation identity validation, and a mocked-transport OpenAI-compatible answerability/generation adapter with required token-usage sink are implemented. Live provider selection, durable usage ledger, dollar-cost attribution, aggregate spend limits and persistent handoff remain unimplemented. **Phase:** G1 1D foundation.

## Responsibility

Answer orchestration, evidence sufficiency, model provider selection, safety policy and usage accounting.

## Dependency and security rule

No vendor SDK imports here. The orchestrator requires an active conversation state and an answerability decision, hands off insufficient, conflicting or uncertain evidence, and validates generated citation references against retrieved evidence before returning an answer. It checks conversation state before retrieval and after generation; the returned conversation version must still be enforced at the actual delivery boundary. Never claim unsupported answer or fabricated citation.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

`SupportOrchestrator` is an application core only. Tests use local test doubles and the model adapter uses mocked transport. A real answer requires a host-configured endpoint and durable usage port. The adapter's semantic answerability decision is a provider output, not proven quality evidence. Handoff is only requested through a port and is not durable unless its adapter proves durability. Citation validation proves provenance, not semantic support of each claim. The conversation read before/after generation does not close the race with a later channel send; a durable dispatch guard must atomically enforce the returned conversation version. Token counts are exposed for metering; provider prices, production cost and production latency are unmeasured.
