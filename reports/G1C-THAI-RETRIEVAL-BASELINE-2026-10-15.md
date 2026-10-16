# G1-C Thai Retrieval Baseline — Local Evidence

**Recorded:** 2026-10-15 (Asia/Bangkok)
**Task branch:** `codex/g1c-retrieval-evaluation-20261015`
**Verified code commit:** `f9799e88339019133d2f6da22519b80fbc944e25`
**Stack:** PR #9 will target PR #8 (`codex/g1b-document-ingestion-20261015`), which targets PR #7.
**Corpus:** 30 synthetic queries; 27 retrieval-answerable, 2 retrieval-abstention cases, and 1 separate policy-abstention case; `k = 3`.

## Baseline result

Run with `npm run evaluate:knowledge` in the task worktree:

| Metric | Observed |
|---|---:|
| Recall@3 | 0.963 (26/27 answerable queries found expected evidence) |
| Precision@3 | 0.333 (mean per-query relevant unique evidence divided by 3 among answerable cases) |
| Citation precision | 1.000 (returned top-3 evidence matched approved source/version, exact chunk and locator) |
| Retrieval abstention accuracy | 1.000 (2/2 revoked/unknown cases returned no evidence) |
| Policy abstention | 1 case; policy decision is not implemented or measured by this retrieval harness |
| Local retrieval latency P50 / P95 | 0.181 ms / 0.624 ms |
| External provider calls / estimated provider spend | 0 / USD 0 |

Latency values are from one local in-memory run and are not production or hosted performance evidence. Precision and timing are baselines, not acceptance thresholds.

## Findings

- The `ZX650` spelling variant did not retrieve the expected `ZX-650` SKU record; current lexical terms do not normalize that punctuation difference.
- The forbidden-topic case is labeled as a policy abstention and excluded from retrieval-abstention accuracy. The harness records that policy decision as unmeasured; retrieval alone cannot enforce forbidden-topic rules.
- FAQ, PDF-page, and CSV-row categories each had recall@3 of 1.0 in this small corpus, but precision@3 was 0.333 in each category because the top three included distractor sources.
- The contradiction fixture retrieved both conflicting sources. This measures candidate coverage only; no component identifies the authoritative value or safely hands off.
- Gold evidence uses exact source/version, chunk ID and span/page/row locator; a matching document page or CSV row is not relevant when its exact expected segment differs.
- A genuine Thai typo case (`จัดสงพัสดุกี่วัน`) is included separately from the SKU punctuation variant.

## Verification

- `npm run check` — passed; typecheck/build and **40 tests passed, 0 failed**.
- `npm run evaluate:knowledge` — passed; emitted the 30-case result and category breakdown above.
- `npm audit --json` — passed; zero vulnerabilities.
- No lint script exists in the repository.

## Limits and gate status

This is synthetic in-memory retrieval evidence. PDF/CSV documents enter the corpus as already-extracted segments; parser behavior is verified separately by Task 003. No model is called, so generated-answer grounding, bad-answer rate, model/provider latency, and future AI cost are unmeasured. The hostile-content case measures retrieval only and does not prove prompt-injection resistance. No customer data, production credentials, paid services, deployment, or external provider calls were used.

No pass thresholds or retrieval technology choice are set. Owner review of this baseline is required before either decision. PR review, the G0 security gate, actual persistence/upload, model answerability and policy enforcement, Web Chat, human handoff, and the G1 end-to-end gate remain pending.

## Follow-up verification — 2026-10-16

The evaluator was independently reviewed. The first review found that invalid latency values were silently changed to zero, which could understate P50/P95. The summarizer now rejects negative and non-finite latency samples with `RangeError`; regression coverage includes `-1`, `NaN`, and both infinities. A separate read-only follow-up review found no remaining issue in the fix.

Exact tested code candidate: `a0fdf0545c4a768434ca0dde8ddff5d1b13c24bf`. The later merge commit `ec89799` only incorporates the current G1-B parent branch; this report update is documentation-only.

| Check | Result |
|---|---|
| `npm run check` | Exit 0; typecheck/build passed; **42 tests passed, 0 failed** |
| `npm run evaluate:knowledge` | Exit 0; 30 synthetic cases; Recall@3 0.963, Precision@3 0.333, citation precision 1.000, retrieval abstention accuracy 1.000 |
| Current-run local latency | P50 0.183 ms / P95 0.605 ms; one in-memory run, not hosted or production performance evidence |
| External provider calls / estimated provider spend | 0 / USD 0 |
| `npm audit --json` | Exit 0; 0 vulnerabilities across 17 dependencies |
| Independent review | Initial Low finding fixed; independent follow-up found no remaining issue |

The `ZX650` punctuation-variant case still misses the expected evidence in this G1-C baseline. The separate G1-C1 branch contains a candidate fix and its own tests; that stacked work has not been merged. This baseline continues to show retrieval behavior only and does not establish answerability, generated-answer grounding, or end-to-end behavior.
