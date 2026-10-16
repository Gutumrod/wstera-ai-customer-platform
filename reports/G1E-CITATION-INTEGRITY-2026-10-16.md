# G1E Citation Integrity — Local Evidence

**Recorded:** 2026-10-16 (Asia/Bangkok)
**Task branch:** `codex/g1e-citation-integrity-20261016`
**Code commit:** `779999a`
**Base:** G1-C retrieval evaluation branch / PR #9.

## Delivered

- Added a pure shared AI-engine module that accepts a response draft only when every citation exactly matches evidence supplied for the same server-resolved workspace.
- Rejects absent evidence, invalid draft data, empty answers, missing citations, foreign-workspace evidence, cross-workspace citations, malformed citation locators, and unsupported source/version/chunk/locator identities with stable fail-closed reasons.
- Confirms each retrieval hit's source/version identity matches its citation; deduplicates repeated citations and returns canonical citation objects from the evidence list.
- Added tests for FAQ span, PDF page, CSV row, duplicate refs, fabricated identifiers, malformed locators, and workspace/source/version mismatches.

## Verification

| Check | Result |
|---|---|
| `npm ci` | Exit 0; installed from lockfile; 0 vulnerabilities reported |
| `npm run check` | Exit 0; typecheck/build passed; **49 tests passed, 0 failed** |
| `npm run evaluate:knowledge` | Exit 0; 30 synthetic cases; Recall@3 0.963; Precision@3 0.333; citation precision 1.000; retrieval abstention accuracy 1.000; 0 provider calls / USD 0 estimated provider spend |
| `npm audit --json` | Exit 0; 0 vulnerabilities across 17 dependencies |
| `git diff --check` | Exit 0 |
| Independent review | No actionable correctness or security findings; review confirmed the provenance-only boundary |

## Security boundary and limitations

This validates citation provenance only. It does not prove cited text semantically supports answer claims, detect conflicting evidence, or decide answerability. The caller must pass evidence from the trusted tenant-scoped retrieval path and a server-resolved workspace; this function cannot authenticate arbitrary caller-supplied hits or independently re-check approval/source status. No model/provider, channel, API/UI, persistence, customer data, production credential, paid service, or deployment was used. This is not G1 end-to-end or production evidence.

## Gate status

Implementation, local checks, and independent review are complete for this scoped foundation. PR #13 is open against PR #9 with clean merge state, but has no hosted CI evidence. Merge/deploy remains subject to the Owner gate; Web Chat, semantic answerability, model generation, durable knowledge/conversation storage, and the one-shop G1 integration proof remain outstanding.
