# Independent Review: AICP HOST-002 Fix Round 1 (Findings F1, F2, F5, F6)

**Target Revision:** `claude/aicp-host-002-fix-20261103` @ `4201b0d` (`4201b0dada080310d7060d1019288bc035b19c0f`)  
**Base Revision:** `7de2649` (`7de264922d88b29272c281c05e520e358fe6b031`)  
**Working Directory:** `D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103`  
**Reviewer:** Antigravity (AGY Windows) — Independent Reviewer (non-author)  
**Applicable Decisions:** D-20261025-08, D-20261025-11, D-20261103-01, D-20261103-20 (Rule 7E: Dual OpenCode + AGY review; Round 1 of at most 3)

---

## 1. Acceptance Plan & Order of Verification

Before reading the builder report (`REPORT-HOST-002-FIX.md`), new tests, or the commit message of `4201b0d`, the following independent acceptance criteria and verification sequence were derived from the requirements and threat model:

1. **Baseline Integrity & Repository Verification:**
   - Verify HEAD commit is `4201b0d`.
   - Run `npm run typecheck` to confirm strict TypeScript compilation.
   - Run `npm test` without modification to observe test suite output (226 expected tests).
2. **F1: Authorization & Privilege Separation for Revoke & Archive:**
   - **Database Functions Definition:** Audit `aicp.revoke_knowledge_version` and `aicp.archive_knowledge_source`:
     - Must be `SECURITY DEFINER`.
     - `search_path` must be explicitly pinned to `pg_catalog, aicp`.
     - Must be owned by `aicp_migrator`.
     - `EXECUTE` revoked from `PUBLIC` and granted strictly to `authenticated`.
     - Revoker/archiver actor must be derived strictly inside SQL from `(SELECT auth.uid())::text`, rejecting `NULL`.
     - Role must be checked inside SQL via `aicp.assert_active_knowledge_writer(...) = 'owner'`.
     - Cross-workspace isolation: Must enforce `workspace_id = target_workspace_id`.
     - State prerequisites: Must require `version.status = 'approved'` and lock rows with `FOR UPDATE`.
   - **Runtime Privilege Deprivation:**
     - `REVOKE UPDATE (revoked_at, revoked_by, revocation_reason)` on `aicp.knowledge_versions` from `knowledge_runtime`.
     - `REVOKE UPDATE (status)` on `aicp.knowledge_sources` from `knowledge_runtime`.
     - Verify direct update of `status = 'revoked'` by `knowledge_runtime` violates CHECK constraints (`knowledge_versions_check1`).
     - Verify `knowledge_runtime` cannot forge `revoked_by`.
   - **Lock Handle & Source Guard Trigger:**
     - Controller design decision audit: Verify `GRANT UPDATE (created_at) ON aicp.knowledge_sources TO knowledge_runtime` allows `SELECT ... FOR UPDATE` row locks needed during ingest (`createSource` conflict path, `createVersion`).
     - Audit `BEFORE UPDATE` trigger `knowledge_source_identity_guard` on `aicp.knowledge_sources`:
       - Must reject changes to identity columns (`workspace_id`, `source_id`, `kind`, `title`, `created_at`) with SQLSTATE `23514`.
       - Must allow identity-preserving updates (`created_at = created_at`) as lock handle without altering data.
       - Verify trigger function `aicp.protect_knowledge_source_identity()` has pinned `search_path = pg_catalog, aicp`.
   - **Adapter Implementation:**
     - Verify `SupabaseKnowledgeRevocation` is declared alongside adapters without polluting shared domain contracts.
3. **F2: Fail-Closed Actor Validation & Test Opt-Out:**
   - `assertActiveWriter` must reject missing, empty, null, or invalid actor values (`MEMBERSHIP_REQUIRED`).
   - `PostgresKnowledgeRepository` and `PostgresKnowledgeIntakeAudit` constructors must require `actorUserId: KnowledgeWriterActor`.
   - Opt-out token `NO_ACTOR_FOR_SCHEMA_TESTS` must be a module-scoped unforgeable `Symbol`.
   - String lookalikes (e.g. `"NO_ACTOR_FOR_SCHEMA_TESTS"`, `"Symbol(NO_ACTOR_FOR_SCHEMA_TESTS)"`) from requests must fail closed.
   - Production wiring (`platform/composition/merchant-knowledge-host.ts`) must never import or touch `NO_ACTOR_FOR_SCHEMA_TESTS`.
