import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { createTikTokCampaign } from "@/lib/integrations/tiktok-business-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const requestSchema = z.object({ actionId: z.string().uuid() });
const campaignSchema = z.object({
  advertiserId: z.string().regex(/^\d+$/),
  campaignName: z.string().min(1).max(512),
  objectiveType: z.string().regex(/^[A-Z0-9_]+$/),
  budgetMode: z.enum(["BUDGET_MODE_INFINITE", "BUDGET_MODE_DAY", "BUDGET_MODE_TOTAL"]).default("BUDGET_MODE_INFINITE"),
  budget: z.number().positive().optional(),
  specialIndustries: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  await requirePermission("approval:review_high");
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "A valid approved action ID is required." }, { status: 400 });
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ id: string; payload_json: unknown; live_actions_enabled: boolean }>(
    `select q.id,q.payload_json,a.live_actions_enabled
     from public.outbound_action_queue q
     join public.provider_accounts a on a.tenant_id=q.tenant_id and a.provider_key='tiktok_business'
       and a.status='connected' and a.credentials_status='configured'
     where q.tenant_id=$1 and q.id=$2 and q.action_type='publish_content' and q.provider_key='tiktok_business'
       and q.status='approved' and q.risk_level='high' and q.approved_by_user_id is not null and q.approved_at is not null
     limit 1`,
    [workspaceId, parsed.data.actionId]
  );
  const row = result?.rows[0];
  if (!row) return Response.json({ ok: false, error: "This campaign action is not approved or the TikTok Ads connection is not ready." }, { status: 409 });
  if (!row.live_actions_enabled) return Response.json({ ok: false, error: "TikTok campaign writes are disabled for this workspace." }, { status: 409 });
  const campaign = campaignSchema.safeParse(row.payload_json);
  if (!campaign.success) return Response.json({ ok: false, error: "The approved campaign payload is incomplete.", details: campaign.error.flatten() }, { status: 400 });

  const token = secretByAliases(await resolveTenantProviderSecrets(workspaceId, "tiktok_business"), ["oauth_access_token"], "auth_token");
  if (!token) return Response.json({ ok: false, error: "TikTok Ads authorization is missing." }, { status: 409 });
  try {
    const created = await createTikTokCampaign({
      accessToken: token,
      advertiserId: campaign.data.advertiserId,
      campaign: {
        campaign_name: campaign.data.campaignName,
        objective_type: campaign.data.objectiveType,
        budget_mode: campaign.data.budgetMode,
        ...(campaign.data.budget ? { budget: campaign.data.budget } : {}),
        ...(campaign.data.specialIndustries ? { special_industries: campaign.data.specialIndustries } : {}),
        operation_status: "DISABLE"
      }
    });
    await queryPostgres(
      `update public.outbound_action_queue set status='sent',processed_at=now(),last_error=null,
       metadata_json=metadata_json || $3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [workspaceId, row.id, JSON.stringify({ provider: "tiktok_business", providerCampaignId: created.data.campaign_id, providerRequestId: created.requestId ?? null, providerOperationStatus: "DISABLE", createdAt: new Date().toISOString(), spendActivated: false })]
    );
    return Response.json({ ok: true, campaignId: created.data.campaign_id, status: "DISABLED", message: "The approved campaign was created disabled. Ad groups, creatives, activation, and spend remain separate approved actions." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TikTok campaign creation failed.";
    await queryPostgres(`update public.outbound_action_queue set status='failed',last_error=$3,metadata_json=metadata_json || $4::jsonb,updated_at=now() where tenant_id=$1 and id=$2`, [workspaceId, row.id, message, JSON.stringify({ provider: "tiktok_business", failedAt: new Date().toISOString() })]);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
