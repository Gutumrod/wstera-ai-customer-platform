# Codex Cloud Tasks

Read [AGENTS.md](../AGENTS.md) and [Master Brief](../BRIEF.md) before editing.

- [TASK-001-FOUNDATION.md](TASK-001-FOUNDATION.md) — PR #2 merged with CI pass; later workspace/channel contract work is PR #5 and remains open for review.
- [TASK-002-RAG-CONTRACT.md](TASK-002-RAG-CONTRACT.md) — G1-A contract/lifecycle/retrieval slice is open as stacked PR #7; remaining persistence, evaluation, and product integration are not complete.
- [TASK-003-DOCUMENT-INGESTION.md](TASK-003-DOCUMENT-INGESTION.md) — bounded local PDF/CSV extraction is implemented on the branch stacked after PR #7; PR review and persistence/upload integration remain pending.
- [TASK-004-THAI-RETRIEVAL-EVALUATION.md](TASK-004-THAI-RETRIEVAL-EVALUATION.md) — synthetic 30-query G1-C baseline; no quality threshold is set without Owner review.
- [TASK-004A-SKU-PUNCTUATION-NORMALIZATION.md](TASK-004A-SKU-PUNCTUATION-NORMALIZATION.md) — G1-C1 follow-up for the measured `ZX650` versus `ZX-650` miss; no retrieval threshold or technology choice is introduced.
- [TASK-005-CONVERSATION-HANDOFF.md](TASK-005-CONVERSATION-HANDOFF.md) — local shared handoff state machine; durable adapter and channel integration remain pending.
- [TASK-006A-CITATION-INTEGRITY.md](TASK-006A-CITATION-INTEGRITY.md) — provider-neutral citation identity validation, locally tested and independently reviewed; no answerability or model generation claim.
- [TASK-006B-RESPONSE-ORCHESTRATION.md](TASK-006B-RESPONSE-ORCHESTRATION.md) — provider-neutral retrieval-to-answer/handoff orchestration core; no model adapter, persistent handoff, or Web Chat integration.
- [TASK-006C-MODEL-ADAPTER.md](TASK-006C-MODEL-ADAPTER.md) — PR #15 open; independently reviewed metered OpenAI-compatible model/answerability adapter with mocked transport; no live provider, pricing, or aggregate spend limit.
- [TASK-007A-POSTGRES-KNOWLEDGE-REPOSITORY.md](TASK-007A-POSTGRES-KNOWLEDGE-REPOSITORY.md) — in progress; workspace-scoped PostgreSQL knowledge persistence with local RLS/transaction integration tests; no hosted database or upload authorization.
- [TASK-ARCH-001-MODULAR-BOUNDARIES.md](TASK-ARCH-001-MODULAR-BOUNDARIES.md) — planned incremental module migration, **blocked** until Task 001 review and owner approval.

Each change: task branch -> scoped PR -> fresh test logs -> security review -> owner merge decision. No automatic deploy or self-merge.
