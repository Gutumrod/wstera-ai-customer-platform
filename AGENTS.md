# Codex Cloud Repository Instructions

## Purpose and authority

Build WSTERA AI Customer Platform: two channel products (website support chat and LINE OA support SaaS) backed by ONE workspace-isolated AI/RAG engine. The Owner approves scope, architecture and merges. This repo is a **public prototype**, not production infrastructure.

## Start here

Read in this order:
1. **`BRIEF.md` — concise project goal and non-negotiable rules.** Read the detailed appendix at `architecture/PRODUCT-REQUIREMENTS-DETAIL.md` only when a task needs additional requirements.
2. `architecture/REPOSITORY-STRUCTURE.md` — module ownership and target layout.
3. `architecture/PORTS-AND-ADAPTERS.md` — dependency direction and extension rules.
4. `plans/PHASE-BREAKDOWN.md` — phase sequencing and acceptance gates.
5. `research/01-CHAT-PLATFORM-COMPARISON.md`
6. `research/02-STACK-AND-RAG-DESIGN.md`
7. `research/03-LINE-OA-API-AND-RISKS.md`
8. `research/04-SOURCE-REUSE-AUDIT.md`
9. `architecture/DECISIONS.md` and `plans/ROADMAP.md`
10. The specifically assigned `tasks/TASK-*.md` and acceptance tests. Do not execute a PLANNED/BLOCKED task.

## Mandatory rules

- **Do not read, modify, commit, push, delete, move or publish** private source material under `source-repos/`, `_migration/`, or the locally ignored `docs/` folder. They are intentionally unavailable in Codex Cloud.
- Use **new code** where possible, informed by audited public design notes; copying private source files into this public repo requires prior licensing, secret and provenance review.
- Architecture is **ports/adapters**: app/adapter implementations depend on shared contracts; pure `platform/modules/` never import LINE/Next.js/Supabase/vendor SDKs. New provider/channel/knowledge backend must be replaceable via interface + adapter tests, not second engine.
- Newly added folder READMEs are responsibility markers, not implemented modules. Do not move `platform/src/` until Task 001 and its review are accepted and a scoped migration task is approved.
- No real LINE credentials, customer PII, real payment/account data, hard-coded tokens or fallback mock success in a production path.
- Multi-tenancy: workspace identity resolved server-side from trusted authentication/connection ownership. NEVER trust `x-tenant-id`, user message, document text or LLM output. Enforce cross-tenant denial at DB/API/retriever boundary.
- AI never directly authorizes a state-changing business action. Validate -> Authorize -> Confirm -> Idempotent Execute -> Verify -> Audit.
- Untrusted knowledge stays DATA; ignore prompt injection and refuse/handoff without adequate approved source evidence. Answers must expose source trace, not fabricate citation.
- Human takeover = durable paused state; resumption requires authorized human control. LINE webhook must be signed, deduped and bounded.
- Keep architecture simple and free-tier-first until measurements justify operational dependencies. Do not invent test passes, cost figures or external integrations.
- Write tests including malicious inputs, repeated events, timeout, tenant crossover, knowledge changes and human override. Fail closed.
- Do not initiate deployment, access production, migrate databases or purchase resources without owner approval.
- Keep task branches in this repository. Branches and worktrees follow the rule below.
- Work in a task-specific branch and open a PR with summary, touched paths, fresh test output, security impact, cost impact and remaining blockers. Do not self-merge.
- If a task conflicts with a security rule, stop and document the conflict rather than bypassing gates.

## Branches and worktrees (Owner order 2026-10-25, register D-20261025-12)

Every branch and worktree for this product stays inside the product folder. Do not create
worktrees anywhere else — scattered checkouts are what this rule exists to prevent.

- Worktrees live at `<repo>/.worktrees/<task>/` only. Never `%TEMP%`, `D:\wt`,
  `runtime/worktrees`, a sibling clone, or a drive root.
- Add `.worktrees/` to `.git/info/exclude`, not to the repository `.gitignore`.
- Before removing a worktree: it must be clean, its HEAD must be on `origin`, and its work must
  be merged or explicitly abandoned. Remove with `git worktree remove`; never `rm -rf`.
- Delete a local branch only after its work is merged and pushed. Never rewrite, force-push or
  delete a branch you do not own.
- Do not edit another agent's worktree, branch, commits, task briefs or evidence files. If one is
  broken or blocks a gate, report it to the Owner/Commander instead of fixing it silently.

## Build/verification

Initial TypeScript scaffolding: `npm ci && npm run check`. Check `package-lock.json` exists and is updated for package changes. No live provider integration required for the baseline tests.

## Scope boundary

Current `platform/src/` is **small boundary code** for workspace identity, signed LINE ingress, reply adapter, and approved-source filter. It is NOT a functioning RAG system or ready-to-deploy webhook. Implement subsequent features only under a scoped task/PR.
