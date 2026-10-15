# G1-C Thai Retrieval Baseline — Local Evidence

**Recorded:** 2026-10-15 (Asia/Bangkok)
**Task branch:** `codex/g1c-retrieval-evaluation-20261015`
**Stack:** PR #9 will target PR #8 (`codex/g1b-document-ingestion-20261015`), which targets PR #7.
**Corpus:** 30 synthetic queries; 27 answerable, 3 expected to abstain; `k = 3`.

## Baseline result

Run with `npm run evaluate:knowledge` in the task worktree:

| Metric | Observed |
|---|---:|
| Recall@3 | 0.963 (26/27 answerable queries found expected evidence) |
| Precision@3 | 0.346 (mean per-query precision among answerable cases) |
| Citation precision | 1.000 (all returned hits matched an approved version, exact chunk text, and source locator) |
| Abstention accuracy | 0.667 (2/3 expected no-answer cases returned no evidence) |
| Local retrieval latency P50 / P95 | 0.175 ms / 0.766 ms |
| External provider calls / estimated provider spend | 0 / USD 0 |

Latency values are from one local in-memory run and are not production or hosted performance evidence. Precision and timing are baselines, not acceptance thresholds.

## Findings

- The `ZX650` spelling variant did not retrieve the expected `ZX-650` SKU record; current lexical terms do not normalize that punctuation difference.
- The forbidden-topic negative case returned unrelated lexical matches, so abstention accuracy was 2/3. Retrieval alone has no policy/answerability gate and cannot enforce forbidden-topic rules.
- FAQ, PDF-page, and CSV-row categories each had recall@3 of 1.0 in this small corpus, but precision@3 was 0.333 in each category because the top three included distractor sources.
- The contradiction fixture retrieved both conflicting sources. This measures candidate coverage only; no component identifies the authoritative value or safely hands off.
- Every emitted citation was traceable to exact stored content and its span/page/row locator.

## Verification

- `npm run check` — passed; typecheck/build and **32 tests passed, 0 failed**.
- `npm run evaluate:knowledge` — passed; emitted the 30-case result and category breakdown above.
- `npm audit --json` — passed; zero vulnerabilities.
- No lint script exists in the repository.

## Limits and gate status

This is synthetic in-memory retrieval evidence. PDF/CSV documents enter the corpus as already-extracted segments; parser behavior is verified separately by Task 003. No model is called, so generated-answer grounding, bad-answer rate, model/provider latency, and future AI cost are unmeasured. The hostile-content case measures retrieval only and does not prove prompt-injection resistance. No customer data, production credentials, paid services, deployment, or external provider calls were used.

No pass thresholds or retrieval technology choice are set. Owner review of this baseline is required before either decision. PR review, the G0 security gate, actual persistence/upload, answerability policy, Web Chat, human handoff, and the G1 end-to-end gate remain pending.
