# WSTERA AI Customer Platform

**Status (2026-10-25, `main` `9b4f997`):** Early G1 build in progress. PR #18 merged the local-only
authenticated merchant knowledge host (staff sign-in, workspace-scoped PDF/CSV ingestion with review
and approval, citation-backed search); Docker-backed local Supabase E2E and G1 end-to-end acceptance
remain open. PRs #19–#21 added a pure PromptPay payload builder, business-action lifecycle contract,
and provenance/pilot-gate docs; these do not wire live business actions or payments. Two
customer-support products will share ONE workspace-isolated AI/RAG engine. Nothing here is
production-ready, and no LINE round-trip has been run.

**Start here:** [Concise Project Goal](BRIEF.md) · [Detailed Requirements](architecture/PRODUCT-REQUIREMENTS-DETAIL.md) · [Modular folder layout](architecture/REPOSITORY-STRUCTURE.md) · [Adapter contracts](architecture/PORTS-AND-ADAPTERS.md) · [Detailed phase plan](plans/PHASE-BREAKDOWN.md) · [Source-import provenance](architecture/SOURCE-IMPORT-PROVENANCE.md).

`platform/modules/` contains provider-neutral domain logic. `platform/apps/merchant-console/` and persistence/storage adapters provide the local synthetic knowledge-host slice; they do not establish production readiness.

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
- `platform/src/`: minimal TypeScript security-boundary contracts (trusted workspace, bounded signed LINE ingress, LINE text reply, durable deduplication port, approved-source candidate filtering), with tests.
- `platform/apps/merchant-console/`: local authenticated source upload, review/approval and citation search.
- `supabase/migrations/`: workspace membership, private knowledge storage and runtime database role for local setup.
- [`reports/G1-HOST-001-IMPLEMENTATION.md`](reports/G1-HOST-001-IMPLEMENTATION.md): implementation evidence and remaining gates.
- `.github/workflows/ci.yml`: Node CI for typecheck and tests.

**Still not implemented:** public Web Chat, live model wiring, semantic answerability, durable human Inbox/dispatch, billing, production webhook operations, and full one-shop G1 acceptance. The event lease port only specifies claim, completion, retry-release and expiry semantics; its test double is not durable storage. The unsigned LINE URL connectivity probe is acknowledged only when its payload has no events and creates no tenant context.

## Baseline checks

Prerequisite: Node.js 22+ and npm.

```bash
npm ci
npm run check
```

No secrets, external services or paid APIs are required for baseline checks.

## Local merchant console (synthetic data only)

Requires Node.js 22+, npm, Docker Desktop or another working Docker daemon, and the Supabase CLI. This flow targets loopback addresses only; do not put hosted Supabase values in `.env.local`.

1. Run `npm ci`, then start local Supabase with `supabase start`.
2. Apply local migrations with `supabase db reset --local`.
3. Copy the local API URL, anon/publishable key, service-role key, and database URL from `supabase status` into the corresponding entries in ignored `.env.local`. Use the direct local database URL on port 54322 for both admin and runtime connections; the seed script checks the host and port.
4. Set `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` and `NEXT_PUBLIC_APP_ENV=local`; the origin must match the URL you use in the browser. Generate a local runtime password with `openssl rand -hex 32`; set it as `KNOWLEDGE_RUNTIME_PASSWORD` and in the `DATABASE_URL` password. Set a synthetic owner email and a unique local-only password of at least 20 characters. Keep `APP_ENV=local`.
5. Run `npm run seed:local`, then `npm run dev:console`. Sign in at `http://127.0.0.1:3000/login` using the synthetic owner credentials.
6. Upload a synthetic FAQ/PDF/CSV, review the extracted source, approve it, and test citation search. No visitor chat or generated model answer is included in this slice.
7. To discard local data, stop the app and run `supabase stop --no-backup`.

The machine used for this candidate currently has no Docker daemon, so the local Supabase browser-to-storage flow has not been run here. Automated checks do not replace that E2E trace. See the task report for evidence and limits.

## Architecture scope

Next.js + TypeScript + Supabase Auth/Postgres/private Storage are approved for the local synthetic host task. This does not approve hosted region, production architecture, deployment, model provider, or spend. No LangChain/Qdrant/Redis by default.

## Cloud Codex handoff

Open `tasks/TASK-001-FOUNDATION.md` as first scoped Codex Cloud task, on its own branch/PR. Run `npm ci && npm run check`, keep production/remote credentials out and do not auto-merge. Task 002 depends on completing Task 001.

## Private source separation

Four local source repository copies remain under `source-repos/` and are **intentionally excluded by .gitignore**, as are private local docs under `docs/` and copy verification under `_migration/`. They are not published or available to Codex Cloud.

This repository contains original boundary implementations informed by reviewed designs plus a small, itemised source import authorised by the Owner on 2026-10-25. Each imported item is rewritten in this repository's style, listed file-by-file with its source path and commit, and recorded in [SOURCE-IMPORT-PROVENANCE.md](architecture/SOURCE-IMPORT-PROVENANCE.md) together with its secret scan. Bulk copying a private repository remains prohibited; any further import needs its own licensing, secret and provenance review.

[Public architecture overview](ARCHITECTURE.md) · [Proposed decisions](architecture/DECISIONS.md)

License: not selected; no new outbound license grant is asserted for source code.
