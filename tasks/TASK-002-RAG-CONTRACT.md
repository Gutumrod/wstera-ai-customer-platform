# Codex Cloud Task 002 — Knowledge/RAG Contracts (AFTER 001)

**Status:** PARTIALLY IMPLEMENTED LOCALLY across stacked G1a–G1d work; PR #9 adds the synthetic retrieval baseline and PR #10 adds local conversation/handoff state and ports. Parent PR/security/Owner gates remain open; this does not certify the full task or unlock merge/deploy.
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

- Durable async ingestion and persistent adapters; comparison of pgvector/tokenizer/reranker options; full adapter integration and broader cross-adapter contract evidence. A 30-query lexical diagnostic baseline now exists in Task 004, but it does not set pass thresholds or choose the production retrieval technology.

- Source/version/chunk schema, approval/revoke lifecycle and workspace scope are present; durable deletion, retention, re-index operation, source checksums and timestamps remain absent.
- Lifecycle statuses exist from uploaded through extraction/index/approval and failure/quarantine, but no durable async worker or persistent adapter executes them.
- Retrieval is provider-neutral and currently lexical with exact-token SKU bonus. Hybrid/vector retrieval and cross-adapter isolation evidence remain open.
- There is no factual sufficiency/conflict/forbidden-topic answerability policy. The candidate filter is not an Answerability Gate.
- Synthetic-only evidence: Task 004 records a 30-query baseline (recall@3 0.963, precision@3 0.346, citation precision 1.0, abstention 0.667); it is diagnostic, not a quality pass.
- No comparison of pgvector/tokenizer/reranker options has been made, and no thresholds are set pending Owner review.
- Existing tests cover workspace tampering, revoked sources, version conflicts, no results and mixed-language SKUs; broader contract tests against a durable adapter are still needed.

## Non-goals

No live provider secrets, no production DB migration, no real customer PDF, no unauthorized paid API or deployment. Do not touch billing or order action tools.

## Definition of done

Contract tests + traceability tests + documentation; meaningful failure cases. Open a scoped PR and report remaining unknowns. Owner reviews before progressing to real ingestion or Web Chat implementation.
