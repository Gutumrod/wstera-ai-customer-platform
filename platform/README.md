# Platform — Boundary-Level TypeScript Scaffold

This directory contains the **existing executable TypeScript baseline** in `src/`, plus new responsibility-only folder scaffolding under `apps/`, `modules/`, `contracts/`, `adapters/`, `composition/` and `tests/`.

**Master goals:** [BRIEF.md](../BRIEF.md). **Module ownership:** [REPOSITORY-STRUCTURE.md](../architecture/REPOSITORY-STRUCTURE.md). **Extension ports:** [PORTS-AND-ADAPTERS.md](../architecture/PORTS-AND-ADAPTERS.md).

New folders are READMEs only; they are not new working services. No private legacy repo files have been committed to Public Git. Do not move/duplicate existing `src/` during PR #2 review.

## Implemented

- `src/core/workspace.ts` — trusted workspace context with explicit enforcement and immutable identifiers.
- `src/line/signature.ts` — Web Crypto HMAC-SHA256 LINE webhook signature verification.
- `src/line/ingress.ts` — verifies before exposing normalized text events, resolves workspace through injected trusted connection map.
- `src/line/client.ts` — strict LINE text reply transport (no fake success).
- `src/policy/answer-gate.ts` — approved-source candidate filter and cross-workspace denial (NOT a full RAG answerability system).
- `src/tests/core.test.ts` — tests for those boundary contracts.

## Still missing

- Durable event deduplication; per-workspace sessions; authorized persistent human-handoff state.
- Model provider gateway, live RAG ingest/retriever/rerank, semantic answer confidence, citations.
- Chat UI, Web Widget and Admin Dashboard.
- Real LINE Messaging API test, auth, database/RLS, asynchronous delivery and production observability.

## Run

At repo root: `npm ci && npm run check`.

**Next owner-approved task:** `tasks/TASK-001-FOUNDATION.md`. The task must respect the limitations above and not silently promote scaffold to a live service.
