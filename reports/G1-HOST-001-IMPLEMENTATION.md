# G1-HOST-001 — Authenticated knowledge host

Updated: 2026-10-23

## Result

Implemented on `codex/g1-authenticated-knowledge-host` for local synthetic use. The Owner approved Node.js + Next.js + Supabase Auth/Postgres/private Storage and this local-only scope. No hosted resources, credentials, customer data, model provider, deployment, hosted migration, or paid service are part of the change. PR review and the Owner's merge decision remain pending.

The Next.js merchant console authenticates staff through Supabase SSR cookies and derives the workspace from the verified user subject plus active membership and web connection. Suspended workspaces are hidden by RLS and excluded by identity resolution. The request cannot select a workspace. Source routes support FAQ/PDF/CSV, bounded multipart uploads, indexing, review, owner approval, and deterministic source-cited search. Originals are immutable objects in a private bucket; only the server-side adapter receives the local service key, and each accepted original is recorded against its workspace/source/version. Unsupported or malformed PDF/CSV uploads are quarantined and excluded from retrieval. Storage/database failures fail closed and attempt scoped cleanup.

## Proposed operational defaults

These apply only to the local prototype unless separately approved:

- Region: local machine; no hosted region has been approved. Singapore (`ap-southeast-1`) is only a future evaluation proposal.
- Bootstrap: one synthetic owner, one synthetic workspace, and one web connection using the guarded local seed script. Signup stays disabled; credentials belong in ignored `.env.local`.
- File bounds: 5 MiB per file, 100 PDF pages, 5,000 CSV data rows, 100 columns, and 100,000 extracted characters. CSV record cap is 16,384 characters.
- Retention: synthetic data only; recommended local cleanup is `supabase stop --no-backup` when discarding the environment. Future hosted proposal: delete source originals on source deletion and retain backups for 30 days, subject to separate Owner review.

## Verification evidence

- `npm ci` completed and reported zero vulnerabilities at install time.
- `npm run check`: passed; root TypeScript, all 145 tests, and optimized Next production build completed successfully.
- `npm audit`: zero vulnerabilities. `git diff --check`: passed.
- Adapter/migration tests use PGlite for database policy behavior and synthetic fakes for Auth/Storage boundaries. They are not equivalent to running Supabase Auth + Storage + Postgres together.
- The current machine has no Docker daemon (`docker info` cannot connect and Docker Desktop is not installed), so local Supabase startup and authenticated browser-to-Storage end-to-end testing are unavailable here.

## Security and cost boundary

The app sends only the public Supabase URL and publishable/anon key to browser code. Database URL, local service key, and bootstrap credentials are server/local-seed only. Authenticated clients cannot directly list, upload, or delete originals; the local service key is restricted to a server-only adapter with server-resolved workspace paths. PostgreSQL uses a dedicated role checked for superuser, BYPASSRLS, role/database creation, replication, inheritance, and memberships; workspace context is set transaction-locally. Modules remain free of Next.js and Supabase SDK imports. No real provider call is wired, so this task adds no model spend. No hosted security claim is made.

The OpenCode review surfaced 11 findings. This candidate addresses suspended-workspace access, direct authenticated Storage access, duplicate object paths on retries, clickjacking headers, bounded authenticated JSON search, Unicode filename normalization, KnowledgeError responses, broader runtime-role checks, list bounds, and moving the Storage contract into contracts/. Remaining items are route-level test coverage, request rate limiting, atomic revalidation of membership during writes, and an independently run real Supabase/browser trace. The OpenCode review is advisory and is not a substitute for Owner acceptance.

## Remaining gates

1. Second independent review and hosted CI on the PR head.
2. Docker-backed local Supabase reset, synthetic seed, sign-in, upload, approval, citation search, and cross-workspace denial trace.
3. Add route-level authorization/error/body-bound tests and rate limits before any hosted evaluation.
4. Owner review and merge decision.
5. Separate approved tasks for Web Chat, grounded generated answers, durable human takeover, and the broader G1 acceptance trace.

Do not interpret this task as completing G1 or as authorizing hosted setup, production use, deployment, or merge.
