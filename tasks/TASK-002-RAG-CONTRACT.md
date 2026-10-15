# Codex Cloud Task 002 — Knowledge/RAG Contracts (AFTER 001)

**Status:** PARTIALLY IMPLEMENTED LOCALLY on stacked branch `codex/g1a-knowledge-contracts-20261015`; PR #5 remains unmerged and Owner review is pending. The scoped G1a code/tests are present in this worktree; this does not certify the full task or unlock merge/deploy.
**Goal:** Create a safe source/version/chunk/retrieval contract for approved knowledge per workspace, without pretending that embeddings alone guarantee factual answers.

**Design authority:** [Master Brief](../BRIEF.md) (L-02/L-03/L-04/L-08/L-12), [Knowledge module ownership](../architecture/REPOSITORY-STRUCTURE.md) and [Port contracts](../architecture/PORTS-AND-ADAPTERS.md). Implement through provider-neutral contracts; do not import Supabase/pgvector directly into the knowledge domain.

## Deliverables

### Implemented in the local G1a slice

- Provider-neutral source/version/chunk, citation, retrieval query/result, and repository/retrieval contracts in `platform/contracts/data/knowledge.ts`.
- Pure FAQ text validation/chunking, lifecycle transitions, approval/revocation, immutable approved content, deterministic lexical/SKU retrieval, and no-answer behavior in `platform/modules/knowledge/`.
- Synthetic regression tests for scope, approval/revocation, version conflict, exact citations, Thai/SKU queries, no-match, malformed/oversized content, and instruction-like text.

### Implemented in the stacked G1b local slice

- Bounded local Node PDF text and UTF-8 CSV extraction, with page and logical CSV record locators, through `KnowledgeDocumentExtractorPort`.
- Orchestration from extracted segments into a draft knowledge version and exact row/page citations in retrieval.

### Still not implemented from this task

- Durable async ingestion and persistent adapters; Thai retrieval comparison/evaluation against pgvector/tokenizer/reranker options; full adapter integration and broader cross-adapter contract evidence.

- Source and version type schema (PDF/CSV/FAQ), approval, removal, chunk source reference (document ID, page/row, timestamp), and workspace isolation contract.
- Async ingestion state machine: uploaded -> validating -> extracting -> indexed -> approved OR quarantined/failed; explicit delete/re-index.
- Retriever port supports hybrid search and exact SKU lookup; never returns another workspace's chunks.
- Source-backed answer policy: evidence sufficient? cite chunk IDs; if absent/conflicting/stale, fallback + handoff. Test prompt-injection fixture.
- Synthetic Thai shop fixtures only; no real customer data.
- Short comparison of pgvector + lexical retrieval for Thai vs alternative tokenization/rerank strategies based on proof.
- Tests for tampered workspace, revoked source, version conflict, 0 results and mixed-language SKUs.

## Non-goals

No live provider secrets, no production DB migration, no real customer PDF, no unauthorized paid API or deployment. Do not touch billing or order action tools.

## Definition of done

Contract tests + traceability tests + documentation; meaningful failure cases. Open a scoped PR and report remaining unknowns. Owner reviews before progressing to real ingestion or Web Chat implementation.
