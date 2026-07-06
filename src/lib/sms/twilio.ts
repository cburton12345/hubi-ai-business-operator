import { env } from "@/lib/env";

export type TwilioSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; status: number; error: string };

export function getTwilioSmsReadiness() {
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

export async function sendSmsWithTwilio(input: { to: string; body: string }): Promise<TwilioSmsResult> {
  const readiness = getTwilioSmsReadiness();
  if (!readiness.ready) {
    return {
      ok: false,
      status: 0,
      error: `Optional SMS is disabled or not ready. Missing: ${readiness.missing.join(", ")}. Use app alerts, email, or manual text drafts by default.`
    };
  }

  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const body = new URLSearchParams({
    From: env.TWILIO_FROM_NUMBER!,
    To: input.to,
    Body: input.body
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

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
