import type {
  InboundCallEvent,
  PhoneNumberRecord,
  PhoneNumberRequest,
  ProviderContext,
  ProviderResult,
  ProviderUsage
} from "@/lib/providers/interfaces";

export type PhoneCapability =
  | "inbound_call"
  | "outbound_call"
  | "number_provisioning"
  | "number_porting"
  | "call_forwarding"
  | "call_transfer"
  | "sms"
  | "mms"
  | "sip"
  | "ring_groups"
  | "voicemail"
  | "recording"
  | "business_hours"
  | "multi_user";

export type PhoneProviderDescriptor = {
  providerKey: string;
  displayName: string;
  adapterStatus: "live" | "planned";
  capabilities: PhoneCapability[];
  customerManaged: boolean;
};

export type PhoneCallRequest = {
  toNumber: string;
  fromNumber?: string;
  answerUrl?: string;
  statusUrl?: string;
};

export type PhoneCallRecord = {
  providerKey: string;
  providerCallId: string;
  status: "queued" | "ringing" | "in_progress" | "completed" | "failed";
};

export type PhoneMessageRecord = {
  providerKey: string;
  providerMessageId: string;
  status: "queued" | "sent" | "failed";
  usage?: ProviderUsage;
};

export interface PhoneProvider {
  readonly descriptor: PhoneProviderDescriptor;
  createNumber(context: ProviderContext, request: PhoneNumberRequest): Promise<ProviderResult<PhoneNumberRecord>>;
  portNumber(
    context: ProviderContext,
    request: { phoneNumber: string; accountReference?: string; authorizedContact?: string }
  ): Promise<ProviderResult<{ portRequestId: string; status: string }>>;
  forwardCall(
    context: ProviderContext,
    request: { phoneNumber: string; destinationNumber: string }
  ): Promise<ProviderResult<{ status: string }>>;
  placeCall(context: ProviderContext, request: PhoneCallRequest): Promise<ProviderResult<PhoneCallRecord>>;
  answerCall(
    context: ProviderContext,
    request: { providerCallId: string; answerUrl?: string }
  ): Promise<ProviderResult<{ status: string }>>;
  transferCall(
    context: ProviderContext,
    request: { providerCallId: string; destinationNumber: string }
  ): Promise<ProviderResult<{ status: string }>>;
  sendSMS(
    context: ProviderContext,
    request: { toNumber: string; fromNumber?: string; body: string }
  ): Promise<ProviderResult<PhoneMessageRecord>>;
  sendMMS(
    context: ProviderContext,
    request: { toNumber: string; fromNumber?: string; body: string; mediaUrls: string[] }
  ): Promise<ProviderResult<PhoneMessageRecord>>;
  receiveWebhook(headers: Headers, rawBody: string): Promise<ProviderResult<InboundCallEvent>>;
}

export type VoiceConversation = {
  conversationId: string;
  status: string;
  providerCallId?: string;
};

export interface VoiceAgent {
  startConversation(
    context: ProviderContext,
    input: { toNumber: string; fromNumber: string; assistantId: string }
  ): Promise<ProviderResult<VoiceConversation>>;
  stopConversation(
    context: ProviderContext,
    input: { conversationId: string }
  ): Promise<ProviderResult<{ stopped: boolean }>>;
  transferHuman(
    context: ProviderContext,
    input: { conversationId: string; destinationNumber: string; reason?: string }
  ): Promise<ProviderResult<{ transferred: boolean }>>;
  summarizeCall(
    context: ProviderContext,
    input: { conversationId: string; transcript?: string | null }
  ): Promise<ProviderResult<{ summary: string; actionItems: string[] }>>;
  scheduleAppointment(
    context: ProviderContext,
    input: { conversationId: string; requestedStart: string; customerId?: string | null; leadId?: string | null }
  ): Promise<ProviderResult<{ appointmentId: string; status: string }>>;
  executeWorkflow(
    context: ProviderContext,
    input: { conversationId: string; workflowKey: string; payload: Record<string, unknown> }
  ): Promise<ProviderResult<{ workflowRunId: string; status: string }>>;
}
