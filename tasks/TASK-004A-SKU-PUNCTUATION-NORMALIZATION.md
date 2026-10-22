# Task 004A — Structured SKU punctuation normalization (G1-C1)

**Status (2026-10-23):** Included in PR #16 and merged on `main` (`857b2e5`). This implements the synthetic SKU normalization slice; it does not establish production retrieval quality.

## Goal

Make exact alphanumeric SKU lookup tolerate common punctuation differences such as `ZX650` versus `ZX-650` while preserving deterministic lexical retrieval and exact citations.

## Scope

- Apply a compact comparison only to ASCII letter+digit terms containing one or more existing SKU separators (`-`, `_`, `.`, `/`) when that compact form is unique in the approved workspace corpus.
- Preserve original tokens and Thai bigrams; do not perform substring/fuzzy matching or change tenant, approval, or citation behavior.
- Add regression coverage for no separator and alternate separator queries, plus a near-prefix negative case.
- Re-run the existing 30-query synthetic evaluation. Do not set pass thresholds or select a retrieval technology.

## Acceptance criteria

- Query `ZX650` retrieves the approved `ZX-650` CSV row with a valid row citation.
- Query `ZX_650` also matches; partial query `ZX65` does not.
- If different approved SKU forms collide after punctuation removal, a compact-only query returns no evidence; exact-form queries still return only their exact item.
- The 30-case baseline passes with recall@3 = 1.0 and valid exact citations.
- No model/provider calls, database, customer data, secrets, or deployment are involved.

## Evidence

See `../reports/G1C1-SKU-PUNCTUATION-2026-10-16.md` for before/after output and test results.

## Limitations

This is deterministic lexical normalization, not semantic SKU resolution, answerability/conflict handling, generated-answer grounding, or production retrieval proof. Evaluation is synthetic and in-memory; it does not set a quality release threshold.
