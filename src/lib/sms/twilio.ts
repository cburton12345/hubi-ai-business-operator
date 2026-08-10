import { env } from "@/lib/env";
import type { TwilioSmsConfiguration } from "@/lib/messaging/twilio-tenant-config";
import { resilientFetch } from "@/lib/http/resilient-fetch";

export type TwilioSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; status: number; error: string };

export function getTwilioSmsReadiness(configuration?: TwilioSmsConfiguration | null) {
  if (configuration) return { ready: true, missing: [] };
  const missing: string[] = [];

  if (env.ENABLE_TWILIO_SMS_SENDS !== "true") missing.push("ENABLE_TWILIO_SMS_SENDS=true");
  if (!env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!env.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!env.TWILIO_FROM_NUMBER) missing.push("TWILIO_FROM_NUMBER");

  return {
    ready: missing.length === 0,
    missing
  };
}

export async function sendSmsWithTwilio(input: {
  to: string;
  body: string;
  configuration?: TwilioSmsConfiguration | null;
}): Promise<TwilioSmsResult> {
  const readiness = getTwilioSmsReadiness(input.configuration);
  if (!readiness.ready) {
    return {
      ok: false,
      status: 0,
      error: `Optional SMS is disabled or not ready. Missing: ${readiness.missing.join(", ")}. Use app alerts, email, or manual text drafts by default.`
    };
  }

  const configuration = input.configuration ?? {
    accountSid: env.TWILIO_ACCOUNT_SID!,
    authUsername: env.TWILIO_ACCOUNT_SID!,
    authPassword: env.TWILIO_AUTH_TOKEN!,
    webhookAuthToken: env.TWILIO_AUTH_TOKEN!,
    fromNumber: env.TWILIO_FROM_NUMBER!,
    messagingServiceSid: null
  };
  const auth = Buffer.from(`${configuration.authUsername}:${configuration.authPassword}`).toString("base64");
  const body = new URLSearchParams({
    To: input.to,
    Body: input.body
  });
  if (configuration.messagingServiceSid) body.set("MessagingServiceSid", configuration.messagingServiceSid);
  else if (configuration.fromNumber) body.set("From", configuration.fromNumber);

  const response = await resilientFetch(`https://api.twilio.com/2010-04-01/Accounts/${configuration.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  }, { timeoutMs: 12_000 });

  const payload = (await response.json().catch(() => null)) as { sid?: string; message?: string; error_message?: string } | null;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.message ?? payload?.error_message ?? `Twilio returned HTTP ${response.status}.`
    };
  }

  return {
    ok: true,
    providerMessageId: payload?.sid ?? null
  };
}
