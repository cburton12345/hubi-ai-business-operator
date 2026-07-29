import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("security hardening invariants", () => {
  it("never treats an unauthenticated request as emergency admin", () => {
    const permissionSource = source("src/lib/auth/require-permission.ts");
    expect(permissionSource).toContain("if (!session && !adminSession)");
    expect(permissionSource).toContain('redirect("/login")');
    expect(permissionSource).toContain("if (adminSession)");
  });

  it("does not accept the emergency admin token from a URL or store it raw in the session cookie", () => {
    const middlewareSource = source("middleware.ts");
    const loginSource = source("src/app/login/actions.ts");
    expect(middlewareSource).not.toContain('searchParams.get("adminToken")');
    expect(middlewareSource).toContain('crypto.subtle.digest("SHA-256"');
    expect(loginSource).toContain("adminSessionCookieValue()");
    expect(loginSource).not.toContain("cookieStore.set(adminSessionCookieName, token");
  });

  it("uses Stripe direct charges and replay/idempotency controls", () => {
    const serviceSource = source("src/app/app/service/actions.ts");
    const webhookSource = source("src/app/api/integrations/stripe/webhook/route.ts");
    const connectSource = source("src/app/api/integrations/stripe-connect/onboard/route.ts");
    const connectWebhookSource = source("src/app/api/integrations/stripe-connect/webhook/route.ts");
    expect(serviceSource).toContain('"stripe_connect_direct"');
    expect(serviceSource).toContain("connectedAccountId:");
    expect(serviceSource).not.toContain('payment_intent_data[transfer_data][destination]');
    expect(webhookSource).toContain("public.provider_webhook_events");
    expect(webhookSource).toContain("duplicate: true");
    expect(connectSource).toContain('dashboard: "full"');
    expect(connectSource).toContain('fees_collector: "stripe"');
    expect(connectSource).toContain('losses_collector: "stripe"');
    expect(connectSource).toContain('stripeAccountApiVersion: "v2"');
    expect(connectSource).not.toContain('type: "express"');
    expect(connectWebhookSource).toContain('"v2.core.account[requirements].updated"');
    expect(connectWebhookSource).toContain("verifyStripeWebhookSignature");
    expect(connectWebhookSource).toContain("public.provider_webhook_events");
  });

  it("blocks private redirect targets and bounds public website downloads", () => {
    const importerSource = source("src/lib/marketing-os/website-import-processor.ts");
    expect(importerSource).toContain("assertPublicDestination");
    expect(importerSource).toContain('redirect: "manual"');
    expect(importerSource).toContain("response.body?.getReader()");
    expect(importerSource).toContain("reader.cancel()");
  });

  it("rate-limits public AI and intake cost surfaces with pseudonymous identifiers", () => {
    const limiterSource = source("src/lib/security/rate-limit.ts");
    expect(limiterSource).toContain('createHmac("sha256"');
    expect(limiterSource).toContain('NODE_ENV === "production"');
    expect(limiterSource).toContain("SECURITY_HMAC_KEY is required");
    for (const route of [
      "src/app/api/public/chat/route.ts",
      "src/app/api/public/leads/route.ts",
      "src/app/api/website-grader/route.ts"
    ]) {
      expect(source(route)).toContain("consumePublicRateLimit");
    }
  });
});
