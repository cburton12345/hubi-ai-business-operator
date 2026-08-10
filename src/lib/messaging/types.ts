export type MessagingChannel = "sms" | "mms" | "email" | "phone" | "manual_sms" | "app_push" | "internal";

export type MessagingCapability =
  | "sms"
  | "mms"
  | "email"
  | "voice"
  | "manual_send"
  | "inbound_webhook"
  | "delivery_webhook"
  | "phone_number_provisioning"
  | "business_registration";

export type MessagingAttachment = {
  url: string;
  contentType?: string;
  filename?: string;
};

export type MessagingSendInput = {
  tenantId: string;
  channel: MessagingChannel;
  to: string;
  body: string;
  subject?: string;
  from?: string;
  providerKey?: string;
  queueId?: string;
  conversationId?: string;
  idempotencyKey?: string;
  attachments?: MessagingAttachment[];
  authorization?: {
    source: string;
    humanApproved?: boolean;
    policyAllowsAuto?: boolean;
    consentBasis?: "stored_contact_consent" | "authenticated_owner_verification";
  };
  metadata?: Record<string, unknown>;
};

export type MessagingSendResult =
  | {
      ok: true;
      providerKey: string;
      providerMessageId: string | null;
      status: "sent" | "queued" | "manual_ready";
      manualHref?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      ok: false;
      providerKey: string;
      status: number;
      error: string;
      retryable?: boolean;
      metadata?: Record<string, unknown>;
    };

export type MessagingProviderStatus = {
  ready: boolean;
  missing: string[];
  status: "ready" | "not_configured" | "planned" | "disabled";
};

export type ProviderDeliveryReceiptInput = {
  status: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderDeliveryReceiptNormalization = {
  normalizedStatus: "accepted" | "queued" | "sending" | "sent" | "delivered" | "failed" | "rejected" | "undelivered" | "suspected_filtered" | "unknown";
  rawStatus: string;
  errorCode: string | null;
  safeReason: string | null;
  suspectedFiltered: boolean;
  isFinal: boolean;
};

export interface MessagingProvider {
  providerKey: string;
  displayName: string;
  getCapabilities(): MessagingCapability[];
  supportsCapability(capability: MessagingCapability): boolean;
  getStatus(): MessagingProviderStatus;
  sendMessage(input: MessagingSendInput): Promise<MessagingSendResult>;
  sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult>;
  receiveMessage?(input: unknown): Promise<unknown>;
  getMessageStatus?(providerMessageId: string): Promise<unknown>;
  normalizeDeliveryReceipt?(input: ProviderDeliveryReceiptInput): ProviderDeliveryReceiptNormalization;
  handleInboundWebhook?(request: Request): Promise<Response>;
  handleDeliveryWebhook?(request: Request): Promise<Response>;
  provisionPhoneNumber?(input: unknown): Promise<unknown>;
  releasePhoneNumber?(input: unknown): Promise<unknown>;
  registerBusinessMessaging?(input: unknown): Promise<unknown>;
  getRegistrationStatus?(registrationId: string): Promise<unknown>;
}
