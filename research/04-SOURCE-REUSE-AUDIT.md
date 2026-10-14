# Legacy Source Reuse Audit — Four Repositories

**Date:** 2026-10-14. The **original source repositories remain private/local**. This public report intentionally includes no source dumps, credentials, full customer documents, or local absolute paths.

### Scope and provenance

Previous review inspected source trees and primary implementation files on GitHub; local copies were verified against their originals at file-hash level. The copied repos remain locally under `source-repos/` and are excluded from this public repository. Source code has not been merged in bulk. Previous unit-test claims are historical and **not** fresh certification of this platform.

| Repository | Verified useful implementation or reference | Risk / missing pieces | Disposition |
|---|---|---|---|
| `line-oa-ai` | LINE signature verification, message/reply client, session/state interfaces, Express webhook test server | Node crypto, memory session, user-only session key, no proven durable event dedupe, real LINE roundtrip still needed | REWRITE small portable boundary with tests; preserve existing module untouched |
| `line-oa-ai-sales-service-engine` | AgentBrain, provider/knowledge/tool ports, conversation/handoff concepts, SaaS product contracts | Static keyword catalog, no file-upload RAG, memory persistence, non-workspace-scoped IDs, mock payment/booking, incomplete policy gate | REUSE contracts/design; do not copy prototype business side effects |
| `ai-resilience-gateway` | Provider abstraction, tenant-context type/validators, rate limiting interfaces | Memory limiter not distributed, public header tenant resolution unsafe without trusted auth, no complete failover engine | REUSE ideas/ports; verify provider adapters separately |
| `ai-service-workflow` | Architecture, backend authorization, event idempotency, audit and rollout checklists | Documentation only; no executable runtime | REFERENCE as workflow/policy authority |

### Key observations

- Do not use `channel + userId` as globally unique conversation identity. Use scoped `workspaceId + channelConnectionId + channelUserId`, opaque IDs where appropriate.
- 'RAG available' in prototype code is false: keyword matching on sample catalog is NOT vector retrieval.
- A handoff summary is not sufficient without durable operator assignment and paused-bot state.
- Do not publish internal source repos wholesale or replace any repository in-place; the user owns them but public redistribution needs review.
- Current public `platform/src/` contains **newly written boundary-level TypeScript code informed by reviewed concepts**, not copied legacy source files. Inspect `architecture/DECISIONS.md` and new unit tests.

### Reuse gate for Codex Cloud

Codex Cloud cannot access gitignored `source-repos/` on the public GitHub environment. Use the above observations and public source references if accessible, or request owner-approved access through private GitHub credentials; do not invent code you cannot inspect. Build new, tested contracts in the public repo without committing private sources by accident. Before the first external PR, review license, sensitive config, OSS attribution and deployment contracts.
