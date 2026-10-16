# G1-C1 Structured SKU Punctuation Normalization — Local Evidence

**Recorded:** 2026-10-16 (Asia/Bangkok)
**Branch:** `codex/g1c1-sku-punctuation-20261016`
**Base:** `codex/g1d-conversation-handoff-20261015` at `c580d4239c88bbdd56ec31686114a86ee6bd9bbb`
**Pull request:** [#11](https://github.com/Gutumrod/wstera-ai-customer-platform/pull/11), open and stacked on PR #10.

## Defect and change

Before the change, synthetic evaluation case `csv-08` queried `ZX650` against approved CSV content `ZX-650` and returned no evidence (recall@3 = 0 for that case). Retrieval now compares compact forms only when an ASCII letter+digit code with supported separators has a unique form across the approved workspace corpus. If distinct forms collide (for example, `AB-12` and `A-B12`), compact-only matching is disabled while literal exact-form matching remains. Thai tokenization, source scope, approval filtering and citation locators are unchanged.

## Verification

- `npm ci` — installed the lockfile dependencies; 0 vulnerabilities reported for 8 audited packages.
- `npm run check` — passed typecheck/build and 49 tests, 0 failures.
- `npm run evaluate:knowledge` — 30 synthetic cases; provider calls = 0; estimated provider cost = USD 0.
- Overall recall@3 changed from 0.963 to 1.000. Citation precision = 1.000; retrieval abstention accuracy = 1.000 (2/2); precision@3 = 0.345679. Local P50/P95 = 0.386/0.692 ms (single local run; not production latency evidence).
- The `sku-punctuation-variant` case changed from recall@3 = 0 and no returned citation to recall@3 = 1 with the expected CSV row locator and valid citation.
- `ZX_650` matches the approved `ZX-650` FAQ fixture; near-prefix `ZX65` returns `NO_APPROVED_EVIDENCE`.
- Ambiguous compact query `AB12` abstains when approved sources contain both `AB-12` and `A-B12`; exact queries return only the matching exact SKU source.

## Security and limits

No tenancy or lifecycle boundary changed. SKU normalization requires both a letter and a digit; punctuation-insensitive matching is disabled when multiple approved forms share the same compact key. Matching remains token equality, not substring matching. Additional matching can return more chunks for a SKU, so the reported precision is diagnostic only and no threshold is claimed. Contradiction resolution beyond identifier ambiguity, model answerability, durable persistence, authenticated upload and Web Chat integration remain unimplemented. The 30-case synthetic evaluation is not real-user or production evidence.

An independent read-only review found that unconditional punctuation removal could conflate `AB-12` with `A-B12`. The implementation now disables compact-only matches for colliding keys, and review confirmed the collision check runs after trusted-workspace validation and active/approved filtering; regression tests cover ambiguous, exact-form and revoked-form cases.
