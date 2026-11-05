# Web AI Chat Widget

**Status:** BUILD_PASS target, local composition and PGlite route integration only. `platform/apps/merchant-console/app/chat/route.ts` and `/chat/message` mount the Web Chat host; this does not prove hosted migration application or deployment. **Phase:** Phase 1.

## Responsibility

Customer web chat UI rendering, safe origin binding, signed session management, client/session rate limiting, and extractive source citation display.

## Implemented in Chunk 2

- `render-chat-page.ts`: Accessible Thai chat UI renderer (`renderChatPage({ connectionId, nonce })`) with keyboard navigation, ARIA live region, citation chips (title, version, position), and handoff action button ("ขอคุยกับพนักงาน"). Dynamic DOM insertion relies strictly on `textContent` (no `innerHTML`).
- `platform/composition/web-chat-session.ts`: HMAC-SHA256 signed HttpOnly SameSite=Strict session cookie bound to resolved connection ID with random server-generated `conversationId` (`crypto.randomUUID()`) and constant-time signature verification (`timingSafeEqual`).
- `platform/composition/web-chat-routes.ts`: Standard `Request`/`Response` route handlers (`page`, `message`) enforcing strict verification ordering: client rate limit (429) -> session verification (401) -> server-side connection resolution (404) -> origin validation (403) -> Content-Type check (415) -> session rate limit (429) -> bounded body parsing (413/400) -> connection matching (401).
- `platform/adapters/answers/extractive/extractive-answer-port.ts`: Default `GroundedAnswerPort` returning verbatim excerpt text from approved evidence chunks (up to 2 items, bounded total character limit). Evidence text is strictly handled as untrusted data.
- `platform/adapters/answers/answer-port-factory.ts`: Closed-by-default answer port factory; `createModelPort` is never invoked unless `modelEnabled === true`.

## Pending

- Apply migration `20261105000100_web_chat_host.sql` only after a separate Owner GO; it adds `allowed_origins` and `query_aliases` with column-only read grants for `knowledge_runtime`.
- Configure `WEB_CHAT_SESSION_SECRET` to at least 32 bytes. Missing or short values make chat routes return 503. `WEB_CHAT_TRUSTED_IP_HEADER` is optional; when unset, visitors to one connection share a rate-limit bucket.
- Configure exact allowed website origins through workspace connection setup. The local seed reads `WEB_CHAT_ALLOWED_ORIGINS`; when unset, every origin is denied.
- Durable conversation storage and human handoff remain HANDOFF-002. Conversations are in memory only; when handoff is unavailable, the customer is told it could not be sent.
- Cross-origin iframe embed packaging (Phase 1 currently enforces `frame-ancestors 'none'`).

No hosted Postgres, Supabase, or deployed route has been exercised by this task.
