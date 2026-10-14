# LINE Official Account API: Feasibility and Constraints

Verified against LINE Developers docs on 2026-10-14. Live LINE credentials and roundtrip **NOT TESTED**.

## Facts from provider documentation

- [Receiving webhook events](https://developers.line.biz/en/docs/messaging-api/receiving-messages/): LINE issues POST to registered webhook URL, recommends verifying signature and asynchronous handling. Redelivery may repeat the SAME webhook event ID; design durable deduplication.
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/): compute HMAC-SHA256 over the UNMODIFIED request body using server-held channel secret; reject invalid/missing signature, before processing.
- [Verify webhook URL](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/): empty events array is valid for probe; respond HTTP 200.
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/): reply tokens have expiration/reuse conditions; consult current docs for exact details. Never assume an LLM completes within token validity.
- [LINE Official Account Manager docs](https://developers.line.biz/en/docs/messaging-api/building-bot/): interactive manager settings need real OA validation; do not claim seamless simultaneous manager and chatbot handoff until tested.

## Required channel contract

- Workspace must be derived server-side from a trusted, uniquely owned LINE destination/channel connection.
- Bootstrap parsing for destination lookup is **untrusted** until successful signature verify.
- Dedup key: workspace/connection + webhookEventId, stored durably, not only in memory.
- Verify secret before accepting any event; check payload size/content, supported chat source and current owner opt-in status.
- Reply fast; queue bounded processing or acknowledge safely. Acknowledge receipt is not proof that user was answered.
- Human takeover is a durable AI-paused state; never let arbitrary customer phrase silently reactivate AI.
- Credentials encrypted at rest, no channel token in log, model prompt or browser; rotation and revocation fail closed.
- No action affecting orders/payments/booking until an authorized backend action lifecycle (validate -> authorize -> confirm -> idempotent execute -> verify -> audit) is implemented.

## Guided setup for MVP

1. Owner creates Workspace and verifies control.
2. Guided setup for an existing LINE Messaging API channel; request minimal credentials and validate ownership without exposing tokens.
3. Warn that updating webhook URL can disrupt an existing bot/CRM; ask user to review and opt in before changing provider config.
4. Run signed empty-event probe + synthetic message/response.
5. Test manual takeover in a controlled LINE OA sandbox, notify via operator Inbox; verify restart and timeout recovery.

## Open risks

Partner-only connect flows, webhook ownership, reply quota versus push, Manager handoff, data privacy and regional storage need ongoing provider verification and real-environment evidence. This file is a feasibility/guardrail note, not deployment approval.
