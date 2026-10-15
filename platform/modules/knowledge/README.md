# Knowledge Module — G1a and G1b local slices

**Status: IMPLEMENTED LOCALLY** across stacked branches `codex/g1a-knowledge-contracts-20261015` and `codex/g1b-document-ingestion-20261015`. This is local TypeScript behavior over synthetic FAQ/PDF/CSV fixtures, not a deployed or persistent product.

## Implemented

- `platform/contracts/data/knowledge.ts`: workspace-scoped source, version, chunk, lifecycle, citation locator (span/page/row/chunk), retrieval query/result and replaceable repository/retrieval ports. The contract requires atomic approval with at most one approved/current version per source.
- `platform/modules/knowledge/index.ts`: FAQ input validation and deterministic chunk spans; source archive and version transition/approval/revocation rules; immutable approved content; deterministic Thai-bigram and literal SKU lexical retrieval; fail-closed no-answer result.
- `platform/modules/knowledge/testing/in-memory-repository.ts`: test-only in-memory repository enforcing scope and version conflicts. It is not a production adapter.
- `platform/adapters/knowledge/document-extractor.ts`: local Node adapter for bounded PDF text and UTF-8 CSV extraction; yields exact PDF page and logical CSV record locators. CSV headers are required and unique, and malformed rows fail closed. Image-only PDFs fail with no text; OCR is not performed.
- `platform/modules/knowledge/index.ts`: `prepareKnowledgeDocumentVersion` joins the extractor port to draft-version creation and maps malformed extractor output to a safe failure. The caller must still persist and approve through a repository.
- `platform/modules/knowledge/knowledge.test.ts`: synthetic Thai/SKU, tenant separation and forged selector, approval/revocation/archive, version conflict/immutability, no-match, malformed/oversized content, injection-as-data, PDF/CSV extraction failures, and exact page/row citation tests. Included in the existing `npm test` script.

The local extractor caps input at 5 MiB, PDF at 100 pages, CSV at 5,000 data rows and 100 columns, records at 16,384 characters, and extracted text at 100,000 characters. These are implementation safety bounds, not approved customer-facing plan limits.

Citation spans are UTF-16 code-unit offsets into the exact stored `content`; hit text is the exact cited slice. Retrieval consumes the server-resolved `TrustedWorkspaceContext`; a client-supplied `workspaceId` selector is rejected. The simple lexical score is a deterministic test baseline, not evaluated Thai semantic search.

## Not implemented / remaining G1 work

An authenticated upload path, durable async ingestion state machine, persistent database or object storage, pgvector/hybrid search, production authorization/RLS, model answer generation, Web Chat UI, and staff takeover. The Node parser is not a deployment integration. Untrusted document instructions remain text data; this module has no code path that interprets them as commands.

## Local evidence

- See `reports/G1B-DOCUMENT-INGESTION-2026-10-15.md` for current branch-specific commands and evidence. Earlier G1a evidence remains scoped to its own branch and dependency set.

## Next executable slice

Add a persisted repository and authenticated upload/approval path with isolation tests. Keep retrieval behind `KnowledgeRetrievalPort`; use the synthetic G1-C baseline as diagnostic evidence, then get Owner review before setting thresholds or selecting pgvector/tokenizer/reranking. Web chat and model generation remain later slices. Handoff domain state exists separately, but no production delivery path is integrated.
