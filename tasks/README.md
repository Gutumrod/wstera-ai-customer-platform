# Codex Cloud Tasks

Read [AGENTS.md](../AGENTS.md) and [Master Brief](../BRIEF.md) before editing.

- [TASK-001-FOUNDATION.md](TASK-001-FOUNDATION.md) — PR #2 merged with CI pass; later workspace/channel contract work is PR #5 and remains open for review.
- [TASK-002-RAG-CONTRACT.md](TASK-002-RAG-CONTRACT.md) — G1-A contract/lifecycle/retrieval slice is open as stacked PR #7; remaining persistence, evaluation, and product integration are not complete.
- [TASK-003-DOCUMENT-INGESTION.md](TASK-003-DOCUMENT-INGESTION.md) — bounded local PDF/CSV extraction is implemented on the branch stacked after PR #7; PR review and persistence/upload integration remain pending.
- [TASK-004-THAI-RETRIEVAL-EVALUATION.md](TASK-004-THAI-RETRIEVAL-EVALUATION.md) — synthetic 30-query G1-C baseline; no quality threshold is set without Owner review.
- [TASK-005-CONVERSATION-HANDOFF.md](TASK-005-CONVERSATION-HANDOFF.md) — local shared handoff state machine; durable adapter and channel integration remain pending.
- [TASK-ARCH-001-MODULAR-BOUNDARIES.md](TASK-ARCH-001-MODULAR-BOUNDARIES.md) — planned incremental module migration, **blocked** until Task 001 review and owner approval.

Each change: task branch -> scoped PR -> fresh test logs -> security review -> owner merge decision. No automatic deploy or self-merge.
