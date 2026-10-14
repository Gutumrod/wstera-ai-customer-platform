# Codex Cloud Task 002 — Knowledge/RAG Contracts (AFTER 001)

**Status:** PLANNED / DEPENDS ON TASK 001.
**Goal:** Create a safe source/version/chunk/retrieval contract for approved knowledge per workspace, without pretending that embeddings alone guarantee factual answers.

## Deliverables

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
