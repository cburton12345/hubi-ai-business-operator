"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { connectorCanBeMarkedReady } from "@/lib/integrations/connector-runtime";
import { missingEnvVars } from "@/lib/env";
import {
  canEnableProviderLiveActions,
  integrationStatusForCertification,
  laneStatusForCertification,
  providerAccountStatusForCertification,
  providerCertificationStatuses
} from "@/lib/integrations/provider-certification";
import { markAdapterBuildReleased, queueAdapterFactoryBuild, reviewAdapterBuild } from "@/lib/integrations/adapter-factory";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";
import { syncCustomerOnboardingForTenant } from "@/lib/onboarding/customer-onboarding";

const integrationToggleSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["planned", "paused", "connected"]),
  liveActionsEnabled: z.enum(["false", "true"]).default("false")
});

const providerRequestSchema = z.object({
  providerName: z.string().trim().min(2).max(120),
  providerUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  capabilityCategory: z.enum(["ai_text", "sms", "voice", "video", "image", "email", "storage", "payments", "accounting", "calendar", "advertising", "other"]),
  useCase: z.string().trim().min(10).max(1500),
  currentlyUsing: z.enum(["true", "false"]).default("false")
});

const adapterReviewSchema = z.object({
  buildId: z.string().uuid(),
  decision: z.enum(["approved_for_engineering", "changes_requested", "rejected"]),
  notes: z.string().trim().max(1000).optional().default("")
});

const adapterReleaseSchema = z.object({
  buildId: z.string().uuid(),
  releaseVersion: z.string().trim().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  deploymentCommitSha: z.string().trim().regex(/^[a-f0-9]{7,64}$/i)
});

const providerCertificationSchema = z.object({
  connectionId: z.string().uuid(),
  certificationStatus: z.enum(providerCertificationStatuses),
  evidenceNote: z.string().trim().min(4).max(1200),
  liveActionsEnabled: z.enum(["false", "true"]).default("false")
});

const disconnectIntegrationSchema = z.object({
  connectionId: z.string().uuid()
});

const selectProviderAccountSchema = z.object({
  connectionId: z.string().uuid(),
  accountId: z.string().trim().min(1).max(200),
  accountKind: z.enum(["ad_account", "page", "business"])
});

