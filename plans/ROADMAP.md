# WSTERA AI Customer Platform — Evidence-Gated Roadmap

Status: proposed work plan for Codex Cloud. No implied production approval.

## Product vision (locked for planning)

1. **Web AI Chat**: business installs a website widget; AI answers from approved workspace knowledge; offers staff takeover when needed.
2. **LINE AI Support SaaS**: business signs up, uploads its own PDF/CSV/FAQ, tests AI, connects its LINE OA, handles escalations in a controlled Inbox.
3. **One shared engine**: source-grounded knowledge, provider routing, policy, tenant isolation, durable conversation/handoff, usage metering. Extension channels later.

## Phases and gates

| Phase | Scope | Evidence to pass |
|---|---|---|
| 0. Cloud foundation & security boundary | Docs, CI, trust boundary, repo verification | Public repo scan + reproducible tests + PR discipline |
| 1. RAG vertical slice + Web Chat | One isolated workspace, upload FAQ/PDF test fixture, extract/chunk/index/search, citations, basic Web UI | Thai+SKU eval set, unknown fallback, source verifiability, zero cross-tenant access |
| 2. LINE OA controlled pilot | Signed webhook, destination-owner tenant resolver, durable dedupe, timeouts, staff handoff, live sandbox | Actual LINE round-trip and human pause/resume with evidence |
| 3. Repeatable SaaS onboarding | Workspaces, auth/RBAC, per-shop documents and rules, connection guided setup, usage limits, operations | Second shop self-onboards, negative tenant isolation, restore/deletion drills |
| 4. Commercial pilot | Pricing, subscription, usage cost attribution, support/legal/PDPA review | Owner-approved launch gate and observed unit economics |

## Gate 0 acceptance

- Public root repo contains only approved files, no gitignored legacy source.
- `npm ci && npm run check` green on Windows or CI; zero external API keys.
- `.github/workflows/ci.yml` exercises checks.
- Codex task briefs have explicit deliverables, tests, stop conditions.
- Research contains source URL and separates verified provider docs from untested assertions.

## Gate 1: Thai knowledge evaluation minimum

Use synthetic shop materials first. At least 30 varied Thai queries across FAQ, PDF, CSV, SKU spelling, contradiction, forbidden topics, no-answer and prompt injection. Report recall@k, answer grounding, citation precision, bad answer rate, P50/P95 latency and estimated cost. Set pass thresholds only after baseline and owner review.

## Gate 2: LINE safety minimum

HMAC fail-closed, event replay dedupe, workspace ownership enforcement, empty verification events, max inbound size, graceful timing, durable handoff pause/authorized release, failed provider/no data fallback, and documented human operator workflow. Real sandbox proof REQUIRED before any paid rollout.

## Gate 3 and 4 are blocked until prerequisites

- Multi-tenant backend enforcement + offboarding/delete + no leakage through retrieval/logs.
- Exact LINE takeover flow verified under supported manager setting.
- Rate limit shared store, abuse controls, spend ceilings, backup/recovery and operational alert owner.
- Billing/legal terms and unit economics from measured provider use, not assumed margins.

## Codex Cloud task sequence

1. [Task 001 — Harden foundation](../tasks/TASK-001-FOUNDATION.md)
2. [Task 002 — Data and RAG contract](../tasks/TASK-002-RAG-CONTRACT.md)
3. Task 003 (not yet issued): synthetic fixtures + ingestion, Thai hybrid retrieval evaluation.
4. Task 004 (not yet issued): Web UI, operator handoff.
5. Task 005 (not yet issued): real LINE sandbox pilot.

**Owner is final approval authority.** Do not merge features / deploy without review.
