import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("tenant-isolation adversarial contracts", () => {
  it("does not authorize guessed document or export IDs without the signed-in workspace", () => {
    const documentDownload = read("src/app/api/expense-documents/[documentId]/original/route.ts");
    const exportDownload = read("src/app/api/workspace-data-exports/[exportId]/download/route.ts");
    expect(documentDownload).toContain("where tenant_id = $1 and id = $2");
    expect(documentDownload).toContain("authorization.actor.workspace.id");
    expect(exportDownload).toContain("authorization.actor.workspace.id");
    expect(exportDownload).toContain("getWorkspaceDataExportDetail(exportId, authorization.actor.workspace.id)");
    expect(documentDownload).toContain('"Cache-Control": "private, no-store"');
  });

  it("binds OAuth state claims to the authenticated workspace and consumes state once", () => {
    const callback = read("src/app/api/integrations/[provider]/oauth/callback/route.ts");
    expect(callback).toContain("where tenant_id = $1");
    expect(callback).toContain("payload_json->>'oauthState' = $2");
    expect(callback).toContain("status = 'queued'");
    expect(callback).toContain("for update skip locked");
    expect(callback).toContain("created_at > now() - interval '10 minutes'");
    expect(callback).toContain("const workspaceId = await getCurrentWorkspaceId()");
    expect(callback).toContain("claimOAuthJob(workspaceId, state, provider)");
  });

  it("keeps provider callback writes on a verified tenant binding", () => {
    const phone = read("src/app/api/integrations/phone/[provider]/webhook/route.ts");
    const stripe = read("src/app/api/integrations/stripe/webhook/route.ts");
    const inboundEmail = read("src/app/api/integrations/resend/inbound/route.ts");
    expect(phone).toContain("provider.receiveWebhook(request.headers, rawBody)");
    expect(phone).toContain("if (!normalized.ok)");
    expect(phone).toContain("`${tenantId}:${providerKey}:${event.providerEventId}`");
    expect(stripe).toContain("verifyStripeWebhookSignature");
    expect(stripe).toContain("if (!verification.ok)");
    expect(stripe).toContain("where tenant_id = $1 and id = $2");
    expect(inboundEmail).toContain("timingSafeEqual");
    expect(inboundEmail).toContain("route.tenant_id");
  });

  it("binds every MCP lookup and mutation to the authenticated credential tenant", () => {
    const credentials = read("src/lib/mcp/credentials.ts");
    const invocations = read("src/lib/mcp/invocations.ts");
    const server = read("src/lib/mcp/server.ts");
    expect(credentials).toContain("credential.token_hash=$1");
    expect(credentials).toContain("membership.tenant_id=credential.tenant_id");
    expect(invocations).toContain("where tenant_id=$1 and credential_id=$2");
    expect(invocations).toContain("where tenant_id=$1 and credential_id=$2 and id=$3");
    expect(server).toContain("input.credential.principal");
    expect(server).toContain("Controlled mutations require an idempotencyKey");
  });

  it("cannot enable a customer portal for a customer ID from another workspace", () => {
    const actions = read("src/app/app/service/actions.ts");
    const start = actions.indexOf("export async function enableCustomerPortalAction");
    const end = actions.indexOf("export async function disableCustomerPortalAction", start);
    const body = actions.slice(start, end);
    expect(body).toContain("from public.customers customer");
    expect(body).toContain("where customer.tenant_id = $1 and customer.id = $2");
    expect(body).toContain("if (enabled?.rowCount !== 1)");
    expect(body).not.toContain("values ($1, $2, null, $3, true)");
  });

  it("stores portal and external-assistant bearer credentials as hashes rather than reusable plaintext", () => {
    const portal = read("src/lib/service-ops/customer-portal-token.ts");
    const mcp = read("src/lib/mcp/credentials.ts");
    const portalMigration = read("supabase/migrations/258_customer_portal_token_security.sql");
    expect(portal).toContain('createHash("sha256")');
    expect(mcp).toContain('createHash("sha256")');
    expect(portalMigration).toContain("alter column token_hash set not null");
    expect(portalMigration).toContain("customer_portal_access_token_hash_unique");
    expect(mcp).toContain("plaintextStored: false");
  });

  it("does not expose another workspace's platform alerts on the customer health page", () => {
    const alerts = read("src/lib/observability/platform-admin-alerts.ts");
    const page = read("src/app/app/system-health/page.tsx");
    expect(alerts).toContain("where status='active' and tenant_id=$1");
    expect(page).toContain("getActivePlatformAdminAlerts(workspaceId)");
  });
});