4. **F5: Web Connection Duplicates Pre-Check Script:**
   - Verify `scripts/check-web-connection-duplicates.sql` is strictly read-only (`SELECT` only, zero write/DDL statements).
   - Verify duplicate query predicate matches the partial unique index: `channel = 'web' AND status = 'active'` grouped by `workspace_id` with `HAVING count(*) > 1`.
   - Confirm merged migrations (`20261103000100_host_hardening.sql`) remain completely untouched.
5. **F6: Approve Route Read-Back Resiliency:**
   - Verify `approveVersion` in `platform/apps/merchant-console/lib/knowledge-routes.ts`:
     - If `approval.approve(...)` succeeds but `repository.getVersion(...)` throws or returns null/falsy, the route must return HTTP 200 with minimal data `{ data: { sourceId, versionId, status: "approved" } }` and `Cache-Control: no-store`.
     - If `approval.approve(...)` fails (e.g. `OWNER_ROLE_REQUIRED`, `VERSION_NOT_FOUND`, `APPROVAL_NOT_ELIGIBLE`), it must STILL return the appropriate error response and never mask errors as 200.
6. **Regression & Test Assertion Quality:**
   - Audit `git diff 7de2649..4201b0d` for deleted or relaxed test assertions.
   - Verify that all 226 tests pass cleanly.
7. **Throwaway Probe Execution (Outside Repo Tree):**
   - Construct and execute comprehensive standalone PGlite probes in scratch directory (`C:/Users/Win11/.gemini/antigravity-cli/brain/3c17a725-9e11-45ca-9816-d1b28c483448/scratch/probe_host002_fix.mjs`) to test the attack matrix.
8. **Informed Verification:**
   - Reconcile independent findings with `REPORT-HOST-002-FIX.md` and commit `4201b0d`.

---

## 2. Context Exposed

During this review, the following artifacts were examined:
- Findings F1-F6 from [review-host-002-20261103/REVIEW-HOST-002-OPENCODE.md](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-20261103/REVIEW-HOST-002-OPENCODE.md) and [REVIEW-HOST-002-AGY.md](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-20261103/REVIEW-HOST-002-AGY.md).
- Git diff `7de2649..4201b0d` across all 15 modified files.
- Migration files:
  - [supabase/migrations/20261022000100_knowledge.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/supabase/migrations/20261022000100_knowledge.sql)
  - [supabase/migrations/20261023000100_g1_workspace_host.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/supabase/migrations/20261023000100_g1_workspace_host.sql)
  - [supabase/migrations/20261103000100_host_hardening.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/supabase/migrations/20261103000100_host_hardening.sql)
  - [supabase/migrations/20261103000200_host_hardening_revoke.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/supabase/migrations/20261103000200_host_hardening_revoke.sql)
- Application and adapter code:
  - [platform/adapters/persistence/postgres/knowledge-repository.ts](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-repository.ts)
  - [platform/adapters/persistence/postgres/knowledge-intake-audit.ts](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-intake-audit.ts)
  - [platform/adapters/persistence/supabase/knowledge-revocation.ts](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/supabase/knowledge-revocation.ts)
  - [platform/apps/merchant-console/lib/knowledge-routes.ts](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/apps/merchant-console/lib/knowledge-routes.ts)
  - [platform/composition/merchant-knowledge-host.ts](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/composition/merchant-knowledge-host.ts)
  - [scripts/check-web-connection-duplicates.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/scripts/check-web-connection-duplicates.sql)
- Commit message of `4201b0d` and builder report [REPORT-HOST-002-FIX.md](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/REPORT-HOST-002-FIX.md) (withheld initially, consulted during informed verification).

---

## 3. Verification Commands & Real Repository Evidence

### 3.1 Typecheck
- **Command:** `npm run typecheck`
- **Output:** Clean exit 0 (`tsc --noEmit`).

