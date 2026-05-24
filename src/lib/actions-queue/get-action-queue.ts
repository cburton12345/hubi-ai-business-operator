import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ActionQueueMetric = {
  label: string;
  value: number;
  detail: string;
};

export type OutboundActionRow = {
  id: string;
  actionType: string;
  providerKey: string;
  status: string;
  riskLevel: string;
  subject: string;
  recipientLabel: string | null;
  scheduledFor: string | null;
  targetType: string | null;
  createdAt: string;
};

export type ProviderAccountRow = {
  providerKey: string;
  displayName: string;
  status: string;
  credentialsStatus: string;
  liveActionsEnabled: boolean;
};

export type LivePolicyRow = {
  id: string;
  actionKey: string;
  providerKey: string;
  label: string;
  status: string;
  minimumPlanKey: string;
  requiresConsent: boolean;
  requiresHumanApproval: boolean;
  riskLevel: string;
  rule: string;
};

export type ConsentRow = {
  id: string;
  channel: string;
  contactValue: string;
  status: string;
  source: string | null;
  recordedAt: string;
};

export type ActionQueueDashboard = {
  metrics: ActionQueueMetric[];
  actions: OutboundActionRow[];
  providers: ProviderAccountRow[];
  policies: LivePolicyRow[];
  consents: ConsentRow[];
};

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getActionQueueDashboard(): Promise<ActionQueueDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricsResult, actionResult, providerResult, policyResult, consentResult] = await Promise.all([
    queryPostgres<{
      needs_review: string;
      approved: string;
      blocked: string;
      live_providers: string;
      consent_granted: string;
      missing_consent: string;
    }>(
      `
      select
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status = 'needs_review') as needs_review,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status = 'approved') as approved,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status = 'blocked') as blocked,
        (select count(*) from public.provider_accounts where tenant_id = $1 and live_actions_enabled = true) as live_providers,
        (select count(*) from public.contact_consent_records where tenant_id = $1 and status = 'granted') as consent_granted,
        (
          select count(*)
          from public.outbound_action_queue q
          left join public.contact_consent_records c on c.tenant_id = q.tenant_id
            and c.contact_value = q.recipient_label
            and c.status = 'granted'
          where q.tenant_id = $1 and q.action_type in ('sms_send', 'email_send', 'review_request') and c.id is null
        ) as missing_consent
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      action_type: string;
      provider_key: string;
      status: string;
      risk_level: string;
      subject: string | null;
      recipient_label: string | null;
      scheduled_for: string | null;
      target_type: string | null;
      created_at: string;
    }>(
      `
      select id, action_type, provider_key, status, risk_level, subject, recipient_label, scheduled_for, target_type, created_at
      from public.outbound_action_queue
      where tenant_id = $1
      order by
        case status when 'needs_review' then 1 when 'approved' then 2 when 'queued' then 3 when 'failed' then 4 else 5 end,
        coalesce(scheduled_for, created_at) asc
      limit 80
      `,
      [workspaceId]
    ),
    queryPostgres<{
      provider_key: string;
      display_name: string;
      status: string;
      credentials_status: string;
      live_actions_enabled: boolean;
    }>(
      `
      select provider_key, display_name, status, credentials_status, live_actions_enabled
      from public.provider_accounts
      where tenant_id = $1
      order by display_name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      action_key: string;
      provider_key: string;
      label: string;
      status: string;
      minimum_plan_key: string;
      requires_consent: boolean;
      requires_human_approval: boolean;
      risk_level: string;
      metadata_json: { plainRule?: string } | null;
    }>(
      `
      select id, action_key, provider_key, label, status, minimum_plan_key,
        requires_consent, requires_human_approval, risk_level, metadata_json
      from public.live_action_policies
      where tenant_id = $1
      order by provider_key, action_key
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      channel: string;
      contact_value: string;
      status: string;
      source: string | null;
      recorded_at: string;
    }>(
      `
      select id, channel, contact_value, status, source, recorded_at
      from public.contact_consent_records
      where tenant_id = $1
      order by recorded_at desc
      limit 30
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricsResult?.rows[0];

  return {
    metrics: [
      { label: "Needs review", value: num(metrics?.needs_review), detail: "Before any live action" },
      { label: "Approved", value: num(metrics?.approved), detail: "Ready for manual/provider queue" },
      { label: "Blocked", value: num(metrics?.blocked), detail: "Stopped by policy" },
      { label: "Live providers", value: num(metrics?.live_providers), detail: "Should stay low until ready" },
      { label: "Consent granted", value: num(metrics?.consent_granted), detail: "SMS/email/phone records" },
      { label: "Missing consent", value: num(metrics?.missing_consent), detail: "Needs review first" }
    ],
    actions: (actionResult?.rows ?? []).map((row) => ({
      id: row.id,
      actionType: row.action_type,
      providerKey: row.provider_key,
      status: row.status,
      riskLevel: row.risk_level,
      subject: row.subject ?? "Untitled action",
      recipientLabel: row.recipient_label,
      scheduledFor: row.scheduled_for,
      targetType: row.target_type,
      createdAt: row.created_at
    })),
    providers: (providerResult?.rows ?? []).map((row) => ({
      providerKey: row.provider_key,
      displayName: row.display_name,
      status: row.status,
      credentialsStatus: row.credentials_status,
      liveActionsEnabled: row.live_actions_enabled
    })),
    policies: (policyResult?.rows ?? []).map((row) => ({
      id: row.id,
      actionKey: row.action_key,
      providerKey: row.provider_key,
      label: row.label,
      status: row.status,
      minimumPlanKey: row.minimum_plan_key,
      requiresConsent: row.requires_consent,
      requiresHumanApproval: row.requires_human_approval,
      riskLevel: row.risk_level,
      rule: row.metadata_json?.plainRule ?? "Approval required before live action."
    })),
    consents: (consentResult?.rows ?? []).map((row) => ({
      id: row.id,
      channel: row.channel,
      contactValue: row.contact_value,
      status: row.status,
      source: row.source,
      recordedAt: row.recorded_at
    }))
  };
}
