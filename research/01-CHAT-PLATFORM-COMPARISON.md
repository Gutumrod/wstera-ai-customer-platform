# External AI Chat Benchmark — 2026-10-14

**Status:** Research evidence, not deployment recommendation. Primary-source URLs checked on 2026-10-14. Product marketing claims have NOT been validated by installing these products. Recheck version, licensing, pricing and security before adoption.

## User problem

Businesses with extensive product, warranty, policy, manuals and service documents need automated first-line answers that cite approved shop content, with reliable human takeover when evidence is weak. Channel one is website chat; channel two is LINE OA. Shared engine, distinct channel adapters.

## Comparison

| Product | AI and knowledge | Human takeover | Integration form | Decision |
|---|---|---|---|---|
| [Knocket](https://knocket.trtc.io/) | Vendor-hosted agent with uploaded docs/FAQs (vendor claim) | Own inbox; two-way Telegram (vendor claim) | Embedded website widget, hosted contact page | BENCHMARK only; proprietary dependency, inspect integration APIs / PDPA |
| [Krispy AI](https://github.com/krispyhq/krispyai) | AI live chat with managed knowledge, self-hostable (author claim) | Two-way Telegram takeover | Cloudflare Worker + embeddable JS widget | Study minimal edge architecture and handoff; test maintenance maturity |
| [Vercel Chatbot](https://github.com/vercel/chatbot) | Chat app using Next.js + AI SDK and tools | Must design support-specific handoff | Full application template | Study streaming, app patterns, not helpdesk |
| [AgentDesk](https://github.com/huabeitech/agent-desk) | Document/FAQ RAG, retrieval, Answerability Gate (README claim) | Agent workspace and ticket flow | Go backend + Next.js + Qdrant, embeddable SDK | PRIMARY REFERENCE for answerability/handoff, not wholesale backend adoption |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | Captain AI in paid self-hosted plans, NOT included in free CE | Mature shared inbox, assignment | Omnichannel helpdesk | Benchmark inbox operations; no immediate full-stack dependency |
| [Flowise Embed](https://github.com/FlowiseAI/FlowiseChatEmbed) | Chat via Flowise backend | Support handoff requires design | JS widget | Reference only: standalone Embed repo archived 2026-08-13; avoid as core |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | UI primitives + AI SDK adapter (model hosted elsewhere) | Build handoff/backend ourselves | React component library | PREFERRED UI candidate after spike; no helpdesk backend |

Additional benchmark: [Flowise main project](https://github.com/FlowiseAI/Flowise) provides orchestration, separate from widget. The standalone embed repo was archived 2026-08-13 — a change from older research. Avoid relying on unsupported unmaintained libraries.

## What to borrow conceptually

1. **Knocket / Krispy:** low-friction embedded chat and one-tap human handoff.
2. **AgentDesk:** verified knowledge sourcing, documented retrieval diagnostics, answerability and agent operations.
3. **Chatwoot:** inbox states, assignment, ownership, SLA operations.
4. **assistant-ui / Vercel Chatbot:** modern streaming UX and tooling separation.
5. **Flowise:** compare agent flows only; do not require Flowise to deliver MVP.

## Evidence

- [Knocket product](https://knocket.trtc.io/) and [AI Agent setup tutorial](https://knocket.trtc.io/tutorials/ai-agent/). Documented feature != tested reliability; vendor says 'free forever', which may change.
- [Krispy AI README](https://github.com/krispyhq/krispyai): self-hosting via Cloudflare Worker / Durable Objects, Telegram handoff.
- [Vercel Chatbot](https://github.com/vercel/chatbot): Next.js and AI SDK.
- [AgentDesk README](https://github.com/huabeitech/agent-desk): RAG, Answerability Gate, admin/agent handoff, MySQL/Qdrant.
- [Chatwoot self-hosted pricing](https://www.chatwoot.com/pricing/self-hosted-plans): Community Edition excludes Captain AI.
- [Flowise embed archived repository](https://github.com/FlowiseAI/FlowiseChatEmbed) and [embed instructions](https://github.com/FlowiseAI/FlowiseDocs/blob/main/en/using-flowise/embed.md).
- [assistant-ui README](https://github.com/assistant-ui/assistant-ui): composable streaming UX, @assistant-ui/ai-sdk connector.

## Decision and validation gaps

**Recommendation:** build owned product using assistant-ui for chat presentation; use AgentDesk, Krispy and Chatwoot as reference implementations, not dependencies. Knocket is a buy-versus-build comparator. Need actual hands-on probes: Thai accuracy, data residency, telemetry, human takeover, accessibility, response latency P50/P95, upgrade safety, licensing, moderation and price-at-scale. No verified benchmark scores yet.
