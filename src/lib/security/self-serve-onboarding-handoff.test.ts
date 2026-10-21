import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("self-serve onboarding handoff", () => {
  it("routes fixed paid plans to checkout with a short-lived hashed handoff", () => {
    const route = source("src/app/api/access-requests/route.ts");
    expect(route).toContain('"ferocity_connect", "calls", "job_tracker", "starter", "growth", "operator"');
    expect(route).toContain("checkoutHandoffTokenHash: hashSessionToken(handoffToken)");
    expect(route).toContain("Date.now() + 30 * 60 * 1000");
    expect(route).toContain('return redirectTo(request, `/subscribe?${checkout.toString()}`)');
  });

  it("validates the request, token hash, expiry, and selected plan before prefilling checkout", () => {
    const page = source("src/app/subscribe/page.tsx");
    expect(page).toContain("metadata_json->>'checkoutHandoffTokenHash'=$2");
    expect(page).toContain("metadata_json->>'checkoutHandoffExpiresAt')::timestamptz > now()");
    expect(page).toContain("requested_plan=$3");
    expect(page).toContain("hashSessionToken(params.handoff)");
  });

  it("consumes a valid handoff and reuses the original access request", () => {
    const checkout = source("src/app/api/billing/checkout/route.ts");
    expect(checkout).toContain("metadata_json-'checkoutHandoffTokenHash'-'checkoutHandoffExpiresAt'");
    expect(checkout).toContain("hashSessionToken(parsed.data.checkoutHandoff)");
    expect(checkout).toContain("reusableRequest?.rows[0] ? reusableRequest");
  });

  it("keeps guided onboarding on the exact unfinished step after a return", () => {
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    const onboarding = source("src/lib/onboarding/customer-onboarding.ts");
    const integrations = source("src/app/app/integrations/page.tsx");
    expect(chat).toContain("setupProgress.filter((item) => !item.complete).slice(0, 1)");
    expect(chat).toContain("Continue from the exact unfinished step.");
    expect(onboarding).toContain("currentStepKey");
    expect(onboarding).toContain("setup=scope_reconnect_required");
    expect(integrations).toContain('params.setup === "scope_reconnect_required"');
  });
});
