# Codex Cloud Tasks

Read [AGENTS.md](../AGENTS.md) and [Master Brief](../BRIEF.md) before editing.

- [TASK-001-FOUNDATION.md](TASK-001-FOUNDATION.md) — PR #2 merged with CI pass; later workspace/channel contract work is the consolidated candidate; Owner acceptance remains pending.
- [TASK-002-RAG-CONTRACT.md](TASK-002-RAG-CONTRACT.md) — G1-A contract/lifecycle/retrieval slice is included in the consolidated candidate (formerly PR #7); remaining persistence, evaluation, and product integration are not complete.
- [TASK-003-DOCUMENT-INGESTION.md](TASK-003-DOCUMENT-INGESTION.md) — bounded local PDF/CSV extraction merged in PR #16; authenticated upload with private original-file storage and quarantine merged in PR #18 (local synthetic, hardened by PR #26/#28); no hosted processing, and the PDF worker path does not run on Cloudflare Workers.
- [TASK-004-THAI-RETRIEVAL-EVALUATION.md](TASK-004-THAI-RETRIEVAL-EVALUATION.md) — synthetic 30-query G1-C baseline; no quality threshold is set without Owner review.
- [TASK-004A-SKU-PUNCTUATION-NORMALIZATION.md](TASK-004A-SKU-PUNCTUATION-NORMALIZATION.md) — G1-C1 follow-up for the measured `ZX650` versus `ZX-650` miss; no retrieval threshold or technology choice is introduced.
- [TASK-005-CONVERSATION-HANDOFF.md](TASK-005-CONVERSATION-HANDOFF.md) — local shared handoff state machine; durable adapter and channel integration remain pending.
- [TASK-006A-CITATION-INTEGRITY.md](TASK-006A-CITATION-INTEGRITY.md) — provider-neutral citation identity validation, locally tested and independently reviewed; no answerability or model generation claim.
- [TASK-006B-RESPONSE-ORCHESTRATION.md](TASK-006B-RESPONSE-ORCHESTRATION.md) — provider-neutral retrieval-to-answer/handoff orchestration core; no model adapter, persistent handoff, or Web Chat integration.
- [TASK-006C-MODEL-ADAPTER.md](TASK-006C-MODEL-ADAPTER.md) — included in the consolidated candidate (formerly PR #15); previously reviewed metered OpenAI-compatible model/answerability adapter with mocked transport; no live provider, pricing, or aggregate spend limit.
- [TASK-007A-POSTGRES-KNOWLEDGE-REPOSITORY.md](TASK-007A-POSTGRES-KNOWLEDGE-REPOSITORY.md) — merged (PR #16; `visibility` added by PR #30); workspace-scoped PostgreSQL knowledge persistence with local RLS/transaction integration tests on PGlite; no hosted database, hosted migration or production connection.
- [TASK-CI-001-CROSS-BRANCH-PR-CHECKS.md](TASK-CI-001-CROSS-BRANCH-PR-CHECKS.md) — CI runs on pull requests targeting any branch.
- [TASK-ARCH-001-MODULAR-BOUNDARIES.md](TASK-ARCH-001-MODULAR-BOUNDARIES.md) — approved I1/single-boundary I2 migration is implemented in the candidate; later increments remain gated.
- HOST-004 — MERGED (PR #25, `acb0e9e`), BUILD_PASS only; `APP_ENV=lab` mode fails closed. No separate task brief file; no lab or hosted run is claimed.
- [TASK-HOST-002-HOST-HARDENING.md](TASK-HOST-002-HOST-HARDENING.md) — MERGED (PR #26, fixes in PR #28), BUILD_PASS only; route tests, rate limiting, transactional membership revalidation, M1–M3. PGlite evidence; migrations not run on Supabase.
- [TASK-WEBCHAT-001-VISITOR-CHAT.md](TASK-WEBCHAT-001-VISITOR-CHAT.md) — MERGED (PR #30–#33), BUILD_PASS only; visitor chat with extractive cited answers and the model path behind an off-by-default flag. No real host serves it yet.
- [TASK-HANDOFF-002-DURABLE-HANDOFF.md](TASK-HANDOFF-002-DURABLE-HANDOFF.md) — implemented locally on `codex/aicp-handoff-002-20261105`; PGlite evidence only, hosted not run, independent review pending.
- [TASK-G1-ACCEPT-001-ACCEPTANCE-TRACE.md](TASK-G1-ACCEPT-001-ACCEPTANCE-TRACE.md) — PLANNED; one-shop trace on `wstera-lab` and cross-workspace negative cases.

Current PR status and merge gates: [Execution Status](../plans/EXECUTION-STATUS.md). Earlier PR references in task histories describe their original checkpoints.

Each change: task branch -> scoped PR -> fresh test logs -> security review -> owner merge decision. No automatic deploy or self-merge.
