/** Future LINE/email adapters consume durable notifications; this slice only persists the outbox. */
export interface HandoffNotificationDeliveryPort {
  deliver(input: Readonly<{ workspaceId: string; notificationId: string; conversationId: string; reason: "no_answer" | "conflicting_evidence" }>): Promise<void>;
}
