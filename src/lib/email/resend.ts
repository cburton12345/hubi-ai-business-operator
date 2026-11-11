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

const RESEND_DAILY_STOP_RATIO = 0.7;
const RESEND_USAGE_CACHE_MS = 10_000;

type ResendQuotaState = {
  checkedAt: number;
  used: number;
  limit: number;
  stopAt: number;
};

let quotaState: ResendQuotaState | null = null;
let quotaRefresh: Promise<ResendQuotaState> | null = null;

export function isDeliverableRecipient(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^[^\s@]+@([^\s@]+)$/);
  if (!match) return false;
  const domain = match[1];
  return !(
    domain === "example.com" ||
    domain === "example.org" ||
    domain === "example.net" ||
    domain.endsWith(".local") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".test")
  );
}

export function evaluateResendDailyQuota(used: number, limit: number, stopRatio = RESEND_DAILY_STOP_RATIO) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return { allowed: false, stopAt: 0 };
  }
  const boundedRatio = Math.max(0.1, Math.min(stopRatio, 0.9));
  const stopAt = Math.max(1, Math.floor(limit * boundedRatio));
  return { allowed: used < stopAt, stopAt };
}

async function loadResendQuotaState() {
  const response = await fetch("https://api.resend.com/usage", {
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}` },
    signal: AbortSignal.timeout(5_000)
  });
  const body = (await response.json().catch(() => null)) as {
    emails?: { daily?: { used?: number; limit?: number } };
    message?: string;
  } | null;
  if (!response.ok) throw new Error(body?.message ?? `Resend usage returned HTTP ${response.status}.`);
  const used = Number(body?.emails?.daily?.used);
  const limit = Number(body?.emails?.daily?.limit);
  const decision = evaluateResendDailyQuota(used, limit);
  if (!decision.stopAt) throw new Error("Resend daily usage was unavailable.");
  return { checkedAt: Date.now(), used, limit, stopAt: decision.stopAt };
}

async function reserveResendDailySend() {
  if (!quotaState || Date.now() - quotaState.checkedAt >= RESEND_USAGE_CACHE_MS) {
    quotaRefresh ??= loadResendQuotaState().finally(() => {
      quotaRefresh = null;
    });
    quotaState = await quotaRefresh;
  }
  if (quotaState.used >= quotaState.stopAt) {
    return { ok: false as const, error: `Resend daily safety stop is active at ${quotaState.stopAt} of ${quotaState.limit} messages.` };
  }
  quotaState.used += 1;
  return { ok: true as const };
}

function releaseResendDailySend() {
  if (quotaState) quotaState.used = Math.max(0, quotaState.used - 1);
}

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

  if (!isDeliverableRecipient(input.to)) {
    return { ok: false, status: 0, error: "Email recipient is not deliverable." };
  }

  let reservation: Awaited<ReturnType<typeof reserveResendDailySend>>;
  try {
    reservation = await reserveResendDailySend();
  } catch {
    return { ok: false, status: 0, error: "Resend quota verification is unavailable; email was blocked safely." };
  }
  if (!reservation.ok) return { ok: false, status: 0, error: reservation.error };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.queueId.slice(0, 256)
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_ADDRESS,
        to: [input.to],
        reply_to: env.EMAIL_REPLY_TO_ADDRESS ?? env.EMAIL_FROM_ADDRESS,
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
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    releaseResendDailySend();
    return { ok: false, status: 0, error: "Resend delivery request failed before provider acceptance." };
  }

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: string } | null;

  if (!response.ok) {
    releaseResendDailySend();
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
