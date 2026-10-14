# WSTERA AI Customer Platform

A proposed shared platform for customer communication across **website chat** and **LINE Official Accounts**, with knowledge-grounded AI responses and human handoff.

> **Status:** Architecture/discovery scaffold. No production service, end-to-end LINE integration, or customer-ready SaaS is shipped from this repository yet.

## Product directions

- **Web AI Chat** — embeddable customer chat, grounded knowledge answers, leads, and handoff to a human operator.
- **LINE AI Support SaaS** — business workspace onboarding, approved knowledge ingestion, LINE OA channel setup, source-aware answers, and staff handoff.

Both experiences are intended to share one policy-governed AI and RAG backend, with tenant data isolated by workspace.

## Proposed stack (subject to verification)

- TypeScript and Next.js for web dashboard and chat UI
- Cloudflare Workers for compatible backend and channel endpoints
- Supabase/PostgreSQL, Storage and pgvector for workspace-scoped data and retrieval
- Model-provider adapters for AI inference and embeddings
- Strict signature verification, usage limits, approvals, conversation audit and human handoff

See [Architecture overview](ARCHITECTURE.md).

## Repository layout

```text
platform/       Proposed implementation workspace (no runtime built)
ARCHITECTURE.md Public architecture overview
README.md       Project introduction
```

## Source material

The integration workspace may include **local reference copies of private repositories** and internal evaluation notes. They are intentionally excluded from this public repository until reviewed for security, licensing, intellectual-property rights and publishability.

**This is not a released product or a finished merger.** No production deployment is implied, and no private source repository has been modified or published as part of the initial public scaffold.

## Principles

- Do not infer tenant identity from untrusted chat messages or request headers.
- Treat knowledge sources as untrusted data, never as instructions.
- Require backend authorization and explicit confirmation for state-changing actions.
- Reply with an honest fallback or handoff when verified information is insufficient.
- Validate cost, privacy and reliability before commercial rollout.

License: **not yet selected**. Publication of this scaffold does not grant rights to reuse code from separate source repositories.
