# OpenAI-compatible Model Adapter

**Status:** Task 006C adapter implemented locally and independently reviewed; scoped PR pending. **Planned phase:** G1-D.

## Responsibility

Provide a narrowly configured, non-streaming Chat Completions adapter for the existing answerability and grounded-answer ports. The deployment host must supply its provider ID, HTTPS base URL, API key, model name, transport and durable usage port. No endpoint or provider is selected by the shared product architecture.

## Dependency and security rule

No hard-coded credentials, fail closed, record tokens, and apply host-owned spend controls before enabling live calls.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

Do not configure or call a live provider in tests. Enforce request/response bounds, timeouts, no retry, strict response parsing, token-usage recording and safe errors. Token counts are not dollar-cost attribution and do not implement aggregate spend limits.

The request shape follows the current [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) (`max_completion_tokens`, JSON response mode, non-streaming usage). Compatibility, retention and pricing must be checked for the host-selected endpoint before use.
