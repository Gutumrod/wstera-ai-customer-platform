# AICP-HOST-003 Round 2 Fix Report

Date: 2026-10-25
Branch: `codex/aicp-schema-isolation-20261025`
Base: `e6b83cd`

## Findings and changes

- **F-01 — fixed:** local seed inserts into `aicp.workspaces`, `aicp.workspace_memberships`, and `aicp.workspace_connections`. README setup now documents the product schema and roles.
- **F-02 — fixed:** local PostgREST exposes `aicp` and adds it to `extra_search_path`; README notes operators must expose `aicp` in the project's dashboard API settings for a separately approved hosted project.
- **F-03 — fixed:** all product tables, indexes (through table ownership), and three product functions are owned by `aicp_migrator`; no product sequences exist. The membership SECURITY DEFINER function retains required read access through explicit `aicp_migrator` grants on `auth` schema usage and workspace membership tables. Existing `knowledge_runtime` grants remain unchanged. PGlite migration assertions check all aicp relation and function owners.
- **F-04 — fixed:** local `new URL(value)` parse errors now propagate as `TypeError`; a regression asserts this. The custom URL error remains in lab mode.
- **F-05 — fixed:** lab usernames require `knowledge_runtime.<20 lowercase alphanumeric ref>` or `postgres.<20 lowercase alphanumeric ref>`, with a non-empty password; host, port, protocol, and path checks remain.
- **F-06 — fixed:** README operator note states knowledge objects live in `aicp`, roles are `aicp_migrator` and `knowledge_runtime`, and product migrations leave `public` empty.
- **F-07 — documented/tested:** a behavioral regression invokes `createSupabaseAdminClient()` with `APP_ENV=lab` and confirms the exact `LOCAL_SUPABASE_SERVER_SECRET_REQUIRED` error. Full LAB host startup remains blocked on separate storage configuration work, proposed as **HOST-004**. No storage boundary or guard was changed.

## `public.` reference scan

Command: `git grep -n -E 'public\\.(workspaces|workspace_memberships|workspace_connections|knowledge_sources|knowledge_versions|knowledge_chunks|knowledge_original_objects|knowledge_quarantine_records)' -- .`

Result: no matches in tracked repository files. The working-tree scan also found no source/setup references; the pre-existing untracked `REVIEW-HOST-003.md` is retained as audit evidence and excluded because it quotes the rejected round-1 findings verbatim.

## Verification

`npm ci` was not needed; `node_modules` existed. `npm run check` exited 0: typecheck passed, Next console build passed, and tests reported **176 total, 176 passed, 0 failed, 0 skipped, 0 todo**. The migration test verified aicp object owners in PGlite. No hosted project/database was contacted, migrated, seeded, or written.

Raw `npm run check` output:

