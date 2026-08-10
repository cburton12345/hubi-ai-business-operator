export type RetryableMessage = {
  body: string;
  channel: "sms" | "mms" | "email" | "manual_sms";
  deliveryStatus: string;
  retryAttempt: number;
};

export function requiredRetryCapability(channel: RetryableMessage["channel"]) {
  if (channel === "email") return "email" as const;
  if (channel === "mms") return "mms" as const;
  return "sms" as const;
}

export function assessMessageRetry(input: {
  message: RetryableMessage;
  requestedProviderKey: string;
  providerExists: boolean;
  providerSupportsCapability: boolean;
}) {
  if (!input.providerExists) return { allowed: false, reason: "provider_unavailable" } as const;
  if (!["failed", "rejected", "undelivered", "suspected_filtered"].includes(input.message.deliveryStatus)) {
    return { allowed: false, reason: "message_not_retryable" } as const;
  }
  if (input.message.retryAttempt >= 3) return { allowed: false, reason: "retry_limit_reached" } as const;
  if (input.message.body.startsWith("[Sensitive security message redacted]")) {
    return { allowed: false, reason: "sensitive_message" } as const;
  }
  if (!input.providerSupportsCapability) return { allowed: false, reason: "unsupported_channel" } as const;
  return {
    allowed: true,
    reason: "allowed",
    providerKey: input.requestedProviderKey,
    capability: requiredRetryCapability(input.message.channel)
  } as const;
}
