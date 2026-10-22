# Task 003 — Bounded PDF and CSV extraction (G1-B)

**Status (2026-10-23):** Bounded local PDF/CSV extraction from this task was included in PR #16 and is merged on `main` (`857b2e5`). Authenticated upload, private original-file storage and deployed processing remain unimplemented.

## Goal

Add a replaceable document-extraction adapter that turns local PDF and CSV bytes into validated text segments with source locators. Connect those segments to draft knowledge-version creation so approved retrieval can cite the extracted page or CSV record exactly.

## Locked scope and boundaries

- Keep PDF/CSV parsing outside the knowledge domain behind `KnowledgeDocumentExtractorPort`.
- Support text-based PDFs and UTF-8 CSV with a required header row.
- Preserve PDF page numbers and logical CSV record numbers (header is record 1).
- Bound input, page/row/column/record and extracted-text sizes; extract PDF text as a stream and cancel at the output cap.
- Run PDF.js in a worker with a 128 MiB old-generation heap limit, 32 MiB young-generation limit, and 15-second timeout; return `PROCESSING_LIMIT` when that boundary is hit.
- Bind each immutable version to its source kind and reject mismatches at the repository boundary.
- Make equal-score retrieval order stable by citation locator, regardless of repository row order.
- Treat extracted text as untrusted data. No OCR, model calls, external services, real customer data, or production credentials.
- Do not imply this adds upload authorization, persistent storage, async processing, production RLS, UI, or approval controls. The caller must persist and approve a draft through the repository.

## Acceptance criteria

- CSV handles Thai UTF-8, BOM, quoted delimiters, strict row shape, and exact data-record locators.
- PDF extraction produces per-page text and rejects empty/image-only input without claiming OCR.
- Invalid encoding, malformed files, oversized data, and malformed extractor-port results fail closed with safe codes.
- Highly-compressible PDF content cannot exceed the extraction cap silently; the stream is cancelled or the worker fails closed at its processing boundary.
- PDF/CSV/FAQ versions cannot be attached to a source of another kind; retrieval ties sort by page, row, or chunk position.
- A synthetic extracted CSV record can be prepared as a draft, approved in the test repository, retrieved, and cited by row.
- Typecheck, full existing test command, dependency audit, and diff hygiene have recorded evidence.

## Evidence

See `../reports/G1B-DOCUMENT-INGESTION-2026-10-15.md`. This task's completion is local branch evidence only; PR review, parent PR merge, persistence, and the end-to-end G1 acceptance remain pending.
