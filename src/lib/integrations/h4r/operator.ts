import crypto from "node:crypto";
import { env } from "@/lib/env";
import { assertCompanionActionPermitted } from "@/lib/integrations/companion-product-contract";

export type H4rOperatorMode = "observe" | "prepare" | "execute";

export type H4rOperatorResult =
  | { ok: true; skipped: true; reason: "not_configured" }
  | { ok: true; skipped: boolean; status: string; runId: string | null; mode: H4rOperatorMode; modeLimited: boolean }
  | { ok: false; skipped: false; reason: "request_failed"; safeError: string; retryable: boolean };

function configuredMode(): H4rOperatorMode {
  const value = (env.H4R_OPERATOR_MODE || "observe").trim().toLowerCase();
  if (value === "execute" || value === "prepare") return value;
  return "observe";
}

function allowedOperatorUrl(value: string) {
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
  return String(value ?? "H4R operator request failed.").replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function runH4rAutonomousOperator(): Promise<H4rOperatorResult> {
  const url = env.H4R_OPERATOR_URL;
  const secret = env.H4R_SMS_BRIDGE_SECRET;
  if (!url || !secret || !allowedOperatorUrl(url)) return { ok: true, skipped: true, reason: "not_configured" };

  const mode = configuredMode();
  const runKey = `ferocity:${Math.floor(Date.now() / 300_000)}:${mode}`;
  assertCompanionActionPermitted({
    productKey: "h4r",
    actionKey: "run_authorized_operator",
    requestedMode: mode === "observe" ? "read" : mode,
    idempotencyKey: runKey,
    approvalGatePresent: true,
    systemWorkflow: true,
  });
  const rawBody = JSON.stringify({ mode, source: "ferocity_business_automation", run_key: runKey });
  let lastError = "H4R operator request failed.";
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
        signal: AbortSignal.timeout(55_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          ok: true,
          skipped: payload?.skipped === true,
          status: String(payload?.status || payload?.run?.status || "completed").slice(0, 40),
          runId: typeof payload?.run_id === "string" ? payload.run_id : typeof payload?.run?.id === "string" ? payload.run.id : null,
          mode,
          modeLimited: payload?.mode_limited === true,
        };
      }
      lastError = safeError(payload?.error || `H4R operator returned HTTP ${response.status}.`);
      retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      lastError = safeError(error instanceof Error ? error.message : error);
      retryable = true;
    }
  }

  return { ok: false, skipped: false, reason: "request_failed", safeError: lastError, retryable };
}
