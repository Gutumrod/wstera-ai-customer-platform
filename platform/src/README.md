# Existing TypeScript Boundary Scaffold (Temporary)

This is the current executable TypeScript source tree (`core/`, `line/`, `policy/` and tests), created before the feature-oriented module structure was defined.

**Do not move or duplicate these files during the active Task 001 / PR #2 security remediation.** They remain the executable baseline until a separate, explicitly approved refactor PR migrates each use case behind a port and preserves the existing public exports and test results.

Migration sequence:
1. Close Task 001 and accept actual GitHub test evidence.
2. Introduce contract types in `platform/contracts/`, unit tests first.
3. Move one boundary at a time to `platform/modules/` or `platform/adapters/`.
4. Keep compatibility re-exports in `platform/src/index.ts` until the new imports are stable.
5. Run clean build, security tests, negative tenant tests, no-dependency-cycle checks.
6. Delete old files ONLY after owner-reviewed evidence and explicit migration PR.

See `BRIEF.md`, `architecture/REPOSITORY-STRUCTURE.md` and `architecture/PORTS-AND-ADAPTERS.md` from repository root.
