# WSTERA AI Customer Platform

**Status (2026-10-15):** Discovery + small testable security boundary only. Two customer-support products will share ONE workspace-isolated AI/RAG engine.

**Start here:** [Concise Project Goal](BRIEF.md) · [Detailed Requirements](architecture/PRODUCT-REQUIREMENTS-DETAIL.md) · [Modular folder layout](architecture/REPOSITORY-STRUCTURE.md) · [Adapter contracts](architecture/PORTS-AND-ADAPTERS.md) · [Detailed phase plan](plans/PHASE-BREAKDOWN.md).

**The new module folders are architecture placeholders, not implemented features.** Existing executable security-boundary code remains in `platform/src/` while Task 001 is reviewed.

## Product directions

1. **Web AI Chat** — embedded support chat on websites, grounded knowledge responses and staff handoff.
2. **LINE OA AI Support SaaS** — shop creates workspace, uploads approved knowledge (PDF/CSV/FAQ), connects its LINE OA, lets AI answer and passes uncertain cases to humans.

```text
Website Chat ──┐
               ├── Workspace Identity + Conversation/Handoff
LINE OA ───────┘       │
                   RAG + AI Gateway + Policy
                       │
               Tenant-isolated storage
```

## What's in this public repository

- [Research index](research/README.md): comparative analysis of Knocket, Krispy, Vercel Chatbot, AgentDesk, Chatwoot, Flowise and assistant-ui; stack/RAG + LINE API source links; existing module evaluation.
- [Architecture decisions](architecture/DECISIONS.md): proposed contracts and scope limits.
- [Roadmap](plans/ROADMAP.md): phases 0–4, QA/security/commercial gates.
- [Codex Task 001](tasks/TASK-001-FOUNDATION.md) and [Task 002](tasks/TASK-002-RAG-CONTRACT.md): assigned work briefs.
- [AGENTS.md](AGENTS.md): Cloud Codex rules and safety boundaries.
- `platform/src/`: **new** minimal TypeScript boundary contracts (trusted workspace, bounded signed LINE ingress, LINE text reply, durable deduplication port, approved-source candidate filtering), with tests.
- `.github/workflows/ci.yml`: Node CI for typecheck and tests.

**Not implemented yet:** document ingestion or actual RAG, chat UI, database/RLS, complete answerability validation, production HTTP webhook, durable event deduplication implementation, billing, human Inbox or live LINE roundtrip. The event lease port only specifies claim, completion, retry-release and expiry semantics; its test double is not durable storage. The unsigned LINE URL connectivity probe is acknowledged only when its payload has no events and creates no tenant context.

## Quick start

Prerequisite: Node.js 22+ and npm.

```bash
npm ci
npm run check
```

No secrets, external services or paid APIs required for these baseline tests.

## Selected proposed stack

Next.js + TypeScript + assistant-ui + shadcn/ui for chat/dashboard; AI SDK/provider adapters; Cloudflare Workers for ingress; Supabase Auth/Postgres/Storage + pgvector for knowledge and tenant data. **Not locked for production** until architecture spikes and evidence gates pass. No LangChain/Qdrant/Redis by default.

## Cloud Codex handoff

Open `tasks/TASK-001-FOUNDATION.md` as first scoped Codex Cloud task, on its own branch/PR. Run `npm ci && npm run check`, keep production/remote credentials out and do not auto-merge. Task 002 depends on completing Task 001.

## Private source separation

Four local source repository copies remain under `source-repos/` and are **intentionally excluded by .gitignore**, as are private local docs under `docs/` and copy verification under `_migration/`. They are not published or available to Codex Cloud. This repository contains original small boundary implementations informed by reviewed designs, **not bulk-copied source code** from those repositories. All future source import requires licensing/security review.

[Public architecture overview](ARCHITECTURE.md) · [Proposed decisions](architecture/DECISIONS.md)

License: not selected; no new outbound license grant is asserted for source code.
