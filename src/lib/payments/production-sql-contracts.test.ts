import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("production SQL contracts", () => {
  it("does not write an undefined provider webhook updated_at column", () => {
    const stripe = source("src/app/api/integrations/stripe/webhook/route.ts");
    const stripeConnect = source("src/app/api/integrations/stripe-connect/webhook/route.ts");

    for (const webhookSource of [stripe, stripeConnect]) {
      const webhookStatements = webhookSource.match(/(?:insert into|update) public\.provider_webhook_events[\s\S]*?`/g) ?? [];
      expect(webhookStatements.length).toBeGreaterThan(0);
      for (const statement of webhookStatements) {
        expect(statement).not.toMatch(/\bupdated_at\b/);
      }
    }
  });

  it("types dynamic JSON keys in access-request email metadata", () => {
    const accessRequests = source("src/app/api/access-requests/route.ts");
    expect(accessRequests).toContain("jsonb_build_object($2::text, $3::jsonb)");
  });
});
