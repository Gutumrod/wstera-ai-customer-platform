# Existing TypeScript Boundary Scaffold (Temporary)

This is the remaining executable TypeScript source tree (`core/`, `line/`, `policy/` and tests), created before the feature-oriented module structure was defined. The trusted workspace context moved to `platform/modules/tenancy/workspace.ts` in Phase 0C; `src/core/workspace.ts` remains a compatibility export.

Do not mass-move or duplicate the remaining files. Migrate one use case at a time through a separately scoped PR that preserves public exports and test behavior.

Migration sequence:
1. Read the active task and its accepted design/contract.
2. Introduce or extend contract types with regression tests.
3. Move one boundary at a time to `platform/modules/` or `platform/adapters/`.
4. Keep compatibility exports until new imports are stable.
5. Run build, security tests, negative tenant tests, and dependency-boundary checks.
6. Delete old files only after reviewable migration evidence and an explicit scoped PR.

See `BRIEF.md`, `architecture/REPOSITORY-STRUCTURE.md` and `architecture/PORTS-AND-ADAPTERS.md` from repository root.
