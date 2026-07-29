import { manualSmsProvider } from "./providers/manual-sms";
import { plannedMessagingProvider } from "./providers/planned";
import { resendEmailProvider } from "./providers/resend-email";
import { twilioSmsProvider } from "./providers/twilio";
import type { MessagingChannel, MessagingProvider } from "./types";

const providers = new Map<string, MessagingProvider>([
  [manualSmsProvider.providerKey, manualSmsProvider],
  [resendEmailProvider.providerKey, resendEmailProvider],
  [twilioSmsProvider.providerKey, twilioSmsProvider],
  ["sendblue", plannedMessagingProvider("sendblue", "Sendblue", ["sms", "mms", "inbound_webhook", "delivery_webhook", "business_registration"])],
  ["telnyx", plannedMessagingProvider("telnyx", "Telnyx", ["sms", "mms", "voice", "inbound_webhook", "delivery_webhook", "phone_number_provisioning", "business_registration"])],
  ["sentdm", plannedMessagingProvider("sentdm", "Sent.dm", ["sms", "mms", "inbound_webhook", "delivery_webhook", "business_registration"])],
  ["google_voice_manual", plannedMessagingProvider("google_voice_manual", "Google Voice assisted", ["sms", "manual_send"])]
]);

export function getMessagingProvider(providerKey: string) {
  return providers.get(providerKey);
}

export function getProvidersForChannel(channel: MessagingChannel) {
  if (channel === "email") return [resendEmailProvider];
  if (channel === "sms" || channel === "mms") return [twilioSmsProvider, manualSmsProvider];
  if (channel === "manual_sms") return [manualSmsProvider];
  return [];
}

export function listMessagingProviders() {
  return [...providers.values()];
}
