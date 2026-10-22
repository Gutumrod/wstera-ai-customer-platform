# Platform — Boundary-Level TypeScript Scaffold

This directory contains the **existing executable TypeScript baseline** in `src/` and the Phase 0C channel/tenancy contracts and workspace context under `contracts/` and `modules/`. Other feature folders remain responsibility scaffolding until implemented by a scoped task.

**Master goals:** [BRIEF.md](../BRIEF.md). **Module ownership:** [REPOSITORY-STRUCTURE.md](../architecture/REPOSITORY-STRUCTURE.md). **Extension ports:** [PORTS-AND-ADAPTERS.md](../architecture/PORTS-AND-ADAPTERS.md).

README-only folders are not working services. The workspace context moved from `src/core/workspace.ts` to `modules/tenancy/workspace.ts` in Phase 0C; the old path re-exports it for compatibility. No private legacy repo files have been committed to Public Git.

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

Use `plans/ROADMAP.md`, `plans/PHASE-BREAKDOWN.md`, and the current task brief to select the next approved implementation slice. The task must respect the limitations above and not silently promote scaffold to a live service.