```text
> wstera-ai-customer-platform@0.1.0 check
> npm run typecheck && npm test && npm run build:console


> wstera-ai-customer-platform@0.1.0 typecheck
> tsc --noEmit


> wstera-ai-customer-platform@0.1.0 test
> npm run build && node --test dist/src/tests/core.test.js dist/modules/knowledge/knowledge.test.js dist/modules/knowledge/evaluation/evaluation.test.js dist/modules/handoff/handoff.test.js dist/modules/ai-engine/citation-integrity.test.js dist/modules/ai-engine/support-orchestrator.test.js dist/adapters/models/openai-compatible/chat-completions.test.js dist/adapters/persistence/postgres/knowledge-repository.test.js dist/adapters/persistence/supabase/workspace-host-migration.test.js dist/composition/knowledge-database-url.test.js dist/modules/payments/payments.test.js dist/modules/business-actions/business-actions.test.js dist/modules/tenancy/merchant-identity.test.js dist/composition/knowledge-intake.test.js dist/adapters/storage/supabase/private-knowledge-storage.test.js


> wstera-ai-customer-platform@0.1.0 build
> tsc

✔ answerability sends bounded JSON-mode request and records per-workspace token usage (26.1298ms)
✔ grounded answer returns only bounded text and evidence references (1.2875ms)
✔ configuration rejects missing credentials, unsafe URLs and invalid HTTP endpoints (1.0611ms)
✔ invalid input and oversized request do not call the transport (0.638ms)
✔ configuration is snapshotted and inherited usage recorder methods remain supported (0.786ms)
✔ provider errors are normalized and never include response bodies or credentials (0.8112ms)
✔ timeouts abort the request and return a normalized error (5.2322ms)
✔ timeout settles even when the host transport ignores AbortSignal (16.5735ms)
✔ timeout cancels and settles a stalled response body (15.924ms)
▶ oversized, malformed, and usage-free responses fail closed
  ✔ oversized body (0.892ms)
  ✔ invalid JSON (0.642ms)
  ✔ missing token usage (0.5704ms)
  ✔ usage persistence failure (0.58ms)
  ✔ usage persistence is included in the operation timeout (12.4347ms)
✔ oversized, malformed, and usage-free responses fail closed (16.1842ms)
▶ malformed assessment and fabricated citation references never reach callers
  ✔ assessment schema (0.7909ms)
  ✔ fabricated citation (0.57ms)
  ✔ empty answer (0.4516ms)
✔ malformed assessment and fabricated citation references never reach callers (2.2301ms)
▶ PostgreSQL knowledge repository enforces persistence, RLS, lifecycle and citation locators
  ✔ workspace RLS is default-deny and transaction-local scope does not leak (18.4789ms)
  ✔ approval is atomic, one approved version is enforced, and revoke removes retrieval eligibility (82.8613ms)
  ✔ archived source cannot approve an indexed version (14.3748ms)
  ✔ FAQ, PDF page and CSV row citations round-trip exactly (36.8255ms)
  ✔ PostgreSQL infers omitted continuation indexes for page and row locators (10.7007ms)
  ✔ PostgreSQL accepts explicit repeated page and row segments like the canonicalizer (10.2595ms)
  ✔ failed chunk persistence rolls back its version row (5.5676ms)
  ✔ invalid tenant-bound drafts fail before touching SQL (1.3155ms)
  ✔ rejects noncanonical chunk segmentation for FAQ and imported sources (4.5023ms)
  ✔ persists a canonical CSV draft whose segment boundaries create more than 5,000 chunks (319.7601ms)
✔ PostgreSQL knowledge repository enforces persistence, RLS, lifecycle and citation locators (1907.9683ms)
✔ Supabase local migrations stay in sync and enforce workspace membership/storage RLS (1469.9639ms)
✔ private storage builds immutable workspace paths and reuses only byte-identical retries (2.7422ms)
✔ private storage rejects malformed object identity before contacting the provider (1.2719ms)
✔ knowledge database URL policy preserves local guard and accepts only Supabase LAB pooler URLs (106.9187ms)
✔ knowledge intake is workspace-scoped, idempotent, and exposes citation-ready indexed knowledge (5.3881ms)
✔ reusing an idempotency key with different knowledge fails closed (0.843ms)
✔ bounded document intake stores the original and keeps exact page citations (1.206ms)
✔ database failure before version persistence does not create an orphan original (0.6703ms)
✔ document retry with a different display filename reuses one immutable object path (1.043ms)
✔ unsupported and oversized uploads are rejected before storage (4.4684ms)
✔ malformed documents are retained in workspace-scoped quarantine and never become retrievable (0.8825ms)
✔ accepts canonical FAQ, PDF page, and CSV row citations from retrieved evidence (3.0032ms)
✔ deduplicates repeated citations and returns the canonical evidence reference (0.3748ms)
✔ normalizes omitted page and row chunk indexes to zero (0.2781ms)
✔ hands off when evidence or citations are absent (0.1581ms)
✔ hands off for malformed draft and empty answer text (0.1941ms)
✔ fails closed on foreign evidence and cross-workspace citations (0.2373ms)
✔ fails closed when retrieval hit metadata does not match its citation identity (0.2068ms)
✔ rejects fabricated evidence identities and malformed locators (0.197ms)
✔ returns only a cited answer mapped from opaque evidence references (3.7828ms)
✔ no approved evidence requests handoff without invoking assessment or model (0.4906ms)
▶ insufficient, conflicting, and uncertain evidence fail closed to handoff
  ✔ insufficient_evidence (0.4339ms)
  ✔ conflicting_evidence (0.3287ms)
  ✔ uncertain (0.377ms)
✔ insufficient, conflicting, and uncertain evidence fail closed to handoff (1.8123ms)
▶ malformed assessment, provider errors, and bad citations never produce an answer
  ✔ assessment shape (1.3038ms)
  ✔ assessment getter throws (0.4951ms)
  ✔ assessment failure (0.3927ms)
  ✔ generation failure (0.4323ms)
  ✔ foreign evidence reference (0.3222ms)
  ✔ empty answer (0.2633ms)
  ✔ oversized answer (0.1766ms)
  ✔ too many citation references (0.1691ms)
  ✔ extra model field (0.2192ms)
  ✔ generated getter throws (0.2368ms)
✔ malformed assessment, provider errors, and bad citations never produce an answer (5.2343ms)
✔ retrieval and handoff failures are surfaced without leaking adapter errors (0.8631ms)
✔ invalid request is rejected before any port is called (0.2236ms)
✔ over-retrieval-limit customer messages hand off instead of being silently rejected (0.1947ms)
✔ support query accepts the 500-character retrieval boundary and routes the 5000-character ceiling (0.3588ms)
✔ freshness revalidates every chunk shown to the model, including uncited evidence (0.3758ms)
▶ paused conversations stop before retrieval and a handoff during generation suppresses the answer
  ✔ already paused (0.1645ms)
  ✔ handoff starts and is released while generating (0.252ms)
  ✔ knowledge is revoked during generation (0.3185ms)
  ✔ freshness check failure fails closed (0.3254ms)
  ✔ conversation takeover before a failure handoff returns paused without alerting an already-owned conversation (0.2705ms)
  ✔ conversation version change before failure handoff returns changed without requesting handoff (0.3154ms)
  ✔ malformed freshness result fails closed (0.3306ms)
  ✔ handoff starts while generating (0.2996ms)
  ✔ conversation state unavailable (0.168ms)
  ✔ stateful conversation getter is rejected before retrieval (0.137ms)
  ✔ stateful evidence getter is rejected before model use (0.1789ms)
  ✔ conversation Proxy uses its captured descriptor value (0.223ms)
  ✔ generated reference Proxy validates and uses the same descriptor value (0.3379ms)
✔ paused conversations stop before retrieval and a handoff during generation suppresses the answer (4.5606ms)
✔ risk is derived from the action kind, not from caller data (1.3216ms)
✔ an unknown or inherited property name is refused instead of resolving (0.5955ms)
✔ a tampered risk field on the record cannot unlock execution (0.444ms)
✔ an action that changes state cannot execute before confirmation (0.2178ms)
✔ confirmation cannot skip authorisation (0.2105ms)
✔ a read-only action may execute after authorization without confirmation (0.2316ms)
✔ full confirmation cycle reaches verified state (0.2206ms)
✔ re-confirming with the same confirmation id is idempotent (0.2274ms)
✔ confirming twice with a different id is refused (0.2451ms)
✔ any event naming another workspace is denied (0.3175ms)
✔ terminal records accept no further events (0.2379ms)
✔ an executed record cannot be rejected or failed afterwards (0.2023ms)
✔ missing, unexpected or non-scalar arguments are refused (0.2314ms)
✔ argument values are copied, not shared with the caller (0.1084ms)
✔ malformed identifiers and short idempotency keys are refused (0.1915ms)
✔ new conversation starts with AI enabled and tenant-scoped identity (2.442ms)
✔ handoff request pauses AI before operator claim and staff reply keeps it paused (0.9707ms)
✔ replaying the latest delivery returns the post-transition repository snapshot (0.599ms)
✔ customer-facing calls cannot release handoff and unauthorized staff cannot release it (0.818ms)
✔ authorized staff release is the only transition that resumes AI (0.3444ms)
✔ handoff commands reject a forged workspace and an active conversation cannot be claimed (0.4059ms)
✔ handoff failures are explicit and invalid transition requests fail closed (0.4374ms)
✔ repository compare-and-append rejects a stale transition version (0.4217ms)
✔ evaluation summary reports recall, precision, citation validity, abstention, and latency separately (2.0081ms)
✔ empty evaluation returns null rates and zero latency instead of NaN (0.2788ms)
✔ evaluation rejects invalid latency observations instead of recording zero (0.6156ms)
✔ Precision@k divides relevant returned evidence by k, including when fewer than k hits return (0.2693ms)
✔ a wrong page from the correct source and version is not relevant evidence (0.1713ms)
✔ synthetic baseline covers 30 FAQ, PDF, CSV and negative cases with verifiable citations (33.9465ms)
✔ synthetic corpus manifest enforces unique cases, outcomes, source kinds, and locators (0.5017ms)
✔ approved FAQ retrieval returns exact version and deterministic span citation (6.2118ms)
✔ Thai lexical query and punctuation variants of mixed-language SKUs retrieve approved knowledge (0.9893ms)
✔ SKU punctuation normalization abstains when distinct identifiers collide (0.5748ms)
✔ inactive SKU variants do not make active punctuation matches ambiguous (0.4678ms)
✔ unapproved and revoked versions never appear in retrieval (0.3907ms)
✔ citation freshness becomes false after source archive or version revocation (1.1679ms)
✔ canonicalizes page and row version drafts when optional chunkIndex is omitted (1.1327ms)
✔ archived source cannot approve an indexed version (0.5984ms)
✔ repository refuses a caller-supplied approved status at version creation (0.3215ms)
✔ repository rejects an imported version whose kind differs from its source (0.3557ms)
✔ retrieval locator order is deterministic when repository rows are reversed (10.2437ms)
✔ repository derives tenant scope from trusted context and rejects forged or mismatched workspace data (0.5849ms)
✔ version conflicts fail closed and approved version content is immutable (0.3496ms)
✔ archived source is excluded even when its version remains approved (0.2674ms)
✔ a source cannot have two approved versions and does not resurrect older content (0.3844ms)
✔ no match yields no evidence and malformed or oversized FAQ content is rejected (0.4086ms)
✔ instruction-like document text remains inert retrieved data and cannot change source state (0.2142ms)
✔ imported page and row segments retain exact content offsets and source locators (0.1804ms)
✔ document version builder rejects locators that do not match the source format (0.1483ms)
✔ retrieval citations preserve the extracted PDF page locator (0.2315ms)
✔ CSV extractor handles UTF-8 BOM, Thai, quoted commas and maps the data row (18.6304ms)
✔ PDF extractor returns per-page text and rejects image-only PDFs without OCR claims (391.8435ms)
✔ PDF extractor fails closed on highly-compressible page output (273.295ms)
✔ PDF text consumer cancels the stream as soon as the extraction cap is crossed (86.0338ms)
✔ PDF text consumer ignores trailing whitespace when no output budget remains (0.8878ms)
✔ PDF page budgets do not reject an empty trailing page at the extraction ceiling (0.2644ms)
✔ document extractor fails closed for invalid UTF-8, malformed files and oversized input (2.4419ms)
✔ document preparation carries extracted CSV row citations into approved retrieval (2.1692ms)
✔ document preparation converts thrown or malformed extractor results to safe failures (0.466ms)
✔ TLV encoding writes tag, two-digit length and value (2.8075ms)
✔ CRC matches the published CRC-16/CCITT-FALSE check value (0.3749ms)
✔ CRC suffix matches a recomputation over the payload prefix (0.6754ms)
✔ payload without an amount is static and carries no amount tag (0.435ms)
✔ payload with an amount is dynamic and carries tag 54 at two decimals (0.2607ms)
✔ mobile target is normalised to 0066 form under tag 01 (0.7922ms)
✔ eleven-digit target already in 66 form gains the 00 prefix (0.1326ms)
✔ thirteen-digit target is used unchanged under tag 02 (0.1841ms)
✔ thirteen-digit target already in 0066 form stays a mobile target (0.145ms)
✔ a plus-prefixed international mobile is accepted, other punctuation is not (0.6315ms)
✔ fifteen-digit target is used unchanged under tag 03 (0.1461ms)
✔ non-positive, over-precise or oversized amounts are rejected (0.2875ms)
✔ malformed targets are rejected instead of guessed (0.2092ms)
✔ payload matches a pinned vector computed outside this module (0.1326ms)
✔ same input yields identical payload (0.095ms)
✔ merchant workspace identity is derived from active membership and owned web connection (0.9314ms)
▶ workspace selection fails closed when membership or web connection is missing or ambiguous
  ✔ no membership (0.4568ms)
  ✔ multiple workspaces (0.188ms)
  ✔ no web connection (0.1532ms)
  ✔ repository errors fail closed (0.1854ms)
✔ workspace selection fails closed when membership or web connection is missing or ambiguous (2.2018ms)
✔ trusted workspace enforces a strict, immutable context (1.3507ms)
✔ tenancy contract and legacy workspace APIs preserve constructor and enforcement parity (0.9188ms)
✔ shared channel contracts keep message identity connection-scoped and errors normalized (0.3828ms)
✔ LINE HMAC verifies raw bytes and rejects modifications/missing secret (6.0833ms)
✔ signed LINE ingress is bound to server-owned destination and filters group messages (1.7072ms)
✔ empty signed LINE verification event is accepted and invalid destination is rejected before lookup (1.0089ms)
✔ LINE ingress fails closed for malformed signed payloads and bounds input (3.3538ms)
✔ same LINE user in two connections resolves to separate workspace identities (0.8761ms)
✔ dedupe lease contract recovers a failed first event before redelivery (0.6265ms)
✔ source gate filters scope and approval while preserving excerpt text as untrusted data (0.4414ms)
✔ reply client rejects missing creds and surfaces provider failure (16.7583ms)
ℹ tests 176
ℹ suites 0
ℹ pass 176
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2041.2239

> wstera-ai-customer-platform@0.1.0 build:console
> npm run build && next build --webpack platform/apps/merchant-console


> wstera-ai-customer-platform@0.1.0 build
> tsc

▲ Next.js 16.4.2 (webpack)
✓ Running next.config.ts took 26ms

  Creating an optimized production build ...
✓ Compiled successfully in 1035ms
  Running TypeScript ...
  Finished TypeScript in 1503ms ...
  Collecting page data using 8 workers ...
  Generating static pages using 8 workers (0/2) ...
✓ Generating static pages using 8 workers (2/2) in 579ms
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/knowledge/search
├ ƒ /api/knowledge/sources
├ ƒ /api/knowledge/sources/[sourceId]/versions/[versionId]/approve
└ ƒ /login


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

## Still open

- HOST-004 storage configuration is required before LAB host startup can run. Hosted exposure must be configured by an operator in the dashboard when a hosted project is separately approved.
- Local Docker-backed seed/bootstrap was not run in this task; only source changes and the prescribed automated check were verified.

DONE