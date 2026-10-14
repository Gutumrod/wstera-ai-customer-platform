# Technology Stack / RAG Design Research

Updated: 2026-10-14. **Status: proposed, pending architecture spike and owner gate.** Scope: web support + LINE OA on a shared workspace-scoped engine.

## Proposed default stack

| Layer | Preferred candidate | Reason | Gate |
|---|---|---|---|
| Dashboard / Web | Next.js + TypeScript + shadcn/ui | React ecosystem, forms/roles, reusable components | Confirm Cloudflare deployment adapter and version |
| Web AI Chat UI | assistant-ui | Streaming / composable interaction, tools | Prototype runtime adapter and mobile/Thai UI |
| LLM orchestration | Vercel AI SDK behind provider port | Streaming, structured/tool APIs | Guardrail/usage tests; no vendor lock |
| Edge API + webhook | Cloudflare Workers | Scalable request boundary | Node-compat and crypto/timeout validation |
| Data/Auth | Supabase Postgres + Supabase Auth | Workspace RBAC, RLS, transactions | Negative cross-tenant tests |
| Knowledge RAG | Postgres pgvector + hybrid search | Single operational store for MVP | Evaluate Thai retrieval, SKUs and reranking |
| Uploaded assets | Private object storage, candidate Supabase Storage | ACL/presigned access | MIME limits, malware/PII control |
| Background ingestion | Cloudflare Queues if required | Async PDF ingestion without blocking webhook | Durability, DLQ/replay/cost |
| Provider gateway | Explicit typed adapters + budget meter | Model-agnostic and failure-aware | Cost/quality matrix |

Do not add LangChain, Qdrant, Redis, n8n, or standalone vector infra without measured need. This is a reduction of dependencies, not a claim that these are inferior products.

## Distinguish facts by freshness and source

- Supabase documents [Postgres hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) using **tsvector + pgvector**. Its example uses English tokenization; Thai product data requires a specific tokenizer/retriever spike, plus literal SKU search.
- [assistant-ui](https://github.com/assistant-ui/assistant-ui) supports AI SDK runtime and composable streaming UI; no tenant-scoped helpdesk backend is bundled.
- [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) documents Workers Free: 10,000 **operations** per day, NOT 10,000 messages, with write/read/delete potentially counted separately. Quotas are subject to change.
- [LINE receive webhook docs](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) explicitly recommend asynchronous processing.

## Knowledge processing pipeline (not yet implemented)

1. Workspace Owner uploads PDF/CSV/FAQ via authenticated dashboard; private storage; size/content scan; quotas.
2. Create Source + Version + validation status. Extract text safely; identify tables; flag image-only PDF as unsupported or queue manual review.
3. Normalize, split into traceable chunks with document ID, page/row reference, workspace ID and approval state.
4. Index embeddings and exact lexical/SKU terms. Keep a source-of-truth table for changing price/stock/booking: these **must** be queried from real APIs, not stale vector answers.
5. At query, resolve workspace server-side; retrieve **only matching workspace** chunks; combine semantic + lexical candidates, then rerank if needed.
6. Run evidence sufficiency checks and policy guard; answer with source refs, or explicit unknown + human handoff.
7. Track source version and trace of chosen chunks for QA. Delete/re-index on source changes, consent withdrawal and offboarding.
8. Never treat document contents as system instructions (prompt injection); strip secrets/PII from model context where feasible.

## Thai-specific tests

- Exact vehicle model / variant / part numbers and spelling variants.
- Thai compound sentences, colloquialisms, misspellings, mixed English/Thai SKU.
- Source conflicts ('old warranty policy' vs current policy) and revoked knowledge.
- Negative cases with no answer, cross-shop data traps, hostile prompts embedded in uploaded documents.
- Measure retrieval hit@k/recall@k, citation validity, groundedness, handoff rate, P50/P95 latency, and estimated total cost/1000 chats. No numeric pass threshold accepted without observed baseline.

## Open decisions

- Model/embedding/rerank providers under free-first budget.
- Document size/corpus limits per pricing tier, retention, deletion procedure.
- Web widget isolation approach (iframe + loader favored for CSS/security isolation).
- Cross-tenant DB shape / RLS SQL and zero-trust service key usage.
- Handoff location: initially controlled Inbox, validate LINE OA Manager experience rather than assume.
