# WSTERA AI Customer Platform — Detailed Product Requirements

**Reference appendix:** The concise, authoritative project goal is [BRIEF.md](../BRIEF.md). This file preserves the complete previously locked requirements and rationale for detailed tasks and reviews. If a conflict appears, follow the concise goal and ask the Owner to resolve it before implementation.

**Status:** Product direction LOCKED; implementation architecture PROPOSED until reviewed. Updated 2026-10-15.
**Authority:** Owner decisions recorded here; Codex must not silently alter locked goals. Changes to a locked requirement need an owner-approved ADR and an updated task brief.
**Audience:** Owner, Claude (architecture), Codex Cloud (implementation), independent reviewer.

## 0. Goal — the product, not just a chatbot

สร้างแพลตฟอร์ม AI ตอบลูกค้าสำหรับร้านค้าทั่วไป **ให้เปิดใช้เองได้ ขยายได้ และเก็บเงินได้จริง** โดยมี 2 ผลิตภัณฑ์ที่ใช้ Shared AI Engine เดียวกัน ไม่พัฒนา AI/RAG แยกชุดตามช่องทาง

**Business success = paying customers with sustainable per-shop economics**, not just shipped code. First measurable milestone is: **one shop uploads its own approved knowledge and its customers get grounded Web Chat answers, with traceable sources and a usable human escalation path**.

## 1. Locked product boundaries

| ID | Requirement | Acceptance intent |
|---|---|---|
| L-01 | **Two products**: Web AI Chat (web visitors) and LINE AI Support (LINE OA subscribers) | Distinct channel UX, one shared AI/RAG/Policy/Conversation engine |
| L-02 | **Multi-tenant from first data boundary** | Each business has a trusted Workspace; documents, chunks, conversations, credentials, config and logs isolated |
| L-03 | **Business-owned knowledge** | Business uploads PDF, CSV and FAQ; version, approve, test, replace/revoke and delete knowledge |
| L-04 | **Grounded answer, not guessing** | Cite document and chunk/page/row; no adequate or conflicting evidence => clear uncertainty + human handoff |
| L-05 | **Human takeover** | Staff can assume control; AI stops sending until authorized staff releases conversation |
| L-06 | **Self-service SaaS destination** | Shop profile, guided LINE OA setup, test chat, permissioned staff, settings and subscriptions |
| L-07 | **Use existing work selectively** | Legacy 4 repos remain untouched; reuse reviewed concepts/contracts, never wholesale copy into public |
| L-08 | **Pluggable adapters** | Channel, model, retrieval, storage and business connectors replaceable at a defined port; core is provider-neutral |
| L-09 | **Free-first, revenue-gated** | No recurring paid infrastructure/AI spend without owner-approved budget and metering |
| L-10 | **Controlled release** | Codex branch + PR + tests; independent security review; owner approves merge/deploy |
| L-11 | **Customer data minimized** | No unnecessary PII or secret logging; private storage, deletion and retention controls |
| L-12 | **Thai-first retrieval quality** | Thai language, misspellings, mixed language, vehicle models and exact SKU must be evaluated |

**Future expansion requirement:** Facebook Messenger or another messaging channel should be possible through a new channel adapter **without rebuilding RAG, policy or conversation storage**. These additional channels are NOT in MVP scope.

## 2. Product A — Web AI Chat

Visitor opens embedded chat on merchant website (lightweight JavaScript loader + isolated iframe proposed), asks a Thai-language question. The trusted website connection resolves the workspace; the shared engine retrieves approved evidence and produces a cited answer. If uncertain or human requested, open a controlled handoff. Merchant can view and respond in a minimal operator interface.

Web visitor authentication and allowed-origin rules must be designed for public traffic; **browser-supplied workspace ID is not authorization**. For MVP, support one shop end to end, with cross-shop negative tests even when using a single demo shop.

## 3. Product B — LINE AI Support SaaS

Merchant signs up and creates Workspace -> fills business profile and support hours -> uploads knowledge -> tests AI and citations -> connects its own LINE OA through **guided setup** -> validates signed webhook/roundtrip -> enables AI -> receives escalations in staffed Inbox.

One LINE OA normally has one webhook destination; warn before changing an existing CRM/bot integration. Do not advertise one-click OAuth authorization as universally supported. LINE reply-token validity and message quota differences must be tested against current official docs. Confirm coexistence with LINE OA Manager using an actual test channel before product claims.

## 4. One Shared Support Engine

Pipeline: **Trusted channel ingress -> Workspace binding -> Durable conversation + handoff state -> Authorized retrieval -> Evidence / Answerability Gate -> Model provider adapter -> grounded response OR operator escalation -> audit + usage meter**.