### 3.2 Test Suite Execution
- **Command:** `npm test`
- **Output:**
  ```text
  # tests 226
  # suites 0
  # pass 226
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4296.8389
  ```
  All 226 tests passed cleanly (up from 216 baseline in PR #26; +9 tests in `host-hardening-revoke.test.ts`, +1 test in `merchant-knowledge-routes.test.ts`).

### 3.3 Throwaway Standalone In-Memory (PGlite) Probe Evidence
A comprehensive verification probe was executed outside the repository tree at `C:/Users/Win11/.gemini/antigravity-cli/brain/3c17a725-9e11-45ca-9816-d1b28c483448/scratch/probe_host002_fix.mjs`.

**Probe Execution Results:**
```text
=== COMPREHENSIVE INDEPENDENT VERIFICATION PROBE ===

--- Section 1: Runtime Role (knowledge_runtime) Restrictions ---
[PASS] 1.1 Direct revoke as runtime (caught code=42501, msg=permission denied for table knowledge_versions)
[PASS] 1.2 Direct forge revoked_by as runtime (caught code=42501, msg=permission denied for table knowledge_versions)
[PASS] 1.3 Direct flip status='revoked' on approved version (caught code=23514, msg=new row for relation "knowledge_versions" violates check constraint "knowledge_versions_check1")
[PASS] 1.4 Direct archive source as runtime (caught code=42501, msg=permission denied for table knowledge_sources)
[PASS] 1.5 Change title on source as runtime (caught code=42501, msg=permission denied for table knowledge_sources)
[PASS] 1.6 Change kind on source as runtime (caught code=42501, msg=permission denied for table knowledge_sources)
[PASS] 1.7 Change created_at on source as runtime (trigger guard) (caught code=23514, msg=knowledge source identity is immutable)
[PASS] 1.8 Keep created_at same as runtime (lock handle allowed)
[PASS] 1.9 Row lock SELECT ... FOR UPDATE on source succeeded
[PASS] 1.10 Call revoke_knowledge_version as runtime (caught code=42501, msg=permission denied for function revoke_knowledge_version)
[PASS] 1.11 Call archive_knowledge_source as runtime (caught code=42501, msg=permission denied for function archive_knowledge_source)
[PASS] 1.12 repo.revokeVersion as runtime (caught code=CROSS_WORKSPACE_ACCESS_DENIED, msg=CROSS_WORKSPACE_ACCESS_DENIED)
[PASS] 1.13 repo.archiveSource as runtime (caught code=CROSS_WORKSPACE_ACCESS_DENIED, msg=CROSS_WORKSPACE_ACCESS_DENIED)

--- Section 2: anon / PUBLIC Permissions ---
[PASS] 2.1 Call revoke_knowledge_version as anon (caught code=42501, msg=permission denied for schema aicp)
[PASS] 2.2 Call archive_knowledge_source as anon (caught code=42501, msg=permission denied for schema aicp)

--- Section 3: Authenticated Non-Owner (Staff) ---
[PASS] 3.1 Staff call revoke_knowledge_version (caught code=AC001, msg=OWNER_ROLE_REQUIRED)
[PASS] 3.2 Staff call archive_knowledge_source (caught code=AC001, msg=OWNER_ROLE_REQUIRED)

--- Section 4: Cross-Workspace Owner ---
[PASS] 4.1 Owner B call revoke on shop-a (caught code=AC001, msg=MEMBERSHIP_REQUIRED)
[PASS] 4.2 Owner B call archive on shop-a (caught code=AC001, msg=MEMBERSHIP_REQUIRED)

--- Section 5: Null / Missing Actor ---
[PASS] 5.1 Revoke with null auth.uid() (caught code=AC001, msg=MEMBERSHIP_REQUIRED)
[PASS] 5.2 Archive with null auth.uid() (caught code=AC001, msg=MEMBERSHIP_REQUIRED)

--- Section 6: Input Validation & Pre-requisites ---
[PASS] 6.1 Revoke with empty reason (caught code=AC001, msg=INVALID_KNOWLEDGE_INPUT)
[PASS] 6.2 Revoke with oversized reason (>500 chars) (caught code=AC001, msg=INVALID_KNOWLEDGE_INPUT)
[PASS] 6.3 Revoke non-existent version (caught code=AC001, msg=VERSION_NOT_FOUND)
[PASS] 6.4 Archive non-existent source (caught code=AC001, msg=SOURCE_NOT_FOUND)

--- Section 7: Authorized Owner Operations ---
[PASS] 7.1 Authorized revoke succeeded with verified row contents
[PASS] 7.2 Revoke already revoked version (caught code=AC001, msg=REVOCATION_NOT_ELIGIBLE)
[PASS] 7.3 Authorized archive succeeded with status=archived

--- Section 8: F2 Fail-Closed Actor in Adapters ---
[PASS] 8.1 Repository with undefined actor fails closed (caught code=MEMBERSHIP_REQUIRED, msg=MEMBERSHIP_REQUIRED)
[PASS] 8.2 Repository with empty string actor fails closed (caught code=MEMBERSHIP_REQUIRED, msg=MEMBERSHIP_REQUIRED)
[PASS] 8.3 Repository with string lookalike actor fails in DB (caught code=MEMBERSHIP_REQUIRED, msg=MEMBERSHIP_REQUIRED)
[PASS] 8.4 Repository with Symbol(NO_ACTOR_FOR_SCHEMA_TESTS) creates source
[PASS] 8.5 Audit with undefined actor fails closed (caught code=MEMBERSHIP_REQUIRED, msg=MEMBERSHIP_REQUIRED)

--- Section 9: F6 Approve Route 200 Minimal Data on Read-Back Failure ---
[PASS] 9.1 Approve route returned 200 with minimal data when read-back threw an error
[PASS] 9.2 Approve route returned 403 when approval RPC failed (not masked)

=== ALL INDEPENDENT VERIFICATION CHECKS PASSED ===
```

---

## 4. Detailed Technical Audits

### 4.1 F1: Revoke and Archive Hardening & Ingest Row-Lock Mechanics

#### 4.1.1 Function Architecture & Privileges
- **Migration Location:** [supabase/migrations/20261103000200_host_hardening_revoke.sql#L4-L81](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/supabase/migrations/20261103000200_host_hardening_revoke.sql#L4-L81)
- **Search Path:** Both functions pin `search_path`:
  - Line 8: `SET search_path = pg_catalog, aicp` on `aicp.revoke_knowledge_version`
  - Line 58: `SET search_path = pg_catalog, aicp` on `aicp.archive_knowledge_source`
- **Ownership & Grants:**
  - Lines 50-52 & 79-81:
    ```sql
    ALTER FUNCTION aicp.revoke_knowledge_version(...) OWNER TO aicp_migrator;
    REVOKE ALL ON FUNCTION aicp.revoke_knowledge_version(...) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION aicp.revoke_knowledge_version(...) TO authenticated;

    ALTER FUNCTION aicp.archive_knowledge_source(...) OWNER TO aicp_migrator;
    REVOKE ALL ON FUNCTION aicp.archive_knowledge_source(...) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION aicp.archive_knowledge_source(...) TO authenticated;
    ```
    `knowledge_runtime` and `anon`/`PUBLIC` have no execute permissions. Attempts to invoke them result in SQLSTATE `42501` (Probe 1.10, 1.11, 2.1, 2.2).
- **Actor Identity & Authorization:**
  - Revoker is obtained strictly via SQL session claims: `revoker text := (SELECT auth.uid())::text;` (Line 11), rejecting `NULL` with `MEMBERSHIP_REQUIRED` (`AC001`) (Line 15).
  - Archiver is obtained strictly via: `archiver text := (SELECT auth.uid())::text;` (Line 61), rejecting `NULL` with `MEMBERSHIP_REQUIRED` (`AC001`) (Line 64).
  - Owner role verification in SQL: Lines 17-19 and 66-68 invoke `aicp.assert_active_knowledge_writer(...) <> 'owner'` and raise `OWNER_ROLE_REQUIRED` (`AC001`). Staff members and cross-workspace callers are blocked (Probe 3.1, 3.2, 4.1, 4.2).
- **Prerequisite Checks & Lock Ordering:**
  - `revoke_knowledge_version`:
    - Checks input reason non-empty and `<= 500` chars (Line 20).
    - Locks source row: `WHERE source.workspace_id = target_workspace_id AND source.source_id = target_source_id FOR UPDATE;` (Lines 25-27), failing with `SOURCE_NOT_FOUND` if absent (Line 29).
    - Locks version row: `WHERE ... version.version_id = target_version_id FOR UPDATE;` (Lines 32-36), failing with `VERSION_NOT_FOUND` if absent (Line 38).
    - Verifies version status: `IF version_status <> 'approved' THEN RAISE EXCEPTION 'REVOCATION_NOT_ELIGIBLE'` (Lines 40-42). Non-approved, indexed, and already-revoked versions are blocked (Probe 6.3, 7.2).

#### 4.1.2 Runtime Role Privilege Deprivation & Controller Decision Audit
- **Revoked Grants:**
  - Lines 86-87:
    ```sql
    REVOKE UPDATE (revoked_at, revoked_by, revocation_reason) ON aicp.knowledge_versions FROM knowledge_runtime;
    REVOKE UPDATE (status) ON aicp.knowledge_sources FROM knowledge_runtime;
    ```
- **Direct Revocation Prevention:**
  - An attempt by `knowledge_runtime` to update `(status, revoked_at, revoked_by, revocation_reason)` fails with `42501 permission denied for table knowledge_versions` (Probe 1.1).
  - An attempt to update `revoked_by` alone fails with `42501` (Probe 1.2).
  - An attempt to update `status = 'revoked'` alone violates table CHECK constraints:
    ```sql
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
      OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    )
    ```
    Because `knowledge_runtime` cannot write `revoked_*` columns, this statement fails with `23514` (Probe 1.3).
- **Source Row Locking via Lock-Handle Grant:**
  - Controller design decision: Ingest operations (`createSource` conflict resolution, `createVersion`, `transitionVersion`) take `SELECT ... FOR UPDATE` locks on `aicp.knowledge_sources`. PostgreSQL engine requires an `UPDATE` privilege on at least one column of the table for `FOR UPDATE` locking.
  - Line 93 grants: `GRANT UPDATE (created_at) ON aicp.knowledge_sources TO knowledge_runtime;`
  - Lines 95-112 establish a `BEFORE UPDATE` trigger on `aicp.knowledge_sources`:
    ```sql
    CREATE FUNCTION aicp.protect_knowledge_source_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, aicp
    AS $$
    BEGIN
      IF ROW(NEW.workspace_id, NEW.source_id, NEW.kind, NEW.title, NEW.created_at)
          IS DISTINCT FROM
         ROW(OLD.workspace_id, OLD.source_id, OLD.kind, OLD.title, OLD.created_at) THEN
        RAISE EXCEPTION 'knowledge source identity is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER knowledge_source_identity_guard
      BEFORE UPDATE ON aicp.knowledge_sources
      FOR EACH ROW EXECUTE FUNCTION aicp.protect_knowledge_source_identity();
    ```
  - **Verification:**
    - Any attempt by `knowledge_runtime` to alter `created_at` (e.g. `created_at + interval '1 day'`) is intercepted by the trigger and rejected with SQLSTATE `23514` (Probe 1.7).
    - Attempts to alter `title`, `kind`, or `status` are rejected upfront with `42501` because no column grant exists for them (Probe 1.4, 1.5, 1.6).
    - Identity-preserving lock-handle updates (`created_at = created_at`) succeed without mutating row data (Probe 1.8).
    - `SELECT 1 FROM aicp.knowledge_sources WHERE source_id = $1 FOR UPDATE` succeeds cleanly for `knowledge_runtime` (Probe 1.9).
    - Ingest version creation and lifecycle transitions (`uploaded` -> `validating` -> `extracting` -> `indexed`) continue working seamlessly (Probe Section 1 / Test suite).

---

### 4.2 F2: Fail-Closed Actor Validation & Test Opt-Out

- **Code Location:** [platform/adapters/persistence/postgres/knowledge-repository.ts#L347-L373](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-repository.ts#L347-L373)
  ```typescript
  export const NO_ACTOR_FOR_SCHEMA_TESTS = Symbol("NO_ACTOR_FOR_SCHEMA_TESTS");
  export type KnowledgeWriterActor = string | typeof NO_ACTOR_FOR_SCHEMA_TESTS;

  export async function assertActiveWriter(query: PostgresQueryPort, workspace: TrustedWorkspaceContext, actorUserId: KnowledgeWriterActor): Promise<void> {
    if (actorUserId === NO_ACTOR_FOR_SCHEMA_TESTS) return;
    if (typeof actorUserId !== "string" || actorUserId.length === 0) throw new KnowledgeError("MEMBERSHIP_REQUIRED");
    try {
      await query.query("SELECT aicp.assert_active_knowledge_writer($1, $2)", [workspace.workspaceId, actorUserId]);
    } catch (error) { ... }
  }

  export class PostgresKnowledgeRepository implements KnowledgeRepositoryPort {
    constructor(private readonly database: PostgresDatabasePort, private readonly actorUserId: KnowledgeWriterActor) {}
  ```
- **Constructor Enforcement:**
  - `actorUserId` is now mandatory in both `PostgresKnowledgeRepository` and `PostgresKnowledgeIntakeAudit` ([knowledge-intake-audit.ts#L42](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-intake-audit.ts#L42)).
  - Invoking without an actor (`new PostgresKnowledgeRepository(database)`) fails at compile-time with TypeScript error TS2554 ("Expected 2 arguments, but got 1").
- **Runtime Fail-Closed Behavior:**
  - Supplying `undefined`, `null`, `""`, or a non-string immediately throws `KnowledgeError("MEMBERSHIP_REQUIRED")` without touching the database (Probe 8.1, 8.2, 8.5).
  - Supplying string lookalikes (e.g. `"NO_ACTOR_FOR_SCHEMA_TESTS"`) fails symbol equality (`===`), executes `SELECT aicp.assert_active_knowledge_writer('shop-a', 'NO_ACTOR_FOR_SCHEMA_TESTS')`, and is rejected by PostgreSQL with `MEMBERSHIP_REQUIRED` (`AC001`) (Probe 8.3).
  - Only the exact memory reference of `Symbol("NO_ACTOR_FOR_SCHEMA_TESTS")` bypasses the check (Probe 8.4).
- **Production Wiring Audit:**
  - In [platform/composition/merchant-knowledge-host.ts#L13-L20](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/composition/merchant-knowledge-host.ts#L13-L20):
    ```typescript
    export async function createMerchantKnowledgeHost(actorUserId: string) {
      ...
      return Object.freeze({
        repository: new PostgresKnowledgeRepository(database, actorUserId),
        intakeAudit: new PostgresKnowledgeIntakeAudit(database, actorUserId),
      ...
    ```
  - `createMerchantKnowledgeHost` enforces `actorUserId: string`. It does not import, reference, or expose `NO_ACTOR_FOR_SCHEMA_TESTS`. Production request flows cannot reach the opt-out token.

---

### 4.3 F5: Web Connection Duplicates Pre-Check Script

- **Code Location:** [scripts/check-web-connection-duplicates.sql](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/scripts/check-web-connection-duplicates.sql)
  ```sql
  SELECT workspace_id, count(*) AS active_web_connections, array_agg(connection_id ORDER BY connection_id) AS connection_ids
  FROM aicp.workspace_connections
  WHERE channel = 'web' AND status = 'active'
  GROUP BY workspace_id
  HAVING count(*) > 1
  ORDER BY workspace_id;
  ```
- **Auditing Integrity:**
  - The script is strictly read-only: consists solely of a single `SELECT` query with zero DDL or DML.
  - The filter condition `WHERE channel = 'web' AND status = 'active' GROUP BY workspace_id HAVING count(*) > 1` precisely mirrors the partial unique index condition in `20261103000100_host_hardening.sql#L102-L104`:
    `ON aicp.workspace_connections (workspace_id) WHERE channel = 'web' AND status = 'active'`.
  - Merged migration `20261103000100_host_hardening.sql` is completely untouched.
  - Tested against synthetic datasets with disabled web connections, line connections, and duplicate active web connections: verified that only workspaces violating the partial unique index constraint are reported, along with aggregated connection IDs for operator remediation.

---

### 4.4 F6: Approve Route Read-Back Error Masking Elimination

- **Code Location:** [platform/apps/merchant-console/lib/knowledge-routes.ts#L139-L149](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/apps/merchant-console/lib/knowledge-routes.ts#L139-L149)
  ```typescript
  await approval.approve(identity.workspace, sourceId, versionId);
  // The approval has committed; a failed read-back must not turn it into an error the client would retry.
  let version: Awaited<ReturnType<typeof repository.getVersion>> = null;
  try {
    version = await repository.getVersion(identity.workspace, sourceId, versionId);
  } catch {
    // fall through to the minimal answer below
  }
  if (!version) return Response.json({ data: { sourceId, versionId, status: "approved" } }, { headers: noStore });
  return Response.json({ data: versionSummary(version) }, { headers: noStore });
  ```
- **Error Propagation Verification:**
  - `await approval.approve(...)` is called prior to the inner `try ... catch`.
  - If the database approval transaction fails (e.g. `OWNER_ROLE_REQUIRED`, `VERSION_NOT_FOUND`, `APPROVAL_NOT_ELIGIBLE`, network failure), execution immediately enters `routeErrorResponse(error)`. It does NOT return 200 (Probe 9.2).
  - Only when `approval.approve` successfully commits, any subsequent exception or `null` return from `repository.getVersion` falls back to returning HTTP 200 with minimal payload `{ data: { sourceId, versionId, status: "approved" } }` and `Cache-Control: no-store` (Probe 9.1).
  - Clients never receive false 4xx/5xx errors on successfully committed approvals.

---

### 4.5 Existing Test Suite Audit & Assertion Delta

Diff inspection on test files (`7de2649..4201b0d`):
1. [knowledge-repository.test.ts#L53, #L144, #L289](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-repository.test.ts#L53):
   Updated 3 instantiations of `PostgresKnowledgeRepository` to pass `NO_ACTOR_FOR_SCHEMA_TESTS` as required by the non-optional constructor signature. Zero assertions modified or deleted.
2. [workspace-host-migration.test.ts#L154](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/supabase/workspace-host-migration.test.ts#L154):
   Updated 1 instantiation of `PostgresKnowledgeIntakeAudit` to pass `NO_ACTOR_FOR_SCHEMA_TESTS`. Zero assertions modified or deleted.
3. [host-hardening-migration.test.ts#L71](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/supabase/host-hardening-migration.test.ts#L71):
   Rewrote `await repository.archiveSource(shopA, archived.sourceId);` to `await asAuthenticated(database, OWNER_A, (query) => query("SELECT aicp.archive_knowledge_source($1, $2)", ["shop-a", archived.sourceId]));`. This was necessary because the runtime role no longer holds archive privileges. The core assertion (`assert.rejects(approveAs(...), message("APPROVAL_NOT_ELIGIBLE"))`) remains completely intact.
4. No security tests were deleted, weakened, or skipped (`skipped: 0, todo: 0`).

---

## 5. Review Findings & Failure Scenarios

```
CRITICAL=0 HIGH=0 MEDIUM=0 LOW=1
```

### Finding 1: Database Error Mapping Categorizes Role Privilege Violations as `CROSS_WORKSPACE_ACCESS_DENIED`
- **Rank:** LOW (Observation on error classification)
- **Location:** [platform/adapters/persistence/postgres/knowledge-repository.ts#L340](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/platform/adapters/persistence/postgres/knowledge-repository.ts#L340)
- **Code:**
  ```typescript
  if (error.code === "42501") throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
  ```
- **Concrete Failure Scenario:**
  If an internal component, migration script, or background job inadvertently calls `PostgresKnowledgeRepository.revokeVersion(...)` or `PostgresKnowledgeRepository.archiveSource(...)` while connected via the `knowledge_runtime` database role, PostgreSQL rejects the operation with error `42501 permission denied for table/column`. `mapDatabaseError` catches `42501` and throws `KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED")`.
  An operator or developer inspecting application logs might diagnose this as a tenant isolation violation or an invalid workspace ID parameter, when in reality the failure is caused by an unauthorized role attempting an operation stripped of column privileges.
- **Why it does not compromise security:**
  The operation is strictly rejected and fails closed. Neither `revokeVersion` nor `archiveSource` on `PostgresKnowledgeRepository` is wired to any HTTP route, and production owner actions route through `SupabaseKnowledgeRevocation` via PostgREST RPC (`aicp.revoke_knowledge_version`).

---

## 6. Informed Verification

Following the completion of the independent technical audits and standalone PGlite probes, the builder report at [REPORT-HOST-002-FIX.md](file:///D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/review-host-002-fix-20261103/REPORT-HOST-002-FIX.md) and commit `4201b0d` were reviewed.

### Reconciliation & Verification
1. **Controller Decision on Source Lock-Handle:**
   - The builder report documents the controller's decision (points 8, 11) to grant `UPDATE (created_at)` on `aicp.knowledge_sources` to `knowledge_runtime` paired with the immutable identity trigger `knowledge_source_identity_guard`.
   - **Reviewer Assessment:** Confirmed. As proven in Probe 1.7–1.9, this precisely resolves PostgreSQL's requirement for an `UPDATE` privilege during `SELECT ... FOR UPDATE` row locks while mathematically preventing `knowledge_runtime` from modifying source identity attributes.
2. **Actor Requirement & Test Opt-out:**
   - The builder report states `actor` is now required across `PostgresKnowledgeRepository` and `PostgresKnowledgeIntakeAudit`, with `NO_ACTOR_FOR_SCHEMA_TESTS` restricted to test helpers.
   - **Reviewer Assessment:** Confirmed. Verified via typecheck and Probe Section 8.
3. **Approve Route Minimal Response:**
   - The builder report confirms that read-back failures now return HTTP 200 with `{ data: { sourceId, versionId, status: "approved" } }`.
   - **Reviewer Assessment:** Confirmed. Verified via unit test and Probe Section 9.
4. **Duplicate Pre-check Script:**
   - The builder report notes that `scripts/check-web-connection-duplicates.sql` was added without altering merged migrations.
   - **Reviewer Assessment:** Confirmed.

---

## 7. Untested Areas & Requirement Ambiguities

1. **Hosted Supabase Deployment Verification:**
   - All tests and independent probes executed locally against in-memory PGlite. Behavior under live Supabase API gateway dispatch (PostgREST RPC mapping of custom exceptions, `auth.uid()` under high concurrency connection pooling) has not been run against a hosted Supabase project.
2. **Revocation Route Absence:**
   - As specified by task scope, no HTTP route currently exists for revoking versions or archiving sources (`KnowledgeRevocationPort` is implemented as an internal adapter). Exposing these capabilities in future tasks will require route-level CSRF, rate-limiting, and error mapping tests.

---

## 8. Verdicts by Finding

- **F1 (Revoke & Archive Privilege Separation & Forgery):** **CLOSED**  
  Revoke and archive operations are strictly isolated into owner-only `SECURITY DEFINER` functions deriving actor identity from `auth.uid()`. `knowledge_runtime` was stripped of `revoked_*` and `source.status` grants. Direct status flips to `revoked` fail check constraints, and source row locks are protected by an immutable trigger.
- **F2 (Fail-Closed Actor Validation & Opt-Out):** **CLOSED**  
  Constructors and write assertions require `actorUserId: KnowledgeWriterActor`. Missing, empty, or string-lookalike actors fail closed. The `NO_ACTOR_FOR_SCHEMA_TESTS` symbol is unforgeable and completely absent from production wiring.
- **F5 (Web Connection Duplicates Pre-Check):** **CLOSED**  
  `scripts/check-web-connection-duplicates.sql` is a read-only query matching the partial unique index predicate. Merged migrations remain untouched, and operator instructions are documented in `README.md`.
- **F6 (Approve Route Read-Back Resiliency):** **CLOSED**  
  The approve route catches post-commit read-back failures and responds with HTTP 200 minimal data, while real approval transaction failures are correctly surfaced.

```
CRITICAL=0 HIGH=0 MEDIUM=0 LOW=1
```

DONE
