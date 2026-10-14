# Architecture Overview — Proposal

## Goals

Build two customer-facing channels backed by one shared, tenant-isolated knowledge and conversation engine.

```text
Website Chat Widget             LINE Official Account
        |                               |
        +----------- Channel Adapters --+
                        |
       Trusted Workspace/Identity Resolution
                        |
               Conversation Service
                        |
        Policy / Guardrails / Handoff
                        |
              AI Provider Gateway
                        |
      Knowledge Retrieval + Business APIs
                /               \
       Versioned RAG          Authorized read
       Knowledge Store       and approved actions
                        |
          Durable audit, events, usage
```

## Key contracts (to be designed)

- Workspace-scoped identity, storage, retrieval and authorization.
- Source-backed answers with versioning and explicit unknown/fallback behavior.
- Document ingestion, chunking, embeddings and Thai-language retrieval evaluation.
- LINE webhook signature validation and idempotent event handling.
- Durable human handoff which pauses AI until authorized staff release.
- Business action confirmation, auditability, rate limits and budget ceilings.

## Proposed staged delivery

1. Discovery and reuse review, including a Thai-language evaluation dataset.
2. Shared grounded-answer core and Website Chat vertical slice.
3. LINE OA pilot with real webhook roundtrip and handoff evidence.
4. Self-service workspaces and operations for multiple businesses.
5. Privacy, security, reliability and commercial launch gates.

## Non-goals for this scaffold

- No production secrets, private repository snapshots, or internal documentation.
- No live payment, order, booking or CRM side effects.
- No claims of production readiness or verified RAG performance.

This document is a planning outline and can change after architecture review.