Core ownership:
- **Tenancy & identity**: workspace connection binding, staff membership, RLS, scope resolution.
- **Knowledge**: ingest -> extract -> index -> approve -> retrieve -> cite -> revoke/delete.
- **Conversation**: threads, delivery idempotency, state transitions, human ownership and pause/resume.
- **AI orchestration**: prompt safety, answerability, model selection, bounded streaming/fallback; **no unapproved business action**.
- **Policy**: authorize, validate, confirm, execute, verify, audit any state-changing tools.
- **Metering & cost**: provider usage, shop limits, abuse throttling and budgets.

## 5. Locked safety invariants

1. Never authorize a request from `x-tenant-id`, a free-text chat value, knowledge content or model output. Workspace identity comes from a server-validated connection/auth binding.
2. Use tenant IDs on **every** storage/retrieval boundary; enforce at API and database with negative cross-tenant tests.
3. Uploads are untrusted data, not system instructions. No customer documents or live secrets committed to Public Git.
4. LINE raw-body HMAC verification before processing; persisted deduplication with failure recovery, replay and bounded input.
5. Human takeover must be **durable** and customer cannot bypass it by writing a reset phrase.
6. The bot must never autonomously book, collect payment, issue refund or alter stock without an authorized, confirmed business action contract.
7. Do not claim reliable RAG until Thai evaluation and source attribution pass; a simple approved-source filter is NOT an Answerability Gate.
8. No hidden mock provider success when real provider config missing; fail closed and surface errors safely.
9. No live production changes, migrations or secret management without separate owner approval.
10. Public repository includes original authored documentation / reviewed new code, **not** bulk private source clones.

## 6. Selected stack — PROPOSED, not irrevocably locked

| Layer | Preferred candidate | Replaceable boundary |
|---|---|---|
| Dashboard + web | Next.js + TypeScript + shadcn/ui | `apps/merchant-console`, `apps/web-chat` |
| Chat presentation | assistant-ui | UI integration, not engine core |
| LLM streaming | Vercel AI SDK | ModelPort adapter |
| HTTP runtime | Cloudflare Workers | host/bootstrap adapter |
| Authentication & database | Supabase Auth + PostgreSQL | IdentityPort, repositories; RLS remains mandatory |
| Knowledge index | pgvector + evaluated Thai-aware hybrid search | RetrievalPort |
| Files | Private Supabase Storage | ObjectStoragePort |
| Models | OpenAI-compatible providers behind adapters | ModelPort/EmbeddingPort |
| Background jobs | Cloudflare Queues ONLY if needed | JobQueuePort |

No mandatory LangChain, Qdrant, Redis, n8n or Chatwoot dependency in MVP. AgentDesk / Krispy / Chatwoot / Knocket are benchmarks, not source imports; see `research/`.

## 7. Milestones and implementation gates

| Gate | Deliverable | Release condition |
|---|---|---|
| G0 — Foundation | repo contracts, tests, CI, trust boundaries | reproducible clean checkout; security review; no unapproved secrets |
| G1 — One-shop Web MVP | FAQ/PDF -> versioned knowledge -> Thai retrieve -> cited Web Chat -> escalation | observed answer-source evidence, unknown handling, negative isolation tests, owner demo |
| G2 — Controlled LINE pilot | guided connect, signed LINE webhook, dedupe/retry, staff handoff | actual LINE sandbox roundtrip and durable pause/resume proof |
| G3 — Multi-shop SaaS | onboarding, memberships/RLS, per-shop settings/usage, restore/deletion | second shop self-onboards with zero cross-shop leakage |
| G4 — Commercial | pricing, billing, support/legal/privacy, cost budgets | paying pilot + verified unit economics + owner go-live |

See `plans/ROADMAP.md`, `plans/PHASE-BREAKDOWN.md`, and `tasks/`.

## 8. Working agreement and source of truth

- Product goals/locked decisions: **`BRIEF.md`** (this file).
- Repo layout and ownership: `architecture/REPOSITORY-STRUCTURE.md`.
- Port and adapter direction: `architecture/PORTS-AND-ADAPTERS.md`.
- Proposed stack/ADRs: `architecture/DECISIONS.md`.
- Evidence and citations: `research/`.
- Phases, Gates, dependencies: `plans/`.
- Scoped Codex tasks and acceptance: `tasks/`.
- Instructions for AI coding agents: `AGENTS.md`.

Keep evidence categories distinct: VERIFIED / PROPOSED / NOT IMPLEMENTED / BLOCKED. If requirements conflict, stop and ask Owner; do not silently decide product scope.
