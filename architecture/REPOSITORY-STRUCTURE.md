# Repository Structure — Modular Extension Map

**Status:** Folder organization is the approved direction; runtime/package boundaries remain PROPOSED pending validation. Most feature folders are responsibility markers; Phase 0C implements the channel contracts and trusted workspace boundary in `platform/contracts/channels/` and `platform/modules/tenancy/`.

## Root

```text
wstera-ai-customer-platform/
├─ BRIEF.md                     Owner-locked product goals
├─ AGENTS.md                    Codex/agent operating rules
├─ research/                    Sources + findings; no private source dumps
├─ architecture/                Ports, design decisions, structural contracts
├─ plans/                       Phase plan, gates, backlog dependencies
├─ tasks/                       Single-scope Codex task briefs
├─ platform/
│  ├─ apps/
│  │  ├─ web-chat/              Website widget/iframe and loader
│  │  ├─ merchant-console/      Merchant onboarding, knowledge QA, staff Inbox
│  │  └─ line-webhook/          LINE webhook host/runtime binding
│  ├─ modules/                  Provider-neutral domain/application logic
│  │  ├─ tenancy/               Workspace/user/connection authorization
│  │  ├─ conversation/          Thread lifecycle, delivery, state transitions
│  │  ├─ knowledge/             Source lifecycle, extraction, retrieval policy
│  │  ├─ ai-engine/             Answer orchestration, citations, safety policy
│  │  ├─ handoff/               Agent ownership, pause/resume, escalation
│  │  └─ usage/                 Usage caps and spend budget contracts
│  ├─ contracts/                Host-independent ports and DTO schemas
│  │  ├─ channels/              Inbound/outbound normalized envelopes
│  │  ├─ tenancy/               Trusted workspace identity contracts
│  │  ├─ models/                Model/embedding provider interfaces
│  │  ├─ data/                  Repository, vector, object-store, job queue ports
│  │  └─ business-actions/      Auth/confirm/audit action lifecycle
│  ├─ adapters/                 Replaceable implementations of ports
│  │  ├─ channels/
│  │  │  ├─ web/                Browser chat wire protocol
│  │  │  └─ line/               LINE signature/webhook/reply transport
│  │  ├─ models/openai-compatible/
│  │  ├─ retrieval/pgvector/
│  │  ├─ persistence/supabase/
│  │  └─ storage/supabase/
│  ├─ composition/              Application assembly and DI wiring
│  ├─ tests/                    Cross-adapter contract and E2E fixtures
│  └─ src/                      CURRENT existing boundary code; do not move now
└─ .github/workflows/           CI/quality gates
```

## Dependency direction (mandatory)

```text
apps (HTTP/React/Workers entrypoints) ----> composition ------> application modules
                                                          \
adapters (model/channel/database/vendor) ----> contract ports <--- modules (depend on ports)
```

- App is responsible for transport and composition only; it never owns RAG algorithm or business policy.
- Domain/application modules import ONLY `contracts/` and their own pure domain objects; no imports from Next.js, Workers, LINE SDK, Supabase SDK or specific model vendors.
- Adapters implement interfaces in `contracts/`; they may use vendor SDKs.
- Composition owns wiring, environment validation, feature flags and explicit per-workspace provider choice.
- UI apps may use presentation-specific libraries but must call shared engine use cases.
- No shared mutable `currentTenant` singleton or trusted client-supplied workspace header.
- The same channel input must normalize into one `InboundMessage` contract; the same source retrieval/answer policy must serve Web and LINE.
- New channel = add `contracts/channels` implementation, `adapters/channels/<provider>`, host endpoint in `apps/`, contract tests and auth ownership mapping; **do not create second RAG engine**.
- New AI provider = implement `ModelPort`/`EmbeddingPort` under `adapters/models/<provider>`, add cost/config/error mapping and contract tests; no changes to conversation business rules.
- New database/vector store = implement data/retrieval ports, migration + isolation tests and source consistency checks; modules stay unchanged.

## Evolving from the existing scaffold

Existing code in `platform/src/core|line|policy` remains a live source baseline. Phase 0C moved the trusted workspace context implementation to `platform/modules/tenancy/` and preserved its old import path as a compatibility export. This was a scoped boundary migration, not a mass move. Later refactor PRs must move files incrementally, preserve tests, adjust exports/imports, and produce compatibility evidence; other target folders remain responsibility markers until implemented.

## Architecture evolution safety

- One owning module per feature; cross-module calls through ports/events, never reach into another module's tables.
- Every new adapter has an explicit interface, negative tests, failure taxonomy, resource budget and a rollback path.
- Keep `package.json` and workspace tooling simple initially; do **not** convert all folders into independent npm packages just to look modular.
- Avoid speculative support for Messenger/WhatsApp today; reserve an extension contract, build on measured demand.
- Public tree must never include `source-repos/`, `docs/` (internal), `_migration/` or live customer knowledge.
