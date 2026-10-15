# Task 004 — Thai Retrieval Evaluation Baseline (G1-C)

**Status:** Implemented locally on `codex/g1c-retrieval-evaluation-20261015`, stacked on Task 003 / PR #8. Review and parent gates remain pending.

## Goal

Establish a reproducible, synthetic 30-query baseline for the current provider-neutral retrieval port before choosing embeddings, tokenization, or reranking. Measure retrieval and citation behavior without calling a model or asserting a release threshold.

## Acceptance criteria

- Cover FAQ, PDF page, CSV row, Thai and mixed-language SKU queries, a genuine Thai typo, a SKU punctuation variant, conflicting sources, revoked knowledge, forbidden/unknown questions, and instruction-like content.
- Enforce the declared corpus count, unique case IDs, expected outcome counts, category coverage, source-kind coverage, and multi-segment PDF/CSV locators.
- Report recall@k, precision@k (relevant unique results divided by k), citation precision, retrieval abstention accuracy, separate policy-abstention count, local P50/P95 retrieval latency, and category breakdown.
- Verify each gold/retrieved evidence item against exact workspace, approved source version, chunk ID/text, and page/row/span locator.
- Treat forbidden-topic policy abstention separately; do not infer policy correctness from retrieval abstention.
- Explicitly mark answer grounding, generated bad-answer rate, model/provider latency and AI cost as unmeasured.
- Run through a repeatable local command and include tests for metric math and corpus coverage.

## Scope limits

Synthetic in-memory data only. No production data, credentials, external provider, paid service, database, model, or deployment. These baseline metrics do not define pass thresholds; Owner review is required before thresholds or retrieval technology are selected.

## Evidence

See `../reports/G1C-THAI-RETRIEVAL-BASELINE-2026-10-15.md` after the baseline is run.
