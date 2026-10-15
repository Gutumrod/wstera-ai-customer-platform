# Task 003 — Bounded PDF and CSV extraction (G1-B)

**Status:** Implemented locally on `codex/g1b-document-ingestion-20261015`; stacked on G1-A PR #7. No merge or deployment has occurred.

## Goal

Add a replaceable document-extraction adapter that turns local PDF and CSV bytes into validated text segments with source locators. Connect those segments to draft knowledge-version creation so approved retrieval can cite the extracted page or CSV record exactly.

## Locked scope and boundaries

- Keep PDF/CSV parsing outside the knowledge domain behind `KnowledgeDocumentExtractorPort`.
- Support text-based PDFs and UTF-8 CSV with a required header row.
- Preserve PDF page numbers and logical CSV record numbers (header is record 1).
- Bound input, page/row/column/record and extracted-text sizes; return stable failure codes for rejected input.
- Treat extracted text as untrusted data. No OCR, model calls, external services, real customer data, or production credentials.
- Do not imply this adds upload authorization, persistent storage, async processing, production RLS, UI, or approval controls. The caller must persist and approve a draft through the repository.

## Acceptance criteria

- CSV handles Thai UTF-8, BOM, quoted delimiters, strict row shape, and exact data-record locators.
- PDF extraction produces per-page text and rejects empty/image-only input without claiming OCR.
- Invalid encoding, malformed files, oversized data, and malformed extractor-port results fail closed with safe codes.
- A synthetic extracted CSV record can be prepared as a draft, approved in the test repository, retrieved, and cited by row.
- Typecheck, full existing test command, dependency audit, and diff hygiene have recorded evidence.

## Evidence

See `../reports/G1B-DOCUMENT-INGESTION-2026-10-15.md`. This task's completion is local branch evidence only; PR review, parent PR merge, persistence, and the end-to-end G1 acceptance remain pending.
