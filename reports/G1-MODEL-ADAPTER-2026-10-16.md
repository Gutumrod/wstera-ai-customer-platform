# G1 provider-neutral model adapter — local evidence

**Recorded:** 2026-10-16 (Asia/Bangkok)
**Branch:** `codex/g1-model-adapter-20261016`
**Base:** PR #14 head `76817b8f7002e0402f147d5caafdd9d64734f14e`.
**Status:** [PR #15](https://github.com/Gutumrod/wstera-ai-customer-platform/pull/15) open; independent read-only security review found no actionable findings. GitHub currently reports `MERGEABLE` and no hosted checks for this stacked branch.

## Implemented

- Added an OpenAI-compatible non-streaming Chat Completions adapter implementing the response core's answerability and grounded-answer ports.
- Requires explicit provider ID, HTTPS base URL, API key, model label and a token usage recorder. HTTP is permitted only for loopback development when explicitly enabled.
- Adds tenant-attributed token usage contract and passes the trusted workspace ID to the usage sink, never to the provider prompt. Usage records contain no query, evidence, credentials or raw provider response.
- Bounds request/response bytes, evidence size, answer length, citation references, completion tokens and request duration. Makes no retries, disables provider-side storage where supported by this API shape, records successful response usage before parsing model output, and normalizes errors without provider bodies or secrets.
- Validates answerability JSON and requires every generated citation reference to match the supplied evidence. All transport tests use local fake fetch implementations.

## Verification

- `npm ci` — completed; install audit reported 0 vulnerabilities.
- `npm run check` — typecheck/build and 104 tests passed, 0 failures.
- `npm audit --json` — 0 vulnerabilities across 17 dependency records.
- `git diff --check` — passed.
- Independent read-only review — no actionable findings; review included non-cooperative fetch and stalled response-body timeout handling.
- No external model endpoint, provider credential, customer data, database, production service, paid API, or deployment was used.

## Limits and remaining gates

This adapter implements a protocol shape, not a provider/model selection or compatibility proof for any actual endpoint. Mocked transport does not establish semantic answer quality, citation support, latency or production behavior. Token counts are not currency attribution; there is no durable usage ledger, pricing table or aggregate spend ceiling. The host still needs endpoint allowlisting and approved secret handling. Durable knowledge/conversation adapters, Web Chat composition and the one-shop upload-to-human E2E remain unimplemented.
