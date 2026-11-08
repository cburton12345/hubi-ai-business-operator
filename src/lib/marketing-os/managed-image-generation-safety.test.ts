import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(resolve(process.cwd(), "src/lib/marketing-os/managed-image-generation.ts"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "src/app/app/marketing-os/actions.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/268_managed_image_ad_lifecycle.sql"), "utf8");
const assetRoute = readFileSync(resolve(process.cwd(), "src/app/api/marketing-assets/[assetId]/route.ts"), "utf8");

describe("managed image safety contract", () => {
  it("requires an explicit execution mode and uncertified billing remains fail-closed", () => {
    expect(runtime).toContain("managedImageExecutionModeAllowsApprovedJob(gate.mode)");
    expect(runtime).toContain("IMAGE_BILLING_CONTRACT_CERTIFIED");
    expect(runtime).toContain("queryPostgresRequired as queryPostgres");
  });

  it("binds approval to exact inputs, quote, actor, and tenant-owned brand", () => {
    expect(runtime).toContain("managedImageApprovalHash");
    expect(runtime).toContain("approval_version=$5");
    expect(runtime).toContain("approved_by_actor_key=$6");
    expect(runtime).toContain("prompt_json=$7::jsonb and brand_id is not distinct from $8::uuid");
    expect(runtime).toContain("with eligible_brand as materialized");
    expect(runtime).toContain("status<>'archived' for share");
    expect(runtime).toContain("brand_id is null or exists(select 1 from eligible_brand where id=brand_id)");
    expect(actions).toContain("actorKey: actor.userId");
    expect(migration).toContain("protect_marketing_graphic_approval_trigger");
  });

  it("keeps retries attempt-scoped and completed usage unreconciled", () => {
    expect(runtime).toContain("managedImageAttemptIdentity");
    expect(runtime).toContain("attemptId");
    expect(runtime).toContain("providerCostReconciliation");
    expect(runtime).toContain("customerBillingState");
    expect(runtime).not.toContain("chargeState: \"approved_after_persistence\"");
  });

  it("makes storage finalization conditional and records reconciliation evidence", () => {
    expect(runtime).toContain("from eligible returning id");
    expect(runtime).toContain("reconciliationRequired: true");
    expect(runtime).toContain("storageEventId");
  });

  it("serves private output only after authentication and tenant-scoped lookup", () => {
    expect(assetRoute).toContain("authorizeApiPermission");
    expect(assetRoute).toContain("j.output_media_asset_id=a.id");
    expect(assetRoute).toContain("authorizedManagedImageLocation");
    expect(assetRoute).toContain("createSignedUrl");
  });
});
