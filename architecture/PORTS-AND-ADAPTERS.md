# Ports & Adapters Contract — Design Rules

**Status:** PROPOSED conceptual contract. TypeScript snippets below are *examples*, not compiled modules or committed API stability. Implementation is a later, gated task.

## 1. Domain language

- **Workspace**: one merchant organization with independent billing, data, policy and staff.
- **ChannelConnection**: verified binding between a Workspace and web origin/widget instance or LINE OA destination.
- **Conversation**: one workspace-scoped thread; external user ID alone is never a global conversation key.
- **KnowledgeSource**: uploaded PDF/CSV/FAQ and approved source version.
- **KnowledgeCitation**: source, page/row/chunk and version that supports an answer.
- **Handoff**: explicit durable operator-controlled state (requested -> assigned -> active -> resolved -> AI resumed by authorized staff).
- **BusinessAction**: typed action proposal that needs backend policy/permission/confirmation before execution.

## 2. Normalize incoming messages

```ts
type Channel = "web" | "line"; // extensible as a registry, not separate engines
interface InboundMessage {
  channel: Channel;
  connectionId: string;             // trusted server lookup, not chat text
  externalMessageId: string;        // idempotency key per connection
  externalUserId: string;           // scoped to connection
  receivedAt: string;
  text: string;
}
// TrustedWorkspaceContext is resolved independently by the host's verified
// ChannelConnection. Incoming DTO fields do NOT grant tenant authorization.
```

## 3. Primary ports

```ts
interface ChannelPort {
  send(input: { workspaceId: string; connectionId: string; threadId: string; text: string }): Promise<void>;
}
interface ModelPort {
  generate(input: { prompt: readonly unknown[]; budget: { maxTokens: number } }): Promise<{ text: string; usage: { input: number; output: number } }>;
}
interface RetrievalPort {
  search(input: { workspaceId: string; query: string; approvedOnly: true; limit: number }): Promise<readonly KnowledgeCitation[]>;
}
interface ConversationStorePort {
  load(input: { workspaceId: string; threadId: string }): Promise<unknown>;
  append(input: { workspaceId: string; threadId: string; expectedVersion: number; event: unknown }): Promise<void>;
}
interface DeliveryPort {
  claim(input: { workspaceId: string; connectionId: string; eventId: string; leaseSeconds: number }): Promise<"claimed" | "busy" | "completed">;
  complete(input: { workspaceId: string; connectionId: string; eventId: string }): Promise<void>;
}
```

Provider adapters must translate provider-specific errors and timeouts into typed engine errors; no silent fallback to 'success'. Acknowledging a webhook is not proof the customer received a response.

## 4. Required adapter lifecycle

1. **Initialize**: validate required secrets/capabilities on host startup; fail closed.
2. **Bind**: resolve Workspace from authenticated staff or verified signed channel connection, check status/ownership.
3. **Normalize**: use an adapter to turn provider payload into a bounded normalized DTO.
4. **Execute**: shared modules apply scoped storage, policy, retrieval, answerability and human handoff.
5. **Deliver**: send through a channel adapter; record result and handle provider-specific limits.
6. **Observe**: meter latency, tokens, errors and audit outcomes; redact credentials/PII.
7. **Replace**: adapter contract tests and a rollback switch; no core domain modifications.

## 5. Invariants and negative tests

| Boundary | Must pass | Must fail closed |
|---|---|---|
| LINE ingress | Correct HMAC on raw bytes with server-stored secret; valid test ping | Forged signature, replay, unknown connection, exhausted token |
| Web ingress | Allowed origin + configured widget connection and abuse limits | Untrusted tenant override, unwanted origin, invalid session |
| Retriever | Approved, current chunks for one Workspace only | Cross-tenant, revoked source, injected instructions |
| AI | Cite actual source references, unknown fallback, spend cap | Hallucinated citations, provider unavailable with fake success |
| Handoff | Staff claims/pause, staff-only resume, durable event audit | Customer 'reset' re-enables AI, dual AI + operator reply |
| Delivery | Atomic dedupe with lease/ack and reprocessing after failure | Permanent loss after claim-but-before-process |
| Business action | Validate/authorize/confirm/execute/verify/audit | AI text attempts payment/order state mutation |

## 6. Adapter addition checklist

- [ ] Define capability and contract in `platform/contracts/`.
- [ ] Implement one adapter in `platform/adapters/`; no vendor SDK imported by `platform/modules/`.
- [ ] Resolve tenant/credential from trusted server configuration and connection ownership.
- [ ] Unit + contract tests: success, error, timeout, duplicate, cross-workspace, cost handling.
- [ ] Document configuration, data flow, risk, provider limits, observability and rollback.
- [ ] Compose opt-in at host boundary; no global switch affecting other shops by surprise.
- [ ] Add to roadmap/ADR + owner review before deployed pilot.

Refer to `BRIEF.md` for locked requirements and `research/` for cited provider facts. Avoid overstating implementation: these interfaces are only examples.
