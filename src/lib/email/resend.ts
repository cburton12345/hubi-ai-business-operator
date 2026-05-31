import { env } from "@/lib/env";

export type ResendEmailInput = {
  to: string;
  subject: string;
  text: string;
  queueId: string;
  tenantId: string;
};

export type ResendEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; status: number; error: string };

export function getResendEmailReadiness() {
  const missing: string[] = [];

  if ((env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") missing.push("EMAIL_PROVIDER=resend");
  if (!env.EMAIL_API_KEY) missing.push("EMAIL_API_KEY");
  if (!env.EMAIL_FROM_ADDRESS) missing.push("EMAIL_FROM_ADDRESS");

  return {
    ready: missing.length === 0,
    missing
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${line}</p>` : "<br />"))
    .join("");
}

export async function sendEmailWithResend(input: ResendEmailInput): Promise<ResendEmailResult> {
  const readiness = getResendEmailReadiness();
  if (!readiness.ready) {
    return {
      ok: false,
      status: 0,
      error: `Resend is not ready. Missing: ${readiness.missing.join(", ")}.`
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM_ADDRESS,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
      headers: {
        "X-Ferocity-Queue-Id": input.queueId,
        "X-Ferocity-Tenant-Id": input.tenantId
      },
      tags: [
        { name: "source", value: "ferocity" },
        { name: "action", value: "email_send" }
      ]
    })
  });

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: string } | null;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body?.message ?? body?.error ?? `Resend returned HTTP ${response.status}.`
    };
  }

  return {
    ok: true,
    providerMessageId: body?.id ?? null
  };
}
