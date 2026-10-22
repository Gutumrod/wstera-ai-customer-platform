# PostgreSQL Knowledge Repository

**Status:** Knowledge source/version/chunk repository implemented locally with transaction-scoped RLS; hosted connection pool, role provisioning and migration application are not implemented or verified. **Phase:** G1 persistence foundation.

## Responsibility

Implements `KnowledgeRepositoryPort` using a host-supplied PostgreSQL transaction port. The migration stores only extracted knowledge text, lifecycle state and source locators. It does not store original uploaded file bytes.

## Security contract

- Each repository operation runs inside one host-managed database transaction. The transaction provider must pin one connection and commit or roll back the callback atomically.
- The repository sets `app.workspace_id` with transaction-local `set_config(..., true)` and also binds the trusted workspace ID in every query. Row-level policies default-deny when the setting is absent or does not match.
- This custom setting is caller-settable by the runtime database role. RLS here protects against missing or accidentally unscoped repository predicates; it does not isolate tenants from arbitrary SQL executed with the same runtime credential. Prevent SQL injection and keep that credential behind the trusted server boundary.
- The application database role must be least-privileged, non-superuser, `NOBYPASSRLS`, and distinct from the migration/owner role. Do not treat a client-supplied workspace ID as a trusted context.
- SQL values are parameterized. Provider error details are discarded and mapped to safe knowledge-domain errors.
- A partial unique index enforces one approved version per source. Database triggers prevent version identity/content mutation, invalid lifecycle transitions, and chunk insertion after approval; chunk insertion locks its parent version row to serialize against approval.
- Runtime grants are column-limited: source inserts may set identity/title/type/timestamp and may update only status; version inserts may set immutable draft fields and may update only lifecycle/approval metadata; chunks may be selected/inserted only. There is no runtime delete method in this task.

## Migration and verification

`migrations/001-knowledge.sql` is a one-time schema migration. It is never applied automatically; review and apply only in a separately approved environment. Tests run the SQL against development-only PGlite as a non-owner, non-superuser role and verify row-level security, approval uniqueness, lifecycle constraints, rollback and span/page/row locators. This is SQL-level local evidence, not a hosted Postgres, Supabase, production authorization, or multi-process concurrency proof.

No database URL, runtime driver, hosted project, production credential or customer data is configured here. The host must provide `PostgresDatabasePort` from its real PostgreSQL pool before this adapter can serve requests.
