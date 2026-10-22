# Codex Cloud Task 002 — Knowledge/RAG Contracts (AFTER 001)

**Status (2026-10-23):** The G1A–G1C implementation slices and PR #5/#7–#9 were consolidated and merged to `main` in PR #16 (`857b2e5`). This remains a partial implementation of the broader RAG contract: authenticated ownership/upload, production retrieval and answer-quality acceptance are still open.
**Goal:** Create a safe source/version/chunk/retrieval contract for approved knowledge per workspace, without pretending that embeddings alone guarantee factual answers.

**Design authority:** [Master Brief](../BRIEF.md) (L-02/L-03/L-04/L-08/L-12), [Knowledge module ownership](../architecture/REPOSITORY-STRUCTURE.md) and [Port contracts](../architecture/PORTS-AND-ADAPTERS.md). Implement through provider-neutral contracts; do not import Supabase/pgvector directly into the knowledge domain.

## Deliverables

### Implemented in the local G1a slice

- Provider-neutral source/version/chunk, citation, retrieval query/result, and repository/retrieval contracts in `platform/contracts/data/knowledge.ts`.
- Pure FAQ text validation/chunking, lifecycle transitions, approval/revocation, immutable approved content, deterministic lexical/SKU retrieval, and no-answer behavior in `platform/modules/knowledge/`.
- Synthetic regression tests for scope, approval/revocation, version conflict, exact citations, Thai/SKU queries, no-match, malformed/oversized content, and instruction-like text.

### Implemented in the stacked G1b slice

- Bounded local Node PDF text and UTF-8 CSV extraction, with page and logical CSV record locators, through `KnowledgeDocumentExtractorPort`.
- Orchestration from extracted segments into a draft knowledge version and exact row/page citations in retrieval.

### Still not implemented from this task

- Durable async ingestion, persistent adapters, and the uploaded -> validating -> extracting -> indexed -> approved/quarantined/failed state machine; delete/re-index workflow.
- Production hybrid/vector retrieval, persistent exact-SKU lookup, and cross-adapter isolation evidence. Current lexical behavior and tenant checks are in-memory only.
- Source-backed answerability policy: decide evidence sufficiency, resolve conflicting/stale content, cite selected chunks, or fall back and hand off.
- Thai retrieval comparison against pgvector/tokenizer/reranker options based on representative evidence; current fixtures and metrics are synthetic only.
- Broader contract/security evidence against real persistence adapters and concurrent tenant access.

## Non-goals

No live provider secrets, no production DB migration, no real customer PDF, no unauthorized paid API or deployment. Do not touch billing or order action tools.

## Definition of done

Contract tests + traceability tests + documentation; meaningful failure cases. Open a scoped PR and report remaining unknowns. Owner reviews before progressing to real ingestion or Web Chat implementation.
