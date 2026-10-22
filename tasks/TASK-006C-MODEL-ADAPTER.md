# Task 006C — Metered OpenAI-compatible model adapter

**Status (2026-10-23):** The mocked-transport OpenAI-compatible model adapter was included in PR #16 and is merged on `main` (`857b2e5`). No provider is selected or called live; usage persistence and spend limits remain separate work.

## Goal

Connect the G1 response core to a replaceable OpenAI-compatible Chat Completions endpoint without selecting a live provider, making network calls in tests, or enabling paid service use. The host must supply the endpoint, credentials, model, transport and durable per-workspace usage recorder explicitly.

## Scope

- Add provider-neutral model token-usage contract carrying trusted workspace ID, configured provider/model labels, operation, and reported input/output/total tokens; never include customer text, evidence, credentials or provider response bodies in usage records.
- Implement separate answerability and grounded-answer ports with bounded requests/responses, strict JSON parsing, citation-reference validation, request timeout, no retries, and safe normalized errors.
- Require HTTPS and explicit API key by default. Permit HTTP only for loopback development when the host opts in. Reject endpoint credentials, query and fragment components.
- Require a usage recorder and fail closed if a successful provider response has missing/inconsistent usage or usage persistence fails. Do not claim dollar-cost attribution, aggregate spend caps, semantic accuracy, or production readiness.
- Use mocked transport in all tests. Never call a model endpoint, use real credentials, send customer data, or provision services.

## Acceptance

- Typecheck/build and all tests pass; add adversarial tests for timeout, HTTP/invalid JSON/provider shape, unbounded response, bad citations, missing usage, metering failure, and safe error redaction.
- Tests assert bounded token/request fields, no provider call on invalid inputs, trusted workspace attribution only in the usage sink, and no workspace/customer data in provider-independent error strings.
- `npm audit` and `git diff --check` pass; independent read-only security review reports no actionable findings, including bounded fetch/body/usage timeout behavior.
- Open a scoped PR stacked on PR #14. Do not merge, deploy, call any provider, choose a pricing table, or claim end-to-end G1 proof.

PR #15 is currently `MERGEABLE`; GitHub reports no hosted status checks for this stacked branch yet. Owner review and merge remain pending.

## Remaining gates

Provider/model selection, endpoint allowlisting at the deployment host, pricing/rate table, persistent usage ledger and spend limits, semantic answerability evaluation, durable knowledge/conversation adapters, web chat composition and one-shop E2E remain separate work.

See [`../reports/G1-MODEL-ADAPTER-2026-10-16.md`](../reports/G1-MODEL-ADAPTER-2026-10-16.md) for local evidence and the exact verification boundary.
