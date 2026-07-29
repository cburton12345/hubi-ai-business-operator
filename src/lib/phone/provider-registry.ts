import type {
  InboundCallEvent,
  PhoneNumberRecord,
  ProviderContext,
  ProviderResult
} from "@/lib/providers/interfaces";
import type {
  PhoneCallRecord,
  PhoneCallRequest,
  PhoneMessageRecord,
  PhoneProvider,
  PhoneProviderDescriptor
} from "@/lib/phone/contracts";

function unavailable(providerKey: string): ProviderResult<never> {
  return {
    ok: false,
    errorCategory: "phone_provider_not_configured",
    safeMessage: `${providerKey} is not connected for this business yet.`,
    retryable: false
  };
}

class PlannedPhoneProvider implements PhoneProvider {
  constructor(readonly descriptor: PhoneProviderDescriptor) {}

  async createNumber(_context: ProviderContext): Promise<ProviderResult<PhoneNumberRecord>> {
    return unavailable(this.descriptor.providerKey);
  }

  async portNumber(): Promise<ProviderResult<{ portRequestId: string; status: string }>> {
    return unavailable(this.descriptor.providerKey);
  }

  async forwardCall(): Promise<ProviderResult<{ status: string }>> {
    return unavailable(this.descriptor.providerKey);
  }

  async placeCall(_context: ProviderContext, _request: PhoneCallRequest): Promise<ProviderResult<PhoneCallRecord>> {
    return unavailable(this.descriptor.providerKey);
  }

  async answerCall(): Promise<ProviderResult<{ status: string }>> {
    return unavailable(this.descriptor.providerKey);
  }

  async transferCall(): Promise<ProviderResult<{ status: string }>> {
    return unavailable(this.descriptor.providerKey);
  }

  async sendSMS(): Promise<ProviderResult<PhoneMessageRecord>> {
    return unavailable(this.descriptor.providerKey);
  }

  async sendMMS(): Promise<ProviderResult<PhoneMessageRecord>> {
    return unavailable(this.descriptor.providerKey);
  }

  async receiveWebhook(): Promise<ProviderResult<InboundCallEvent>> {
    return unavailable(this.descriptor.providerKey);
  }
}

const registry = new Map<string, PhoneProvider>();

export function registerPhoneProvider(provider: PhoneProvider) {
  registry.set(provider.descriptor.providerKey, provider);
}

export function getPhoneProvider(providerKey: string) {
  return registry.get(providerKey) ?? null;
}

export function listPhoneProviders() {
  return [...registry.values()].map((provider) => provider.descriptor);
}

const fullCapabilities = [
  "inbound_call",
  "outbound_call",
  "number_provisioning",
  "number_porting",
  "call_forwarding",
  "call_transfer",
  "sms",
  "mms",
  "sip",
  "ring_groups",
  "voicemail",
  "recording",
  "business_hours",
  "multi_user"
] as const;

for (const descriptor of [
  { providerKey: "twilio_phone", displayName: "Twilio", customerManaged: true },
  { providerKey: "telnyx_phone", displayName: "Telnyx", customerManaged: true },
  { providerKey: "signalwire_phone", displayName: "SignalWire", customerManaged: true },
  { providerKey: "vonage_phone", displayName: "Vonage", customerManaged: true },
  { providerKey: "generic_sip", displayName: "Existing phone system", customerManaged: true },
  { providerKey: "ferocity_managed_phone", displayName: "Ferocity-managed phone service", customerManaged: false }
] as const) {
  registerPhoneProvider(new PlannedPhoneProvider({
    ...descriptor,
    adapterStatus: "planned",
    capabilities: [...fullCapabilities]
  }));
}
