# G1-B Document Ingestion — Local Evidence

**Recorded:** 2026-10-15 (Asia/Bangkok)
**Task branch:** `codex/g1b-document-ingestion-20261015`
**Implementation commit:** `f21b6bd` (`feat: add bounded PDF and CSV knowledge ingestion`)
**Stack base:** PR #7 head `ea97db2ea7044f87f8e71728e45e71d9fed48bb1`; PR #7 remains open.

## Delivered in this slice

- Added `KnowledgeDocumentExtractorPort` and a local Node adapter for PDF text and UTF-8 CSV.
- Preserved PDF page and logical CSV record locators through draft version creation, the test repository, approval, and retrieval citation.
- Added safe failure codes and bounds: 5 MiB input; 100 PDF pages; 5,000 CSV data rows; 100 columns; 16,384 characters per CSV record; 100,000 extracted characters.
- Added synthetic tests for Thai CSV, BOM and quoted delimiters, multi-page PDF, image-only/no-text PDF, invalid encoding, malformed input, input size, citations, and malformed extractor output.
- Added Task 003 brief and updated task/roadmap status to match the implementation.

## Verification evidence

Run in the task worktree on 2026-10-15, before commit `f21b6bd`:

| Command | Result |
|---|---|
| `npm run check` | Exit 0; typecheck/build passed; **29 tests passed, 0 failed** |
| `npm audit --json` | Exit 0; **0 vulnerabilities** (0 info/low/moderate/high/critical) |
| `git diff --check` | Exit 0 |

The repository has no lint script, so lint was not available to run. The CI workflow currently triggers pull-request checks only when the PR base is `main`; this stacked PR targets PR #7 and therefore currently has no hosted check run. Local evidence does not replace hosted CI or independent review.

## Security, cost, and limitations

- Fixtures are synthetic. No production credentials, customer files, external model calls, upload endpoint, database/object storage, queue, or deployment were used. This work added no paid service or recurring cost.
- CSV parsing uses strict UTF-8 decoding, a required unique header row, strict record shape, and bounded records. PDF parsing is text extraction only; image-only PDFs return `NO_TEXT_CONTENT` and OCR is not claimed.
- The parser and limits are local adapter behavior, not a production upload security boundary or customer-facing plan quota. Authentication, authorization, private object storage, durable async work, production RLS, delete/re-index workflow, and operational controls remain unimplemented.
- `pdfjs-dist` is pinned at `6.4.299`; the earlier `5.7.284` candidate was discarded after its audit surfaced [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j). The final dependency audit reported zero vulnerabilities.
- No claim is made that G1 or the end-to-end MVP is complete. Web chat, answerability/model provider, human handoff, persistence, and the G1 integration gate remain outstanding.

## Review and gate status

- A stacked implementation PR targeting PR #7 is the next review gate; no merge has occurred.
- Independent review is still required. PR #7 and PR #5 remain open, so this branch is not yet based on `main` and hosted CI is not triggered.
- Owner approval remains required for merge/deployment or any future production data, credentials, or paid-resource use.
