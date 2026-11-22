import crypto from "node:crypto";
import { env } from "@/lib/env";
import { assertCompanionActionPermitted } from "@/lib/integrations/companion-product-contract";

export type H4rLeasingDecision = "approve" | "edit_and_send" | "hold" | "close";

export type H4rLeasingDecisionResult =
  | { ok: true; skipped: false; decision: H4rLeasingDecision; queued: boolean; duplicate: boolean }
  | { ok: false; skipped: true; reason: "not_configured" }
  | { ok: false; skipped: false; reason: "request_failed"; safeError: string; retryable: boolean };

function allowedUrl(value: string) {
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

function safeError(value: unknown) {
  return String(value ?? "H4R leasing decision failed.").replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function applyH4rLeasingDecision(input: {
  externalEventId: string;
  decision: H4rLeasingDecision;
  replyBody?: string | null;
  idempotencyKey: string;
}): Promise<H4rLeasingDecisionResult> {
  const url = env.H4R_LEASING_DECISION_URL;
  const secret = env.H4R_SMS_BRIDGE_SECRET;
  if (!url || !secret || !allowedUrl(url)) return { ok: false, skipped: true, reason: "not_configured" };

  if (!input.externalEventId.startsWith("h4r:leasing-owner-alert:")
    && !input.externalEventId.startsWith("h4r:owner-notification:")) {
    return { ok: false, skipped: false, reason: "request_failed", safeError: "This is not an actionable H4R leasing event.", retryable: false };
  }
  const replyBody = input.replyBody?.trim() || null;
  if (input.decision === "edit_and_send" && (!replyBody || replyBody.length > 2000)) {
    return { ok: false, skipped: false, reason: "request_failed", safeError: "Edited replies must contain 1 to 2000 characters.", retryable: false };
  }

  assertCompanionActionPermitted({
    productKey: "h4r",
    actionKey: "send_owner_approved_message",
    requestedMode: input.decision === "approve" || input.decision === "edit_and_send" ? "execute" : "prepare",
    idempotencyKey: input.idempotencyKey,
    approvalGatePresent: true,
    authoritativeVerificationPresent: true,
    systemWorkflow: true,
  });

  const rawBody = JSON.stringify({
    external_event_id: input.externalEventId,
    decision: input.decision,
    reply_body: replyBody,
    idempotency_key: input.idempotencyKey,
  });
  let lastError = "H4R leasing decision failed.";
  let retryable = true;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const signature = crypto.createHmac("sha256", secret)
      .update(`${timestamp}.${nonce}.${rawBody}`, "utf8")
      .digest("hex");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-h4r-timestamp": timestamp,
          "x-h4r-nonce": nonce,
          "x-h4r-signature": `sha256=${signature}`,
        },
        body: rawBody,
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          ok: true,
          skipped: false,
          decision: input.decision,
          queued: payload?.queued === true,
          duplicate: payload?.duplicate === true,
        };
      }
      lastError = safeError(payload?.error || `H4R returned HTTP ${response.status}.`);
      retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      lastError = safeError(error instanceof Error ? error.message : error);
      retryable = true;
    }
  }
  return { ok: false, skipped: false, reason: "request_failed", safeError: lastError, retryable };
}