export async function selectProviderAccountAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = selectProviderAccountSchema.safeParse({
    connectionId: formData.get("connectionId"),
    accountId: formData.get("accountId"),
    accountKind: formData.get("accountKind")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const current = await queryPostgres<{ provider: string; metadata_json: { availableAccounts?: Array<{ id?: string; kind?: string }> } | null }>(
    `select provider,metadata_json from public.integration_connections where tenant_id=$1 and id=$2 limit 1`,
    [workspaceId, parsed.data.connectionId]
  );
  const connection = current?.rows[0];
  const candidates = Array.isArray(connection?.metadata_json?.availableAccounts) ? connection.metadata_json.availableAccounts : [];
  if (!connection || !candidates.some((candidate) => candidate.id === parsed.data.accountId && candidate.kind === parsed.data.accountKind)) return;

  const key = parsed.data.accountKind === "page" ? "selectedPageId"
    : parsed.data.accountKind === "business" ? "selectedBusinessId"
      : "selectedAdAccountId";
  const selection = JSON.stringify({
    [key]: parsed.data.accountId,
    ...(parsed.data.accountKind === "ad_account" ? { selectedAccountId: parsed.data.accountId, accountSelectionRequired: false } : {}),
    accountSelectedAt: new Date().toISOString()
  });
  await Promise.all([
    queryPostgres(
      `update public.integration_connections set metadata_json=metadata_json||$3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [workspaceId, parsed.data.connectionId, selection]
    ),
    queryPostgres(
      `update public.provider_accounts set metadata_json=metadata_json||$3::jsonb,updated_at=now() where tenant_id=$1 and provider_key=$2`,
      [workspaceId, connection.provider, selection]
    ),
    queryPostgres(
      `update public.provider_connection_lanes set metadata_json=metadata_json||$3::jsonb,updated_at=now() where tenant_id=$1 and provider_key=$2`,
      [workspaceId, connection.provider, selection]
    )
  ]);
  revalidatePath("/app/integrations");
}

export async function disconnectCustomerIntegrationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = disconnectIntegrationSchema.safeParse({ connectionId: formData.get("connectionId") });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const current = await queryPostgres<{
    provider: string;
    ownership_mode: string | null;
  }>(
    `select c.provider,a.ownership_mode
       from public.integration_connections c
       left join public.provider_accounts a on a.tenant_id=c.tenant_id and a.provider_key=c.provider
      where c.tenant_id=$1 and c.id=$2
      limit 1`,
    [workspaceId, parsed.data.connectionId]
  );
  const connection = current?.rows[0];
  if (!connection || connection.ownership_mode === "ferocity_managed" || connection.provider.endsWith("_shared")) return;

  const disconnectedAt = new Date().toISOString();
  const audit = JSON.stringify({
    disconnectedAt,
    disconnectedBy: session?.userId ?? "workspace_admin",
    remoteGrantMayRequireProviderRevocation: true
  });

  // Revoke Ferocity's local ability to use the account first. Provider-side
  // authorization screens remain the authoritative place to revoke the remote
  // grant itself when that provider does not expose a safe revocation API.
  const revoked = await withPostgresTransactionResult(async (client) => {
    await client.query(
      `update public.tenant_provider_credentials
        set status='revoked',encrypted_secret=null,encryption_iv=null,encryption_tag=null,
            secret_preview=null,metadata_json=metadata_json||$3::jsonb,updated_by_user_id=$4,updated_at=now()
      where tenant_id=$1 and provider_key=$2 and status<>'archived'`,
      [workspaceId, connection.provider, audit, session?.userId ?? null]
    );
    await client.query(
      `update public.integration_connections
        set status='not_connected',credentials_status='not_configured',scopes_json='[]'::jsonb,
            metadata_json=(metadata_json-'liveActionsEnabled')||$3::jsonb,last_checked_at=now(),updated_at=now()
      where tenant_id=$1 and id=$2`,
      [workspaceId, parsed.data.connectionId, audit]
    );
    await client.query(
      `update public.provider_accounts
        set status='paused',credentials_status='revoked',live_actions_enabled=false,
            metadata_json=metadata_json||$3::jsonb,updated_at=now()
      where tenant_id=$1 and provider_key=$2 and ownership_mode='workspace'`,
      [workspaceId, connection.provider, audit]
    );
    await client.query(
      `update public.provider_connection_lanes
        set connection_status='not_connected',credentials_status='revoked',live_actions_enabled=false,
            plain_language_status=display_name||' was disconnected by the workspace. Ferocity cannot use its credentials.',
            metadata_json=metadata_json||$3::jsonb,updated_at=now()
      where tenant_id=$1 and provider_key=$2 and lane_key='customer_owned'`,
      [workspaceId, connection.provider, audit]
    );
    await client.query(
      `update public.provider_routing_rules
        set status=case when default_provider_key=$2 then 'paused' else status end,
            fallback_provider_key=case when fallback_provider_key=$2 then null else fallback_provider_key end,
            metadata_json=metadata_json||$3::jsonb,updated_at=now()
      where tenant_id=$1 and (default_provider_key=$2 or fallback_provider_key=$2)`,
      [workspaceId, connection.provider, audit]
    );
    await client.query(
      `update public.outbound_action_queue
        set status='blocked',last_error='The selected provider was disconnected by the workspace.',updated_at=now()
      where tenant_id=$1 and provider_key=$2 and status in ('approved','queued')`,
      [workspaceId, connection.provider]
    );
    await client.query(
      `update public.integration_authority_grants
          set decision='revoked',revoked_at=now(),updated_at=now(),
              explanation='The workspace disconnected this provider. Ferocity no longer has local authority to use it.'
        where tenant_id=$1 and provider_key=$2 and decision<>'revoked'`,
      [workspaceId, connection.provider]
    );
    if (connection.provider === "gmail_mailbox" || connection.provider === "microsoft_mailbox") {
      await client.query(
        `update public.mailbox_connections
          set status='disconnected',read_enabled=false,send_enabled=false,sync_cursor=null,
              metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and provider_key=$2`,
        [workspaceId, connection.provider, audit]
      );
    }
  });
  if (!revoked.ok) {
    throw new Error("Ferocity could not safely disconnect the account. No partial revocation was retained.");
  }

  await syncCustomerOnboardingForTenant(workspaceId).catch(() => null);

  revalidatePath("/app/integrations");
  revalidatePath("/app/credentials");
  revalidatePath("/app/email-watch");
  revalidatePath("/app/system-health");
}

export async function updateProviderCertificationAction(formData: FormData) {
  await requirePermission("platform:manage");
  const parsed = providerCertificationSchema.safeParse({
    connectionId: formData.get("connectionId"),
    certificationStatus: formData.get("certificationStatus"),
    evidenceNote: formData.get("evidenceNote"),
    liveActionsEnabled: formData.get("liveActionsEnabled") ?? "false"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const current = await queryPostgres<{
    provider: string;
    credentials_status: string;
    metadata_json: { envVars?: string[] } | null;
  }>(
    "select provider, credentials_status, metadata_json from public.integration_connections where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.connectionId]
  );
  const connection = current?.rows[0];
  if (!connection) return;

  const account = await queryPostgres<{ credentials_status: string; status: string }>(
    "select credentials_status, status from public.provider_accounts where tenant_id = $1 and provider_key = $2 limit 1",
    [workspaceId, connection.provider]
  );
  const requiredEnv = connection.metadata_json?.envVars ?? [];
  const envReady = requiredEnv.length > 0 && missingEnvVars(requiredEnv as Parameters<typeof missingEnvVars>[0]).length === 0;
  const accountReady = account?.rows[0]?.credentials_status === "configured" && account.rows[0].status !== "error";
  const credentialsReady = accountReady || envReady || (requiredEnv.length === 0 && connectorCanBeMarkedReady(connection.provider));
  const requestedLive = parsed.data.liveActionsEnabled === "true";
  const liveDecision = canEnableProviderLiveActions({
    certificationStatus: parsed.data.certificationStatus,
    executableAdapter: connectorCanBeMarkedReady(connection.provider),
    credentialsReady
  });
  const liveActionsEnabled = requestedLive && liveDecision.allowed;
  const integrationStatus = integrationStatusForCertification(parsed.data.certificationStatus);
  const laneStatus = laneStatusForCertification(parsed.data.certificationStatus);
  const now = new Date().toISOString();

  await queryPostgres(
    `
    update public.integration_connections
    set status = $3,
        credentials_status = case when $4::boolean then 'configured' else credentials_status end,
        metadata_json = metadata_json || $5::jsonb,
        last_checked_at = now(),
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      integrationStatus,
      credentialsReady,
      JSON.stringify({
        certificationStatus: parsed.data.certificationStatus,
        certificationEvidence: parsed.data.evidenceNote,
        certifiedAt: ["certified_limited", "certified_live"].includes(parsed.data.certificationStatus) ? now : null,
        certifiedBy: session?.userId ?? "platform_admin",
        liveActionsEnabled,
        liveEnablementReason: liveDecision.reason
      })
    ]
  );

  await queryPostgres(
    `
    update public.provider_accounts
    set status = $3,
        live_actions_enabled = $4,
        metadata_json = metadata_json || $5::jsonb,
        last_checked_at = now(),
        updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [
      workspaceId,
      connection.provider,
      providerAccountStatusForCertification(parsed.data.certificationStatus),
      liveActionsEnabled,
      JSON.stringify({
        certificationStatus: parsed.data.certificationStatus,
        certificationEvidence: parsed.data.evidenceNote,
        certifiedAt: ["certified_limited", "certified_live"].includes(parsed.data.certificationStatus) ? now : null
      })
    ]
  );

  await queryPostgres(
    `
    update public.provider_connection_lanes
    set connection_status = $3,
        live_actions_enabled = $4,
        source = 'provider_account',
        plain_language_status = $5,
        metadata_json = metadata_json || $6::jsonb,
        updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [
      workspaceId,
      connection.provider,
      laneStatus,
      liveActionsEnabled,
      `${connection.provider.replaceAll("_", " ")} certification: ${parsed.data.certificationStatus.replaceAll("_", " ")}. ${parsed.data.evidenceNote}`,
      JSON.stringify({ certificationStatus: parsed.data.certificationStatus, certifiedAt: now })
    ]
  );

  revalidatePath("/app/integrations");
  revalidatePath("/app/credentials");
  revalidatePath("/app/system-health");
}

export async function requestProviderIntegrationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerRequestSchema.safeParse({
    providerName: formData.get("providerName"),
    providerUrl: formData.get("providerUrl") ?? "",
    capabilityCategory: formData.get("capabilityCategory"),
    useCase: formData.get("useCase"),
    currentlyUsing: formData.get("currentlyUsing") ?? "false"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const requestResult = await queryPostgres<{
    id: string;
    provider_name: string;
    provider_url: string | null;
    capability_category: string;
  }>(
    `
    insert into public.provider_integration_requests (
      tenant_id, requested_by_user_id, provider_name, provider_url,
      capability_category, use_case, currently_using, metadata_json
    )
    values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8::jsonb)
    on conflict (tenant_id, provider_name, capability_category) do update
    set provider_url = coalesce(excluded.provider_url, public.provider_integration_requests.provider_url),
        use_case = excluded.use_case,
        currently_using = public.provider_integration_requests.currently_using or excluded.currently_using,
        request_count = public.provider_integration_requests.request_count + 1,
        status = case when public.provider_integration_requests.status = 'declined' then 'requested' else public.provider_integration_requests.status end,
        metadata_json = public.provider_integration_requests.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id, provider_name, provider_url, capability_category
    `,
    [
      tenantId,
      session?.userId ?? null,
      parsed.data.providerName,
      parsed.data.providerUrl,
      parsed.data.capabilityCategory,
      parsed.data.useCase,
      parsed.data.currentlyUsing === "true",
      JSON.stringify({ source: "integrations_provider_request" })
    ]
  );
  const request = requestResult?.rows[0];
  if (request) {
    await queueAdapterFactoryBuild({
      tenantId,
      requestId: request.id,
      providerName: request.provider_name,
      capabilityCategory: request.capability_category,
      documentationUrl: request.provider_url
    });
    await raisePlatformAdminAlert({
      fingerprint: `provider-request:${request.id}`,
      family: "customer_request",
      type: "provider_integration_requested",
      severity: parsed.data.currentlyUsing === "true" ? "high" : "warning",
      title: `Provider requested: ${request.provider_name}`,
      body: [
        `A customer asked Ferocity to enable ${request.provider_name}.`,
        `Category: ${request.capability_category.replaceAll("_", " ")}`,
        `Already using this provider: ${parsed.data.currentlyUsing === "true" ? "Yes" : "No"}`,
        `Requested use: ${parsed.data.useCase}`,
        request.provider_url ? `Official specification supplied: ${request.provider_url}` : "No official OpenAPI specification was supplied.",
        `Workspace: ${tenantId}`,
        "Review the request and guarded adapter status in Ferocity."
      ].join("\n"),
      tenantId,
      actionUrl: "/app/integrations#request-provider",
      metadata: {
        requestId: request.id,
        providerName: request.provider_name,
        category: request.capability_category,
        currentlyUsing: parsed.data.currentlyUsing === "true"
      }
    });
  }
  revalidatePath("/app/integrations");
}

export async function reviewAdapterBuildAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = adapterReviewSchema.safeParse({
    buildId: formData.get("buildId"),
    decision: formData.get("decision"),
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  await reviewAdapterBuild({
    tenantId,
    buildId: parsed.data.buildId,
    userId: session?.userId ?? null,
    decision: parsed.data.decision,
    notes: parsed.data.notes
  });
  revalidatePath("/app/integrations");
}

export async function releaseAdapterBuildAction(formData: FormData) {
  await requirePermission("platform:manage");
  const parsed = adapterReleaseSchema.safeParse({
    buildId: formData.get("buildId"),
    releaseVersion: formData.get("releaseVersion"),
    deploymentCommitSha: formData.get("deploymentCommitSha")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await markAdapterBuildReleased({
    tenantId,
    buildId: parsed.data.buildId,
    releaseVersion: parsed.data.releaseVersion,
    deploymentCommitSha: parsed.data.deploymentCommitSha
  });
  revalidatePath("/app/integrations");
}

export async function updateIntegrationReadinessAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = integrationToggleSchema.safeParse({
    connectionId: formData.get("connectionId"),
    status: formData.get("status"),
    liveActionsEnabled: formData.get("liveActionsEnabled") ?? "false"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const currentConnection = await queryPostgres<{ provider: string }>(
    "select provider from public.integration_connections where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.connectionId]
  );
  if (
    parsed.data.status === "connected"
    && (!currentConnection?.rows[0] || !connectorCanBeMarkedReady(currentConnection.rows[0].provider))
  ) {
    revalidatePath("/app/integrations");
    return;
  }
  const updated = await queryPostgres<{ provider: string; display_name: string }>(
    `
    update public.integration_connections
    set status = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning provider, display_name
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      parsed.data.status,
      JSON.stringify({
        liveActionsEnabled: parsed.data.liveActionsEnabled === "true",
        manuallyReviewedAt: new Date().toISOString()
      })
    ]
  );
  const connection = updated?.rows[0];

  if (connection) {
    await queryPostgres(
      `
      update public.provider_connection_lanes
      set connection_status = case
            when $3 = 'connected' then 'connected'
            when $3 = 'paused' then 'paused'
            else 'not_connected'
          end,
          credentials_status = case when $3 = 'connected' then 'configured' else credentials_status end,
          live_actions_enabled = false,
          source = 'manual',
          plain_language_status = case
            when $3 = 'connected' then display_name || ' is marked connected in Ferocity. Live actions still require approval controls.'
            when $3 = 'paused' then display_name || ' is paused. Ferocity will keep drafts and queues available.'
            else display_name || ' is planned and waiting for credentials.'
          end,
          updated_at = now()
      where tenant_id = $1 and provider_key = $2
      `,
      [workspaceId, connection.provider, parsed.data.status]
    );
  }

  revalidatePath("/app/integrations");
  revalidatePath("/app/credentials");
  revalidatePath("/app/ai-workforce/results/latest");
}
