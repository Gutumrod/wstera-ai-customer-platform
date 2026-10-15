# Knowledge Module — G1a local slice

**Status: IMPLEMENTED LOCALLY** on `codex/g1a-knowledge-contracts-20261015`. This is pure TypeScript domain behavior over synthetic FAQ text, not a deployed or persistent product.

## Implemented

- `platform/contracts/data/knowledge.ts`: workspace-scoped source, version, chunk, lifecycle, citation locator (span/page/row/chunk), retrieval query/result and replaceable repository/retrieval ports. The contract requires atomic approval with at most one approved/current version per source.
- `platform/modules/knowledge/index.ts`: FAQ input validation and deterministic chunk spans; source archive and version transition/approval/revocation rules; immutable approved content; deterministic Thai-bigram and literal SKU lexical retrieval; fail-closed no-answer result.
- `platform/modules/knowledge/testing/in-memory-repository.ts`: test-only in-memory repository enforcing scope and version conflicts. It is not a production adapter.
- `platform/modules/knowledge/knowledge.test.ts`: synthetic Thai/SKU, tenant separation and forged selector, approval/revocation/archive, version conflict/immutability, no-match, malformed/oversized content, injection-as-data, and exact citation tests. Included in the existing `npm test` script.

Citation spans are UTF-16 code-unit offsets into the exact stored `content`; hit text is the exact cited slice. Retrieval consumes the server-resolved `TrustedWorkspaceContext`; a client-supplied `workspaceId` selector is rejected. The simple lexical score is a deterministic test baseline, not evaluated Thai semantic search.

## Not implemented

PDF/CSV parsing and production page/row locators, upload/validation workers, persistent database or object storage, pgvector/hybrid search, production authorization/RLS, model answer generation, Web Chat UI, and staff takeover. Untrusted document instructions remain text data; this module has no code path that interprets them as commands.

## Local evidence

- `npm ci --no-audit --no-fund` completed.
- `npm run typecheck` and `npm run build` passed.
- `node --test --test-isolation=none dist/src/tests/core.test.js dist/modules/knowledge/knowledge.test.js`: **21 passed, 0 failed**, including the existing core tests.
- `npm audit --no-fund`: **0 vulnerabilities**; `npm ls --all`: installed dependency tree is limited to TypeScript and Node type packages (no new runtime dependency).
- `npm run check` reached typecheck/build but the default Node test runner failed to spawn child processes (`spawn EPERM`) in this sandbox. The direct single-process test invocation above is local evidence only; it does not change that runner limitation.
- `git diff --check`: passed.

## Next executable slice

Add a persisted FAQ repository and an authenticated upload/approval path with isolation tests. Then add bounded PDF and CSV extractors that produce page/row locators. Keep retrieval behind `KnowledgeRetrievalPort`; evaluate Thai/SKU recall before selecting pgvector/tokenizer/reranking. Web chat, model generation and staff handoff remain later slices.
