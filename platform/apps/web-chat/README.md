# Web AI Chat Widget

**Status:** MERGED, BUILD_PASS only (WEBCHAT-001 PR #30–#33 on `main` @ `b080d57`); the page, session, routes and `SupportOrchestrator` wiring exist as code and local tests, but no real host or hosted deployment serves them. **Planned phase:** Phase 1.

## Responsibility

Customer web chat UI rendering, safe origin binding, signed session management, client/session rate limiting, and extractive source citation display.

## Implemented in Chunk 2

- `render-chat-page.ts`: Accessible Thai chat UI renderer (`renderChatPage({ connectionId, nonce })`) with keyboard navigation, ARIA live region, citation chips (title, version, position), and handoff action button ("ขอคุยกับพนักงาน"). Dynamic DOM insertion relies strictly on `textContent` (no `innerHTML`).
- `platform/composition/web-chat-session.ts`: HMAC-SHA256 signed HttpOnly SameSite=Strict session cookie bound to resolved connection ID with random server-generated `conversationId` (`crypto.randomUUID()`) and constant-time signature verification (`timingSafeEqual`).
- `platform/composition/web-chat-routes.ts`: Standard `Request`/`Response` route handlers (`page`, `message`) enforcing strict verification ordering: client rate limit (429) -> session verification (401) -> server-side connection resolution (404) -> origin validation (403) -> Content-Type check (415) -> session rate limit (429) -> bounded body parsing (413/400) -> connection matching (401).
- `platform/adapters/answers/extractive/extractive-answer-port.ts`: Default `GroundedAnswerPort` returning verbatim excerpt text from approved evidence chunks (up to 2 items, bounded total character limit). Evidence text is strictly handled as untrusted data.
- `platform/adapters/answers/answer-port-factory.ts`: Closed-by-default answer port factory; `createModelPort` is never invoked unless `modelEnabled === true`.

## Pending

- A real app host that mounts `createWebChatRoutes` and `createWebChatHost`; only composition code and tests call them today.
- Durable conversation storage (HANDOFF-002); conversations are in memory only.
- Cross-origin iframe embed packaging (Phase 1 currently enforces `frame-ancestors 'none'`).
