import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("paid workspace provisioning recovery contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/billing/provision-paid-workspace.ts"), "utf8");

  it("serializes duplicate Stripe events before resolving or creating a workspace", () => {
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("ferocity-paid-workspace:${input.subscriptionId}");
  });

  it("records a durable provisioning checkpoint immediately after workspace resolution", () => {
    expect(source).toContain('checkoutStatus: "provisioning"');
    expect(source).toContain("workspaceId: tenantId");
    expect(source).toContain("workspaceSlug");
  });

  it("only treats the subscription as complete when the access request has its final marker", () => {
    expect(source).toContain('metadataText(request.metadata_json, "checkoutStatus") === "paid_and_provisioned"');
    expect(source).toContain("if (completed && priorSubscription.rows[0] && candidateWorkspace?.rows[0])");
  });

  it("can restore a missing brand and defaults without replacing an existing active brand", () => {
    expect(source).toContain("async function ensureWorkspaceFoundation");
    expect(source).toContain("where tenant_id = $1 and status = 'active'");
    expect(source).toContain("if (!brandId)");
    expect(source).toContain("on conflict (brand_id, slug) do nothing");
  });

  it("does not create an invitation when the recovering workspace already has the buyer as an active member", () => {
    expect(source).toContain("and ($2::uuid is null or t.id = $2::uuid)");
    expect(source).toContain("hasActiveMembership: Boolean(existingMembership)");
    expect(source).toContain("if (!target.hasActiveMembership)");
  });

  it("does not mark provisioning complete until the activation email is delivered", () => {
    const emailCheck = source.indexOf("if (!activationEmail.ok)");
    const completionMarker = source.lastIndexOf('checkoutStatus: "paid_and_provisioned"');
    expect(emailCheck).toBeGreaterThan(0);
    expect(completionMarker).toBeGreaterThan(emailCheck);
    expect(source).toContain("activationEmailDelivered: true");
  });

  it("fails closed when a required provisioning database write is unavailable", () => {
    expect(source).toContain("async function requirePostgres");
    expect(source).toContain("if (!result) throw new Error(safeError)");
  });
});
