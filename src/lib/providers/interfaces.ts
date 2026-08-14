export type ProviderResult<T> =
  | { ok: true; data: T; providerRequestId?: string; providerCostCents?: number }
  | { ok: false; errorCategory: string; safeMessage: string; retryable: boolean; providerRequestId?: string };

export type ProviderContext = {
  tenantId: string;
  brandId?: string | null;
  correlationId: string;
  idempotencyKey: string;
  liveActionsEnabled: boolean;
  purpose?: "production" | "authorized_test";
};

export type ProviderUsage = {
  providerKey: string;
  providerResourceId?: string | null;
  providerEventId?: string | null;
  featureKey: string;
  unitType: "second" | "minute" | "token" | "image" | "video_second" | "video_generation" | "message" | "email" | "gigabyte" | "phone_number_month" | "credit";
  quantity: number;
  providerCostCents: number;
  metadata?: Record<string, unknown>;
};

export type ProviderFundingSnapshot = {
  providerKey: string;
  balanceCents: number | null;
  promotionalBalanceCents?: number | null;
  providerPeriodSpendCents?: number | null;
  currency: string;
  observedAt: string;
  syncStatus: "current" | "stale" | "failed" | "unsupported";
  metadata?: Record<string, unknown>;
};

export interface ProviderFundingProvider {
  providerKey: string;
  fundingStatus: "live" | "manual" | "unsupported";
  getFundingSnapshot(
    context: ProviderContext
  ): Promise<ProviderResult<ProviderFundingSnapshot>>;
}

export type PhoneNumberRequest = {
  areaCode?: string;
  locality?: string;
  region?: string;
  country?: string;
  forwardingNumber?: string;
  webhookUrl: string;
};

export type PhoneNumberRecord = {
  providerKey: string;
  providerResourceId: string;
  phoneNumber: string;
  status: "provisioning" | "active" | "forwarding_pending" | "failed" | "needs_attention";
};

export type InboundCallEvent = {
  providerKey: string;
  providerCallId: string;
  providerEventId: string;
  callerNumber?: string | null;
  calledNumber?: string | null;
  status: "received" | "ringing" | "in_progress" | "completed" | "missed" | "transferred" | "failed" | "spam" | "blocked";
  occurredAt: string;
  durationSeconds?: number;
  recordingUrl?: string | null;
  transcriptText?: string | null;
  transcriptTurns?: Array<{ role: "agent" | "customer" | "unknown"; content: string }>;
  metadata?: Record<string, unknown>;
};

export type VoiceProviderConnection = {
  phoneNumber: string;
  providerResourceId: string;
};

export interface TelephonyProvider {
  providerKey: string;
  provisionNumber(context: ProviderContext, request: PhoneNumberRequest): Promise<ProviderResult<PhoneNumberRecord>>;
  releaseNumber(context: ProviderContext, providerResourceId: string): Promise<ProviderResult<{ released: boolean }>>;
  normalizeWebhook(headers: Headers, rawBody: string): Promise<ProviderResult<InboundCallEvent>>;
}

export interface VoiceAgentProvider {
  providerKey: string;
  displayName: string;
  adapterStatus: "live" | "planned";
  matchesWebhook(payload: Record<string, unknown>): boolean;
  getConnection(context: ProviderContext, requireLiveActions: boolean): Promise<ProviderResult<VoiceProviderConnection>>;
  verifyConnection(
    context: ProviderContext,
    input: { assistantId: string; webhookUrl: string; inboundWebhookUrl?: string }
  ): Promise<ProviderResult<VoiceProviderConnection>>;
  createOrUpdateAssistant(context: ProviderContext, config: Record<string, unknown>): Promise<ProviderResult<{ assistantId: string; status: string }>>;
  startOutboundCall(context: ProviderContext, input: {
    toNumber: string;
    fromNumber: string;
    assistantId: string;
    dynamicVariables?: Record<string, string>;
  }): Promise<ProviderResult<{ providerCallId: string; status: string }>>;
  normalizeWebhook(headers: Headers, rawBody: string): Promise<ProviderResult<InboundCallEvent>>;
}

export interface SpeechToTextProvider {
  providerKey: string;
  transcribe(context: ProviderContext, input: { audioUrl?: string; audioBuffer?: ArrayBuffer; language?: string }): Promise<ProviderResult<{ text: string; confidence?: number; usage: ProviderUsage }>>;
}

export interface TextToSpeechProvider {
  providerKey: string;
  renderSpeech(context: ProviderContext, input: { text: string; voice?: string; format?: string }): Promise<ProviderResult<{ audioUrl?: string; audioBuffer?: ArrayBuffer; usage: ProviderUsage }>>;
}

export interface LanguageModelProvider {
  providerKey: string;
  generateText(context: ProviderContext, input: { system: string; prompt: string; model?: string }): Promise<ProviderResult<{ text: string; usage: ProviderUsage }>>;
  generateJson<T>(context: ProviderContext, input: { system: string; prompt: string; model?: string }): Promise<ProviderResult<{ json: T; usage: ProviderUsage }>>;
}

export interface VideoGenerationProvider {
  providerKey: string;
  createVideo(context: ProviderContext, input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string }): Promise<ProviderResult<{ jobId: string; status: string; usage: ProviderUsage }>>;
  getVideo(context: ProviderContext, jobId: string): Promise<ProviderResult<{ status: string; videoUrl?: string; usage?: ProviderUsage }>>;
}

export interface ImageGenerationProvider {
  providerKey: string;
  createImage(context: ProviderContext, input: { prompt: string; assets?: string[]; size?: string; model?: string }): Promise<ProviderResult<{ imageUrl?: string; imageBuffer?: ArrayBuffer; usage: ProviderUsage }>>;
}

export interface MessagingProvider {
  providerKey: string;
  sendMessage(context: ProviderContext, input: { to: string; from?: string; body: string; mediaUrls?: string[] }): Promise<ProviderResult<{ providerMessageId: string; usage: ProviderUsage }>>;
}

export interface EmailProvider {
  providerKey: string;
  sendEmail(context: ProviderContext, input: { to: string; from: string; subject: string; html?: string; text?: string; replyTo?: string }): Promise<ProviderResult<{ providerMessageId: string; usage: ProviderUsage }>>;
}
