# Task HOST-002 — Harden the local authenticated host boundary

**Status: PLANNED — do not start without Owner GO/dispatch.** Base: `main` @ `9b4f997`. Follows merged G1-HOST-001 (PR #18). Owner decisions 2026-10-25: host hardening runs before Web Chat.

## Goal

Close the three gaps PR #18 left open — route-level tests, request rate limiting and the membership-revalidation race — and re-establish a fresh CI result for the base commit. No new product surface.

## Scope

- **Route tests** for `GET/POST /api/knowledge/sources`, `POST /api/knowledge/sources/[sourceId]/versions/[versionId]/approve`, `POST /api/knowledge/search`: unauthenticated, cross-workspace, oversized body, malformed JSON, wrong content type, unknown fields, quarantined file. Tests must assert status code, error code and that no row/object was written.
- **Rate limiting**: bounded in-memory per-identity limiter on upload and search. No new dependency. Mark the multi-instance ceiling with a `ponytail:` comment naming the upgrade path (shared store) and document that it resets per process.
- **Membership revalidation**: an active-membership check must run inside the same database transaction as every knowledge write, so a membership revoked after identity resolution cannot still write. Actor identity comes from the verified session only — never from request body or query. Add the required grant (`SELECT ON public.workspace_memberships TO knowledge_runtime`) in a new migration; do not widen RLS policies to trust request data.
- **M1 — split approval privilege from ingest** (carried debt from `REVIEW-PR18-2026-10-25.md`, register `D-20261025-08`): the runtime role both sets `app.workspace_id` and holds approval `UPDATE` grants, so whoever holds that credential bypasses the owner-approval gate. Approve through a verified path (e.g. `SECURITY DEFINER` function taking a server-verified approver id, or approval via the `authenticated` role) instead of the ingest role.
- **M2 — load bounds**: search currently reads every retrievable chunk in the app (`modules/knowledge/index.ts:477`); add a SQL-side shortlist/candidate bound, and cap PDF worker concurrency (the extractor spawns a resource-limited worker per file).
- **M3 — connection visibility**: members can read every connection row including LINE channel ids; restrict the policy to `channel = 'web'` or owner-only.
- **Review Low items**: `putOriginal` workspace-prefix check parity with `removeOriginal`, quarantine object orphan on replay, error classification by substring (`includes("CONFLICT")`), missing `assertSameOrigin` on GET, `"::1"` vs `[::1]` host check, duplicate web connection causing login failure.
- **CI**: obtain a fresh unified CI result for `9b4f997` (or the merge commit) and record the run ID.

## Out of scope

Web Chat, model/provider calls, hosted deployment, hosted migration, changes to the `app.workspace_id` GUC model, and any business-action work.

## Acceptance

- New tests fail against the current code and pass after the fix (record both runs).
- Revocation test: resolve identity → revoke the membership → attempt a write → write rejected, no rows.
- Cross-workspace negative cases pass at route and repository level.
- M1–M3 are either closed with tests or explicitly carried as Gate-3 blockers signed off by the Owner — do not silently leave them.
- `npm run check` passes; `git diff --check` passes.
- Independent reviewer (not the author) reports no actionable High/Medium findings on the final candidate.

## Stop conditions

- If the revalidation fix requires changing `TrustedWorkspaceContext` in a way that also changes LINE adapter contracts, stop and report instead of editing contracts broadly.
- If Docker/Supabase is unavailable, this task is not blocked; do not substitute mocks for the separate E2E task.

## Evidence

```
EVIDENCE .worktrees/docs-g1-plan-20261025 supabase/migrations/20261022000100_knowledge.sql:131-133 @9b4f997 "CREATE POLICY knowledge_sources_workspace_policy ON knowledge_sources USING (workspace_id = current_setting('app.workspace_id', true))"
EVIDENCE .worktrees/docs-g1-plan-20261025 supabase/migrations/20261023000100_g1_workspace_host.sql:44-48 @9b4f997 "AND membership.user_id = (SELECT auth.uid()) AND membership.status = 'active'"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/adapters/persistence/postgres/knowledge-repository.ts:364 @9b4f997 "await query.query(\"SELECT set_config('app.workspace_id', $1, true)\", [workspace.workspaceId]);"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/contracts/tenancy/index.ts:5-9 @9b4f997 "workspaceId: string; connectionId: string; channel: ChannelId;"
EVIDENCE .worktrees/docs-g1-plan-20261025 supabase/migrations/20261023000100_g1_workspace_host.sql:78 @9b4f997 "GRANT SELECT ON public.knowledge_sources, public.knowledge_versions, public.knowledge_chunks TO knowledge_runtime;"
EVIDENCE .worktrees/docs-g1-plan-20261025 supabase/migrations/20261023000100_g1_workspace_host.sql:83-84 @9b4f997 "GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason) ON public.knowledge_versions TO knowledge_runtime;"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/adapters/persistence/postgres/knowledge-intake-audit.ts:49 @9b4f997 "await query.query(\"SELECT set_config('app.workspace_id', $1, true)\", [workspace.workspaceId]);"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/modules/knowledge/index.ts:477 @9b4f997 "const retrievableItems = await repository.listRetrievableChunks(query.workspace);"
EVIDENCE .worktrees/docs-g1-plan-20261025 supabase/migrations/20261023000100_g1_workspace_host.sql:63-65 @9b4f997 "CREATE POLICY workspace_connections_member_read ON public.workspace_connections FOR SELECT TO authenticated USING (public.is_active_workspace_member(workspace_id));"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/adapters/knowledge/document-extractor.ts:112-114 @9b4f997 "const worker = new Worker(PDF_WORKER_PATH, { workerData: { bytes: bytes.slice() }, resourceLimits: PDF_WORKER_RESOURCE_LIMITS });"
```

## PR

Scoped PR with touched paths, fresh test output, security impact, cost impact (none) and remaining blockers. Do not self-merge.
