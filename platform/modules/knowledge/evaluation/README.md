# G1-C Synthetic Retrieval Baseline

Run with `npm run evaluate:knowledge`. The fixture includes 30 synthetic Thai/mixed-language queries over FAQ text and already-extracted PDF/CSV segments. It reports recall@3, precision@3, citation precision, abstention accuracy for unanswerable cases, latency P50/P95, and category summaries.

Citation precision checks that every returned hit maps to the exact approved workspace/version/chunk, locator, and text span. Contradiction cases expect both conflicting sources to be retrieved; this measures candidate coverage and does not decide which value is correct.

This is a deterministic lexical retrieval baseline, not a model answer evaluation. The run records zero external provider calls and USD 0 estimated provider spend; local compute and future production cost are not measured. Generated answer grounding, bad answer rate, production latency, and prompt-injection resistance are not measured. PDF/CSV parsing behavior is covered separately by the Task 003 tests. Do not treat this score as a release gate: baseline results need Owner review before pass thresholds or retrieval technology choices are set.
