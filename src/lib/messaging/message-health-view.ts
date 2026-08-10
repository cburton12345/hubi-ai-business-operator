const problemStatuses = new Set(["failed", "rejected", "undelivered", "suspected_filtered"]);

export function messageNeedsAttention(status: string) {
  return problemStatuses.has(status);
}

export function messageHealthTone(status: string) {
  if (status === "delivered" || status === "received") return "";
  return messageNeedsAttention(status) ? "high" : "medium";
}

export function messageHealthLabel(input: { direction: string; deliveryStatus: string }) {
  if (input.direction !== "outbound") return input.direction === "inbound" ? "received" : input.direction;
  return input.deliveryStatus.replaceAll("_", " ");
}

export function safeDeliveryExplanation(input: {
  direction: string;
  safeReason?: string | null;
  errorCode?: string | null;
}) {
  if (input.direction !== "outbound") return null;
  if (input.safeReason && input.errorCode) return `${input.safeReason} Provider code: ${input.errorCode}.`;
  if (input.safeReason) return input.safeReason;
  if (input.errorCode) return `The provider reported code ${input.errorCode}.`;
  return null;
}
