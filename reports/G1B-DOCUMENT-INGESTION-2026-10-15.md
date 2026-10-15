# G1-B Document Ingestion — Local Evidence

**Recorded:** 2026-10-15 (Asia/Bangkok)
**Task branch:** `codex/g1b-document-ingestion-20261015`
**Initial implementation:** `f21b6bd` (`feat: add bounded PDF and CSV knowledge ingestion`)
**Review-fix commit:** `7dbdf7a3b54fb04e2b5e338f8372ac7037c42865` (`fix: harden bounded knowledge ingestion`)
**PDF boundary-fix commit:** `bf8b8171c9995c54cb802f65c078d26919bbb153` (`fix: account for blank pages at PDF extraction limit`)
**Whitespace boundary-fix commit:** `c828fe550520804b446462d9d967da61c1f47282` (`fix: ignore trailing PDF whitespace at output cap`)
**Stack base:** PR #7 head `ea97db2ea7044f87f8e71728e45e71d9fed48bb1`; PR #7 remains open.

## Delivered in this slice

- Added `KnowledgeDocumentExtractorPort` and a local Node adapter for PDF text and UTF-8 CSV.
- Preserved PDF page and logical CSV record locators through draft version creation, the test repository, approval, and retrieval citation.
- Added safe failure codes and bounds: 5 MiB input; 100 PDF pages; 5,000 CSV data rows; 100 columns; 16,384 characters per CSV record; 100,000 extracted characters. PDF.js now runs in an isolated worker with 128 MiB old-generation and 32 MiB young-generation heap limits plus a 15-second timeout. Text is consumed incrementally and the stream is cancelled at the configured output cap.
- Bound each knowledge version to its `faq`/`pdf`/`csv` source kind. The repository rejects mismatches. Retrieval ties now use stable page, row, span, and chunk locator ordering.
- Fixed PDF output accounting so blank trailing pages receive a zero-length budget without being rejected, while non-empty later pages still include the two-character page separator in the aggregate cap.
- Fixed streaming PDF text consumption so trailing whitespace-only PDF.js items that exceed a zero remaining budget are ignored; non-whitespace overflow still cancels and fails closed.
- Added synthetic tests for Thai CSV, BOM and quoted delimiters, multi-page PDF, image-only/no-text PDF, invalid encoding, malformed input, input size, citations, malformed extractor output, compressed PDF fail-closed behavior, stream cancellation, source-kind mismatch, and retrieval order under reversed repository results.
- Added Task 003 brief and updated task/roadmap status to match the implementation.

## Verification evidence

Exact tested code candidate: `c828fe550520804b446462d9d967da61c1f47282` on `codex/g1b-document-ingestion-20261015`, Node `v24.19.0`, npm `11.11.1`:

| Command | Result |
|---|---|
| `npm run check` | Exit 0; typecheck/build passed; **35 tests passed, 0 failed** |
| `npm audit --json` | Exit 0; **0 vulnerabilities** (0 info/low/moderate/high/critical), 17 total dependencies |
| `git diff --check origin/codex/g1b-document-ingestion-20261015...HEAD` | Exit 0 |

Test-first evidence: before the whitespace handling change, the stream-consumer regression failed with `too_large` for a whitespace-only item and a zero character budget; after the change it returns an empty success result and the worker skips the page. The separator-boundary regression verifies zero remaining budget at the exact cap, one character just below it, acceptance at the exact separator-inclusive boundary, and rejection one character beyond it. Earlier review fixes also had observed RED tests for source-kind mismatch and reversed repository order. The streaming-consumer regression verifies that non-whitespace overflow cancels the input stream before a second pull; the synthetic highly-compressible PDF fails closed as either `OUTPUT_TOO_LARGE` or `PROCESSING_LIMIT`.

The repository has no lint script, so lint was not available to run. The CI workflow currently triggers pull-request checks only when the PR base is `main`; this stacked PR targets PR #7 and therefore currently has no hosted check run. Independent review identified the blank and whitespace-only PDF boundary defects corrected in `bf8b817` and `c828fe5`; follow-up review of the latest fix is pending. Local evidence does not replace hosted CI or independent review.

## Security, cost, and limitations

- Fixtures are synthetic. No production credentials, customer files, external model calls, upload endpoint, database/object storage, queue, or deployment were used. This work added no paid service or recurring cost.
- CSV parsing uses strict UTF-8 decoding, a required unique header row, strict record shape, and bounded records. PDF parsing is text extraction only; image-only PDFs return `NO_TEXT_CONTENT` and OCR is not claimed. Worker limits bound the V8 heap and execution time, not total process RSS or operating-system memory; a production deployment still needs an infrastructure-level memory limit.
- The parser and limits are local adapter behavior, not a production upload security boundary or customer-facing plan quota. Authentication, authorization, private object storage, durable async work, production RLS, delete/re-index workflow, and operational controls remain unimplemented.
- `pdfjs-dist` is pinned at `6.4.299`; the earlier `5.7.284` candidate was discarded after its audit surfaced [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j). The final dependency audit reported zero vulnerabilities.
- No claim is made that G1 or the end-to-end MVP is complete. Web chat, answerability/model provider, human handoff, persistence, and the G1 integration gate remain outstanding.

## Review and gate status

- A stacked implementation PR targeting PR #7 is the next review gate; no merge has occurred.
- Follow-up independent review is still required. PR #7 and PR #5 remain open, so this branch is not yet based on `main` and hosted CI is not triggered.
- Owner approval remains required for merge/deployment or any future production data, credentials, or paid-resource use.
