import crypto from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export function isAllowedH4rCallbackUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function postH4rCallback(input: {
  tenantId: string;
  callbackUrl: string | null | undefined;
  payload: Record<string, unknown>;
}) {
  if (!input.callbackUrl) return { ok: false as const, skipped: true as const, reason: "callback_not_configured" };
  if (!env.H4R_SMS_BRIDGE_SECRET) return { ok: false as const, skipped: true as const, reason: "secret_not_configured" };
  if (!isAllowedH4rCallbackUrl(input.callbackUrl)) {
    return { ok: false as const, skipped: true as const, reason: "callback_url_not_allowed" };
  }

  const rawBody = JSON.stringify(input.payload);
  let safeError = "H4R callback failed.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const signature = crypto
      .createHmac("sha256", env.H4R_SMS_BRIDGE_SECRET)
      .update(`${timestamp}.${nonce}.${rawBody}`, "utf8")
      .digest("hex");
    try {
      const response = await fetch(input.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-h4r-timestamp": timestamp,
          "x-h4r-nonce": nonce,
          "x-h4r-signature": `sha256=${signature}`
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) return { ok: true as const, status: response.status, attempts: attempt };
      safeError = `H4R callback returned HTTP ${response.status}.`;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      safeError = error instanceof Error ? error.message.slice(0, 240) : "H4R callback network failure.";
    }
  }

  const eventId = typeof input.payload.event_id === "string" ? input.payload.event_id.slice(0, 160) : crypto.randomUUID();
  await queryPostgres(
    `insert into public.operator_alerts
      (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
     values ($1,$2,'integration','high','active','H4R message callback needs attention',$3,
       '/app/integrations/ferocity-connect',$4::jsonb)
     on conflict (tenant_id,alert_key) do update set status='active',summary=excluded.summary,
       last_seen_at=now(),resolved_at=null,updated_at=now()`,
    [
      input.tenantId,
      `h4r-callback:${eventId}`,
      safeError,
      JSON.stringify({ eventType: input.payload.event_type ?? "unknown", eventId })
    ]
  );
  return { ok: false as const, skipped: false as const, reason: "delivery_failed", safeError };
}
