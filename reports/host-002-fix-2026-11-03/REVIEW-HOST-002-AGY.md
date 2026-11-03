# Independent Review: AICP HOST-002 Host Hardening (PR #26, Merged)

**Target Revision:** `main` @ `7de2649` (`7de264922d88b29272c281c05e520e358fe6b031`)
**Base Revision:** `acb0e9e`
**Working Directory:** `<worktree>`
**Reviewer:** Antigravity (AGY Windows) — Independent Reviewer (non-author)
**Applicable Decisions:** D-20261025-08 (M1-M3 debt), D-20261025-09, D-20261025-11, D-20261103-01, D-20261103-20 (rule 7E)

---

## 1. Acceptance Plan & Order of Verification

Before reading any builder report (`reports/host-002-2026-11-03/**`) or existing route test files, the following independent acceptance criteria and verification sequence were established from the requirements and threat model:

1. **Baseline Environment & Verification:**
   - Verify repository state at `7de2649`.
   - Execute `npm run typecheck` to confirm strict TypeScript compliance.
   - Execute `npm test` without modification to observe baseline test suite output (216 expected).
2. **Privilege Separation Audit (M1):**
   - Verify `aicp.approve_knowledge_version`: `SECURITY DEFINER`, search_path pinned to `pg_catalog, aicp`, owned by `aicp_migrator`, execution revoked from `PUBLIC` and restricted to `authenticated`.
   - Verify that approver identity is retrieved strictly inside PostgreSQL via `(SELECT auth.uid())::text` and never from user-supplied parameters.
   - Confirm ownership verification inside SQL (`assert_active_knowledge_writer` checking `role = 'owner'`).
   - Confirm that `knowledge_runtime` lost `UPDATE (approved_at, approved_by)` on `aicp.knowledge_versions` and cannot reach `status = 'approved'` via direct SQL updates or function execution.
   - Inspect status of `revoked_*` grants.
3. **In-Transaction Membership Revalidation & Revocation Race Defense:**
   - Audit `aicp.assert_active_knowledge_writer` implementation: must execute `SELECT ... FOR SHARE OF membership, workspace` inside the same database transaction as every repository and audit write.
   - Verify that actor identity is bound from the verified session, never from query parameters or request body.
   - Check concurrency mechanics: evaluate whether `FOR SHARE` locks block concurrent revocation transactions, and whether committing a revocation prior to or during write serializes safely to fail closed (`MEMBERSHIP_REQUIRED`).
4. **Connection Isolation & Uniqueness (M3):**
   - Audit RLS policy on `aicp.workspace_connections`: members must only read `channel = 'web'` rows, keeping LINE credentials/channel secrets completely hidden.
   - Verify the unique partial index on `aicp.workspace_connections (workspace_id) WHERE channel = 'web' AND status = 'active'`.
   - Check for potential bypass paths via views or functions.
5. **Load Bounds & Concurrency (M2):**
   - Audit SQL shortlist bounding: verify `LIMIT 2000` candidate bound, literal substring matching (no wildcard/LIKE injection), and removal of large version content from chunk retrieval rows.
   - Verify query term cap of 64 terms, sorted by length.
   - Audit PDF worker concurrency: verify max 2 running workers, max 8 queued, and immediate 503 `EXTRACTION_BUSY` rejection on overflow. Verify slot release lifecycle on success, crash, error, or timeout.
6. **Route-Level Security, Rate Limiting & Low Items:**
   - Rate limiting: verify per-identity keying, bounded memory (`maxKeys`), `Retry-After` header calculation, and pre-body execution.
   - Origin / CSRF validation: strict equality comparison on `URL.origin`, `Sec-Fetch-Site` enforcement for GET requests, and missing header handling.
   - Error mapping: confirm elimination of substring checks (`includes("CONFLICT")`), typed error codes, and absence of raw SQL/vendor error leakage to clients.
   - Storage parity: verify shared path validation logic between `putOriginal` and `removeOriginal`.
   - Replay hygiene: verify orphaned storage cleanup when quarantine records are reused.
7. **Throwaway Concurrency / Schema Verification (Independent Execution):**
   - Construct a read-only throwaway verification script using PGlite located outside the repository tree (in scratch space) to test edge cases without modifying repository code.
