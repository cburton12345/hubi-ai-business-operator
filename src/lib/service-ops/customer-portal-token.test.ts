import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCustomerPortalToken,
  hashCustomerPortalToken,
  isCustomerPortalToken
} from "@/lib/service-ops/customer-portal-token";

describe("customer portal bearer-token security", () => {
  it("creates high-entropy tokens and stores only deterministic hashes", () => {
    const token = createCustomerPortalToken();
    expect(isCustomerPortalToken(token)).toBe(true);
    expect(hashCustomerPortalToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCustomerPortalToken(token)).toBe(hashCustomerPortalToken(token));
    expect(hashCustomerPortalToken(createCustomerPortalToken())).not.toBe(hashCustomerPortalToken(token));
  });

  it("rejects malformed one-time links", () => {
    expect(isCustomerPortalToken("portal_short")).toBe(false);
    expect(isCustomerPortalToken("javascript:alert(1)")).toBe(false);
    expect(isCustomerPortalToken(`portal_${"a".repeat(43)}`)).toBe(true);
  });

  it("resolves public access by hash and never writes a new plaintext bearer token", () => {
    const portal = readFileSync("src/lib/service-ops/get-customer-portal.ts", "utf8");
    const publicActions = readFileSync("src/app/portal/[token]/actions.ts", "utf8");
    const ownerActions = readFileSync("src/app/app/service/actions.ts", "utf8");
    const ownerReadModel = readFileSync("src/lib/service-ops/get-customer-detail.ts", "utf8");
    const portalAction = ownerActions.slice(
      ownerActions.indexOf("export async function enableCustomerPortalAction"),
      ownerActions.indexOf("export async function disableCustomerPortalAction")
    );
    expect(portal).toContain("where a.token_hash = $1");
    expect(publicActions).toContain("where token_hash = $1");
    expect(portalAction).toContain("select $1, customer.id, null, $3, true");
    expect(portalAction).toContain("where customer.tenant_id = $1 and customer.id = $2");
    expect(portalAction).not.toContain("public_token = excluded.public_token");
    expect(ownerReadModel).not.toContain("select public_token, enabled");
  });

  it("backfills old links without a rollback-breaking cutover and requires a unique hash", () => {
    const migration = readFileSync("supabase/migrations/258_customer_portal_token_security.sql", "utf8");
    expect(migration).toContain("digest(public_token, 'sha256')");
    expect(migration).toContain("alter column token_hash set not null");
    expect(migration).toContain("customer_portal_access_token_hash_unique");
    expect(migration).not.toContain("update public.customer_portal_access set public_token = null");
  });

  it("does not expose draft invoices or a disputed/settled payment link in the customer portal", () => {
    const portal = readFileSync("src/lib/service-ops/get-customer-portal.ts", "utf8");
    expect(portal).toContain("i.status in ('sent_manually','partially_paid','paid','overdue','written_off')");
    expect(portal).toContain("greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0)>0");
    expect(portal).toContain("d.status in ('warning','needs_response','under_review','lost')");
  });

  it("does not report a portal write as successful when persistence is unavailable", () => {
    const actions = readFileSync("src/app/portal/[token]/actions.ts", "utf8");
    expect(actions).toContain("if (!persisted?.rows[0]?.accepted)");
    expect(actions.match(/\?error=save/g)).toHaveLength(2);
    expect(actions).toContain("z.string().datetime({ local: true })");
    expect(actions).toContain("from created returning id");
  });
});
