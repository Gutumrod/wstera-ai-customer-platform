# Source-import provenance

Owner order: 2026-10-25 (`D-20261025-01..02` in the house decisions register) — this repository is
the single WSTERA platform, and reusable parts of the retired private LINE product may be brought in
per file, with provenance and a secret scan.

Source repository: `Gutumrod/line-oa-ai-sales-service-engine` at commit `739e649`
(2026-08-24, branch `master`), private. Working copy used for review:
`D:/AI-Workspace/projects/line-oa-ai-sales-service-engine`. The `.gitignore`d `source-repos/` copy
was not read or used (repo rule: `AGENTS.md` forbids reading it).

## Imported items

| Imported file | Source path @ commit | What changed |
|---|---|---|
| `platform/modules/payments/index.ts` | `src/core/utils/emvco-promptpay.ts` @ `739e649` | Rewritten: `PromptPayError` with typed codes, strict target formats only (the 9-digit guess was dropped), amount validation added (0, negative, non-finite and >2 decimals rejected), TLV tag/length guards, no default account. No sample phone number carried over. |
| `platform/modules/payments/payments.test.ts` | `tests/promptpay.test.ts` @ `739e649` | Rewritten for `node:test` (source used vitest) and expanded to 11 tests, including CRC recomputation over the payload prefix. All sample targets replaced with `0000000000`-style fixtures. |
| `platform/contracts/business-actions/index.ts`, `platform/modules/business-actions/index.ts` | `src/core/tools/tool-definitions.ts` @ `739e649` | Used as the action inventory only. Re-expressed as a typed proposal lifecycle (validate → authorize → confirm → idempotent execute → verify → audit) per this repo's ADR-005; no tool handler was taken. |
| `plans/PILOT-ACCEPTANCE-GATE.md` | `docs/08-PILOT-ACCEPTANCE-GATE.md` @ `739e649` | Technical criteria kept and re-scoped to this repo's phases; pricing, packaging and commercial-launch sections dropped. |

## Reviewed but NOT imported

| Source | Why excluded |
|---|---|
| `src/core/brain/knowledge/catalog.ts`, `faq-store.ts` | Invented sample products and FAQs (GPS tracker, serum). Would put fake inventory into the platform. |
| `src/core/brain/agent-brain.ts` | Demo state machine for one shop; hard-coded quick replies (`gps`, `serum`); `เริ่มใหม่` reset phrase conflicts with durable handoff (BRIEF invariant 5). |
| `src/core/tools/tool-registry.ts` | Handlers are mocks (hard-coded slots, hard-coded shipping fees) and it carries a hard-coded PromptPay phone number. Not publishable. |
| `src/adapters/channel/line-oa.adapter.ts` | This repository already has `platform/src/line/{signature,ingress,client}.ts` with tests. |
| `src/adapters/llm/{gemini,openai,mock-llm}.adapter.ts`, `memory.adapter.ts`, `cli-sandbox.ts`, `server.ts` | This repository has its own openai-compatible adapter with tests, and no need for demo entrypoints. |
| `src/core/brain/prompts/sales-psychology.ts` | Instructs the model to issue a draft order / PromptPay QR itself, which violates ADR-005 and the "no unapproved business action" invariant. Would need a rewrite before any use. |
| `docs/10..13` (SaaS contract, readiness gate, operations, pricing framework) | Commercial and pricing content: publishing it in this public repository would expose pricing strategy. Held for Owner decision, not deleted. |

## Secret and personal-data scan

Command: `git diff <base>...HEAD -U0 | grep -E '^\+' | grep -inE 'ghp_|sk-[A-Za-z0-9]{10,}|eyJ…|AIza…|BEGIN .*PRIVATE KEY|0[0-9]{8,9}'`

Result: no token, key or private-key material. The phone-number pattern matched only the EMVCo AID
constant `A000000677010111` and all-zero test fixtures (`0000000000`); manual review confirmed no
real phone number, account number or customer data was imported.

## Review status

`BUILD_PASS` only: `npm run check` passes locally (typecheck + full test list). No LINE round-trip,
no hosted deployment and no real-bank QR scan has been performed for any imported item.