8. **Informed Verification:**
   - Only after documenting initial independent findings, review `reports/host-002-2026-11-03/**` to reconcile findings and evaluate blind spots.

---

## 2. Context Exposed

During this independent review, the following artifacts were examined:
- Task brief: [tasks/TASK-HOST-002-HOST-HARDENING.md](file:///<worktree>/tasks/TASK-HOST-002-HOST-HARDENING.md)
- Git commit range: `acb0e9e..7de2649`
- Source code in `supabase/migrations/`, `platform/adapters/`, `platform/apps/merchant-console/`, `platform/composition/`, `platform/contracts/`, `platform/modules/`, `scripts/`
- Standard system rules and project context files in `<workspace>`

---

## 3. Verification Commands & Real Repository Evidence

### 3.1 Typecheck
- **Command:** `npm run typecheck`
- **Working Directory:** `<worktree>`
- **Result:** Exit 0 (clean, no emit).

### 3.2 Test Suite Execution
- **Command:** `npm test`
- **Working Directory:** `<worktree>`
- **Result:**
  ```text
  ℹ tests 216
  ℹ suites 0
  ℹ pass 216
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 4692.8159
  ```
- **Finding:** All 216 tests passed cleanly without failure.

### 3.3 Throwaway In-Memory (PGlite) Concurrency & Edge-Case Verification
To verify the row-locking and authorization logic independently without touching repository files, a throwaway verification script was executed outside the repository tree at `<temp>`.

- **Throwaway Test Matrix & Results:**
  1. Active membership + active workspace: Returns role `'owner'` (Pass).
  2. Revoked membership: Raises exception `MEMBERSHIP_REQUIRED` (`AC001`) (Pass).
  3. Suspended workspace with active membership: Raises exception `MEMBERSHIP_REQUIRED` (`AC001`) (Pass).
  4. Unknown / non-existent user ID: Raises exception `MEMBERSHIP_REQUIRED` (`AC001`) (Pass).
  5. Empty string actor ID: Raises exception `MEMBERSHIP_REQUIRED` (`AC001`) (Pass).

---

## 4. Detailed Independent Technical Audits

### 4.1 M1: Approval Privilege Separation (`aicp.approve_knowledge_version`)
- **Location:** [supabase/migrations/20261103000100_host_hardening.sql#L36-L95](file:///<worktree>/supabase/migrations/20261103000100_host_hardening.sql#L36-L95)
- **Search Path:** Line 40: `SET search_path = pg_catalog, aicp;` — explicitly pinned, `pg_catalog` precedes `aicp`.
- **Function Ownership & Grants:**
  - Line 90: `ALTER FUNCTION aicp.approve_knowledge_version(text, text, text) OWNER TO aicp_migrator;`
  - Line 91: `REVOKE ALL ON FUNCTION aicp.approve_knowledge_version(text, text, text) FROM PUBLIC;`
  - Line 92: `GRANT EXECUTE ON FUNCTION aicp.approve_knowledge_version(text, text, text) TO authenticated;`
  - `knowledge_runtime` is NOT granted execute, and `anon` is NOT granted execute.
- **Identity & Authorization:**
  - Line 43: `approver text := (SELECT auth.uid())::text;`
  - Lines 47-52: Throws `MEMBERSHIP_REQUIRED` if `approver IS NULL`, and throws `OWNER_ROLE_REQUIRED` if `aicp.assert_active_knowledge_writer(target_workspace_id, approver) <> 'owner'`.
  - The approver cannot be forged or passed via function arguments.
- **Cross-Workspace & Content Verification:**
  - All queries filter on `workspace_id = target_workspace_id`.
  - Line 62: Verifies `source.status = 'active'`.
  - Lines 74-80: Verifies `version.status = 'indexed'` AND requires at least one chunk to exist in `aicp.knowledge_chunks`.
- **Runtime Privilege Revocation:**
  - Line 95: `REVOKE UPDATE (approved_at, approved_by) ON aicp.knowledge_versions FROM knowledge_runtime;`
  - Table CHECK constraint:
    ```sql
    CHECK (
      (status IN ('approved', 'revoked') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
      OR (status NOT IN ('approved', 'revoked') AND approved_at IS NULL AND approved_by IS NULL)
    )
    ```
  - Without UPDATE privileges on `approved_at` and `approved_by`, `knowledge_runtime` cannot satisfy the CHECK constraint if it attempts `UPDATE aicp.knowledge_versions SET status = 'approved'`. Any attempt results in PostgreSQL error `42501` (permission denied for column) or `23514` (check constraint violation).

### 4.2 Membership Revalidation & Concurrency (`assert_active_knowledge_writer`)
- **Location:** [supabase/migrations/20261103000100_host_hardening.sql#L7-L32](file:///<worktree>/supabase/migrations/20261103000100_host_hardening.sql#L7-L32)
- **Locking Mechanics:**
  - Line 23: `FOR SHARE OF membership, workspace;`
  - Acquires a shared row lock on `aicp.workspace_memberships` and `aicp.workspaces`.
  - If a concurrent transaction attempts to revoke membership (`UPDATE ... status = 'revoked'`), it requires an exclusive lock (`RowExclusiveLock`) and is blocked until the write transaction finishes.
  - If a revocation transaction has already executed `UPDATE` but has not yet committed, the write transaction's `SELECT ... FOR SHARE` blocks until revocation commits; upon unblocking, it evaluates `membership.status = 'active'`, finds 0 rows, and raises `MEMBERSHIP_REQUIRED` (`AC001`), aborting the write.
- **Write Path Coverage:**
  - `PostgresKnowledgeRepository` routes all writes through `scopedWrite()`, which invokes `assertActiveWriter()`:
    - `createSource` ([knowledge-repository.ts#L393](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L393))
    - `archiveSource` ([knowledge-repository.ts#L437](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L437))
    - `createVersion` ([knowledge-repository.ts#L451](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L451))
    - `transitionVersion` ([knowledge-repository.ts#L538](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L538))
    - `revokeVersion` ([knowledge-repository.ts#L601](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L601))
  - `PostgresKnowledgeIntakeAudit`:
    - `recordOriginal` ([knowledge-intake-audit.ts#L50](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-intake-audit.ts#L50))
    - `quarantine` ([knowledge-intake-audit.ts#L76](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-intake-audit.ts#L76))
  - Rollback safety: If `recordOriginal` or `quarantine` fails due to revoked membership, `ingestKnowledgeVersion` catches the error and executes `dependencies.storage.removeOriginal(...)` to prevent storage orphans.

### 4.3 M3: Connection Visibility Isolation & Web Connection Uniqueness
- **Location:** [supabase/migrations/20261103000100_host_hardening.sql#L97-L104](file:///<worktree>/supabase/migrations/20261103000100_host_hardening.sql#L97-L104)
- **RLS Policy:**
  ```sql
  DROP POLICY workspace_connections_member_read ON aicp.workspace_connections;
  CREATE POLICY workspace_connections_member_read ON aicp.workspace_connections
    FOR SELECT TO authenticated
    USING (channel = 'web' AND aicp.is_active_workspace_member(workspace_id));
  ```
  Authenticated members can read ONLY `channel = 'web'` rows. LINE connection rows (containing channel secrets and access tokens) are invisible.
- **Unique Constraint:**
  ```sql
  CREATE UNIQUE INDEX workspace_one_active_web_connection
    ON aicp.workspace_connections (workspace_id)
    WHERE channel = 'web' AND status = 'active';
  ```
  Enforces at the database engine level that no workspace can hold multiple active web connections.

### 4.4 M2: Search Load Bounding & PDF Worker Concurrency
- **Search SQL Bounding:**
  - [platform/modules/knowledge/index.ts#L32](file:///<worktree>/platform/modules/knowledge/index.ts#L32): `MAX_SHORTLIST_TERMS = 64`. Terms are sorted descending by character length and capped to 64.
  - [platform/adapters/persistence/postgres/knowledge-repository.ts#L30](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L30): `MAX_RETRIEVAL_CANDIDATES = 2000`.
  - SQL candidate retrieval uses literal substring matching via `strpos()` (no `LIKE` or regex wildcard vulnerabilities).
  - Version text content (100,000 chars) is excluded from `listRetrievableChunks` select list, returning only lightweight metadata and chunk text.
- **PDF Worker Pool & Queue:**
  - [platform/adapters/knowledge/document-extractor.ts#L27-L40](file:///<worktree>/platform/adapters/knowledge/document-extractor.ts#L27-L40):
    - `MAX_PDF_WORKERS = 2;`
    - `MAX_PDF_QUEUE = 8;`
  - Rejection on overflow: when 2 workers are active and 8 are queued, the 11th request immediately receives `failure("EXTRACTION_BUSY")`, which maps to HTTP 503 without touching quarantine storage.
  - Lifecycle: `worker.terminate().then(releasePdfWorker, releasePdfWorker)` guarantees that slots are reclaimed whether the worker completes, crashes, or times out (15,000 ms timer).

### 4.5 Rate Limiting & Origin Security
- **Rate Limiting:**
  - [platform/apps/merchant-console/lib/rate-limit.ts](file:///<worktree>/platform/apps/merchant-console/lib/rate-limit.ts):
    - Bounded key storage (`maxKeys = 10_000`) with expired key pruning and FIFO eviction.
    - Zero new external dependencies.
    - `ponytail:` comment clearly documents that counters are per-process and reset on restart.
  - Keying: Strictly keyed on verified `identity.userId` from authenticated session claims.
  - Timing: Applied in `createSource` and `search` routes *before* reading or parsing the request body.
  - Response: Emits HTTP 429 with `Retry-After: <seconds>` header.
- **Origin Validation:**
  - [platform/apps/merchant-console/lib/http.ts#L5-L26](file:///<worktree>/platform/apps/merchant-console/lib/http.ts#L5-L26):
    - `assertSameOrigin`: Parses `origin` as URL and tests `parsed.origin !== new URL(expectedOrigin).origin` (strict equality, no substring).
    - `assertSameOriginRead`: Verifies `Sec-Fetch-Site` on GET requests when `Origin` is omitted by browsers, allowing only `"same-origin"` or `"none"`.

### 4.6 Low Items
- **`putOriginal` / `removeOriginal` Parity:** Both methods now utilize `isWorkspaceObjectPath(workspace, path)` with strict 4-segment validation (`${workspaceId}/${sourceId}/${versionId}/${filename}`).
- **Orphan Quarantine Replay Cleanup:** In `knowledge-intake.ts#L108-L110`, if a replayed request created an object at a new attempt path while the audit record retained an existing path, the newly created orphaned object is deleted.
- **Error Classification:** Eliminated substring matching (`includes("CONFLICT")`); replaced with explicit `Set` lookup of typed conflict error strings and `KnowledgeError` status mapping.
- **IPv6 Loopback:** `scripts/seed-environment.mjs` updated `loopbackHosts` to accept `"[::1]"` matching URL parser hostname format.

---

## 5. Review Findings & Failure Scenarios

```
CRITICAL=0 HIGH=0 MEDIUM=0 LOW=5
```

### Finding 1: `assertActiveWriter` allows `actorUserId` to be optional
- **Rank:** LOW
- **Location:** [platform/adapters/persistence/postgres/knowledge-repository.ts:348-356](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L348-L356)
- **Code:**
  ```typescript
  export async function assertActiveWriter(query: PostgresQueryPort, workspace: TrustedWorkspaceContext, actorUserId: string | undefined): Promise<void> {
    if (actorUserId === undefined) return;
    try {
      await query.query("SELECT aicp.assert_active_knowledge_writer($1, $2)", [workspace.workspaceId, actorUserId]);
  ```
- **Concrete Failure Scenario:**
  If future backend code or an internal background script instantiates `new PostgresKnowledgeRepository(database)` without supplying `actorUserId`, any write operations executed by that repository instance will silently bypass the `aicp.assert_active_knowledge_writer` check. While `createMerchantKnowledgeHost(actorUserId: string)` requires a non-empty string in production, the underlying adapter constructor retains an optional parameter contract (`actorUserId?: string`) which was introduced to accommodate base-schema unit tests.
- **Defensive Recommendation:**
  Consider requiring `actorUserId: string` strictly in `PostgresKnowledgeRepository` and providing an explicit test-only bypass option (e.g. `allowUnauthenticatedTestWriter: true`) rather than treating `undefined` as a silent bypass.

---

### Finding 2: `knowledge_runtime` retains UPDATE privilege on `revoked_*` columns
- **Rank:** LOW
- **Location:** [supabase/migrations/20261023000100_g1_workspace_host.sql:105-106](file:///<worktree>/supabase/migrations/20261023000100_g1_workspace_host.sql#L105-L106), [supabase/migrations/20261103000100_host_hardening.sql:95](file:///<worktree>/supabase/migrations/20261103000100_host_hardening.sql#L95)
- **Code:**
  ```sql
  REVOKE UPDATE (approved_at, approved_by) ON aicp.knowledge_versions FROM knowledge_runtime;
  -- knowledge_runtime still retains UPDATE (status, revoked_at, revoked_by, revocation_reason)
  ```
- **Concrete Failure Scenario:**
  An adversary who compromises the direct PostgreSQL `knowledge_runtime` credentials cannot approve unvetted content, but can issue `UPDATE aicp.knowledge_versions SET status = 'revoked', revoked_at = now(), revoked_by = 'adversary', revocation_reason = 'sabotage' WHERE ...`. This unilaterally revokes approved knowledge versions, resulting in a denial-of-service on store retrieval. Because `protect_knowledge_version_identity` treats `'revoked'` as a terminal state, the version cannot be reinstated without inserting a new draft version.
- **Defensive Recommendation:**
  In a future hardening iteration, migrate `revokeVersion` to a dedicated `SECURITY DEFINER` function (e.g. `aicp.revoke_knowledge_version`) requiring an owner/staff session, and revoke `UPDATE` on `(status, revoked_at, revoked_by, revocation_reason)` from `knowledge_runtime` entirely.

---

### Finding 3: Rate Limiter is in-memory and process-local (resets on restart)
- **Rank:** LOW
- **Location:** [platform/apps/merchant-console/lib/rate-limit.ts:5-7](file:///<worktree>/platform/apps/merchant-console/lib/rate-limit.ts#L5-L7)
- **Code:**
  ```typescript
  /**
   * Fixed-window limiter with a bounded key count.
   * ponytail: counts live in this process and reset on restart; N instances allow N times the limit.
   * Upgrade to a shared store keyed the same way before running more than one instance.
   */
  ```
- **Concrete Failure Scenario:**
  In a horizontally scaled deployment with multiple serverless or container instances, an authenticated user can send up to `N * limit` requests per minute across `N` instances. Furthermore, if instances recycle or restart, the window counters reset to zero. This conforms to the approved task requirements ("in-memory, no new dependency, ponytail comment"), but remains an operational constraint for distributed deployments.
- **Defensive Recommendation:**
  When deploying beyond a single long-lived container, replace the in-memory `Map` with an atomic shared store (e.g. Redis or Cloudflare KV/Durable Objects) using identical identity keying.

---

### Finding 4: PDF worker queue retains queued work when client disconnects
- **Rank:** LOW
- **Location:** [platform/adapters/knowledge/document-extractor.ts:125-149](file:///<worktree>/platform/adapters/knowledge/document-extractor.ts#L125-L149)
- **Concrete Failure Scenario:**
  If 2 PDF workers are occupied and 8 requests are queued in `pdfWaiters`, a client that closes their HTTP connection remains in `pdfWaiters` because `extractPdf` is not bound to the request's `AbortSignal`. When worker capacity becomes available, the queued task will spawn a worker thread and parse the PDF payload despite the response being undeliverable. However, worker memory is strictly capped (`maxOldGenerationSizeMb: 64`, timeout 15s), and the worker slot is reliably released upon completion.
- **Defensive Recommendation:**
  Pass an `AbortSignal` into `extractPdf(bytes, signal?)` so that aborted requests can be pruned from `pdfWaiters` prior to execution.

---

### Finding 5: Search shortlist candidate truncation (`LIMIT 2000`)
- **Rank:** LOW
- **Location:** [platform/adapters/persistence/postgres/knowledge-repository.ts:30](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L30), [platform/adapters/persistence/postgres/knowledge-repository.ts:639](file:///<worktree>/platform/adapters/persistence/postgres/knowledge-repository.ts#L639)
- **Concrete Failure Scenario:**
  In a large workspace containing more than 2,000 approved chunks that match at least one search term or SKU, only the top 2,000 chunks (ranked by `sku_hits DESC, term_hits DESC`) are passed to the in-memory scoring pipeline. If an approved chunk matches only one term while 2,000 other chunks match two terms, the single-match chunk will be excluded from the evaluation candidate set. Because workspace and approval filtering are enforced strictly before the `LIMIT`, this does not create a cross-workspace leak or vulnerability, but represents an intentional load-bounding heuristic.
- **Defensive Recommendation:**
  When large merchant catalogs are indexed, consider introducing a full-text search index (`pg_trgm` or `tsvector`) to refine the shortlist ranking in SQL before truncating.

---

## 6. Informed Verification (Review of Builder Reports and Commit Rationale)

Following the independent code and test audits, the builder report at `reports/host-002-2026-11-03/REPORT.md` was reviewed.

### Comparison and Reconciliation
1. **Deviation from Task Brief on Membership Grant:**
   - The task brief (`TASK-HOST-002-HOST-HARDENING.md`) suggested: `GRANT SELECT ON aicp.workspace_memberships TO knowledge_runtime`.
   - The builder deviated to: `CREATE FUNCTION aicp.assert_active_knowledge_writer(...) SECURITY DEFINER` with `FOR SHARE`.
   - **Reviewer Assessment:** The builder's decision is technically superior and safer. Granting `SELECT` on `workspace_memberships` directly to `knowledge_runtime` would either expose membership rows across all workspaces to the runtime role or require widening RLS policies. Furthermore, a bare `SELECT` cannot acquire `FOR SHARE` without elevated privileges. Encapsulating this inside a `SECURITY DEFINER` function with a pinned `search_path` and `EXECUTE` restricted to `knowledge_runtime` correctly minimizes privilege surface.
2. **`revoked_*` Permissions Retention:**
   - The builder noted that `revoked_*` was retained on `knowledge_runtime` because revocation was not in scope for M1 (approval separation) and no HTTP route currently exposes revocation.
   - **Reviewer Assessment:** Confirmed; documented above as Finding 2 (Low).
3. **Shortlist Version Truncation & Test Adaptation:**
   - The builder noted that `listRetrievableChunks` was refactored to omit full version content (`content: string`) from chunk rows to prevent memory exhaustion, requiring 2 assertion updates in `knowledge-repository.test.ts`.
   - **Reviewer Assessment:** Confirmed; the assertion modifications in `knowledge-repository.test.ts:152,166` were structural updates to match the lighter row return type rather than relaxations of security guarantees.
4. **Precheck & CI Evidence:**
   - The builder reported CI run `41492787506` on `250bb67` passed; `npm test` passed 216/216.
   - **Reviewer Assessment:** Independent execution of `npm run typecheck` and `npm test` on revision `7de2649` in this review confirmed 216 passed tests and 0 errors.

---

## 7. Untested Areas & Requirement Ambiguities

1. **Live Supabase Environment Constraints:**
   - All tests in the repository and this review were executed against local PGlite in-memory instances. The interaction between PostgREST RPC dispatch, `auth.uid()` resolution inside `SECURITY DEFINER` functions under Supabase API gateway authentication, and live connection pooler transaction modes (e.g. PgBouncer transaction pooling vs `set_config(..., true)`) has not been tested against a hosted Supabase project.
2. **Real Multi-Connection Lock Contention:**
   - While PGlite verifies sequential lock mechanics and query semantics, true concurrent transaction serialization under high-concurrency connection pools was not benchmarked against hosted PostgreSQL.
3. **Ambiguity in Task Scope regarding Revocation Privilege:**
   - The original brief asked whether `revoked_*` remained granted. While `approved_*` was revoked from `knowledge_runtime`, `revoked_*` was left in place. The task description did not explicitly mandate revoking revocation grants from `knowledge_runtime`, but completing the separation for all state-changing version transitions remains an open design cleanup.

---

## 8. Summary of Findings

```
CRITICAL=0 HIGH=0 MEDIUM=0 LOW=5
```

The changes introduced in PR #26 (diff `acb0e9e..7de2649`) successfully satisfy all required security objectives for TASK-HOST-002:
- Separation of approval privilege from ingest runtime is strictly enforced.
- Revalidation of workspace membership inside the write transaction with row locking (`FOR SHARE`) is implemented across all repository and audit write paths.
- Sensitive LINE connection data is isolated from workspace members via RLS.
- SQL candidate bounding and PDF worker concurrency pooling prevent resource exhaustion.
- Rate limiting, CSRF/Origin validation, and error sanitization are implemented without new dependencies.
- No Critical, High, or Medium security defects were identified.

DONE
