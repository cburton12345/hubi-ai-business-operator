import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentAppSession } from "@/lib/auth/session";
import type { CommunicationMethod } from "@/lib/preferences/communication-preferences";
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
  lastError: string | null;
  bodyPreview: string | null;
  createdAt: string;
  resolvedMethod: CommunicationMethod;
  resolvedScope: string;
  workflowKey: string;
  phone: string | null;
  email: string | null;
};

export type ProviderAccountRow = {
  providerKey: string;
  displayName: string;
  status: string;
  credentialsStatus: string;
  liveActionsEnabled: boolean;
  ownershipMode: string;
  senderIdentity: string | null;
  monthlyIncludedUnits: number | null;
  monthlyUsedUnits: number;
  overagePolicy: string;
};

export type ProviderRoutingRuleRow = {
  id: string;
  actionType: string;
  defaultProviderKey: string;
  ownershipMode: string;
  fallbackProviderKey: string | null;
  status: string;
  rule: string;
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
  routingRules: ProviderRoutingRuleRow[];
  policies: LivePolicyRow[];
  consents: ConsentRow[];
};

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getActionQueueDashboard(): Promise<ActionQueueDashboard> {
  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const [metricsResult, actionResult, providerResult, routingResult, policyResult, consentResult] = await Promise.all([
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
      last_error: string | null;
      body_preview: string | null;
      created_at: string;
      resolved_method: CommunicationMethod | null;
      resolved_scope: string | null;
      workflow_key: string;
      phone: string | null;
      email: string | null;
    }>(
      `
      select
        q.id,
        q.action_type,
        q.provider_key,
        q.status,
        q.risk_level,
        q.subject,
        q.recipient_label,
        q.scheduled_for,
        q.target_type,
        q.last_error,
        left(coalesce(q.payload_json->>'body', ''), 220) as body_preview,
        q.created_at,
        pref.value_json->>'method' as resolved_method,
        pref.scope_type as resolved_scope,
        coalesce(
          nullif(q.metadata_json->>'workflowKey', ''),
          nullif(q.metadata_json->>'queueType', ''),
          q.action_type
        ) as workflow_key,
        coalesce(
          l.phone,
          invoice_customer.phone,
          case when coalesce(q.recipient_label, '') not like '%@%' then q.recipient_label end
        ) as phone,
        coalesce(
          l.email,
          invoice_customer.email,
          case when coalesce(q.recipient_label, '') like '%@%' then q.recipient_label end
        ) as email
      from public.outbound_action_queue q
      left join public.leads l
        on l.tenant_id = q.tenant_id
        and l.id = q.target_id
        and q.target_type = 'lead'
      left join public.service_invoices invoice
        on invoice.tenant_id = q.tenant_id
        and invoice.id = q.target_id
        and q.target_type = 'service_invoice'
      left join public.customers invoice_customer
        on invoice_customer.tenant_id = invoice.tenant_id
        and invoice_customer.id = invoice.customer_id
      left join lateral (
        select
          case when p.preference_key = 'contact_profile'
            then jsonb_build_object('method', p.value_json->>'preferredMethod')
            else p.value_json
          end as value_json,
          p.scope_type
        from public.scoped_saved_preferences p
        where p.tenant_id = q.tenant_id
          and p.preference_domain = 'communication'
          and p.preference_key in ('delivery_method', 'contact_profile')
          and p.status = 'active'
          and (
            (
              p.scope_type = 'contact'
              and p.scope_key in (
                lower(coalesce(q.recipient_label, '')),
                case
                  when q.target_type = 'lead' and l.id is not null then 'lead:' || l.id::text
                  when invoice_customer.id is not null then 'customer:' || invoice_customer.id::text
                  else lower(coalesce(q.recipient_label, ''))
                end
              )
            )
            or (
              p.scope_type = 'workflow'
              and p.scope_key = lower(coalesce(
                nullif(q.metadata_json->>'workflowKey', ''),
                nullif(q.metadata_json->>'queueType', ''),
                q.action_type
              ))
            )
            or (p.scope_type = 'user' and p.scope_key = lower(coalesce($2::text, '')))
            or (p.scope_type = 'organization' and p.scope_key = 'default')
          )
        order by case p.scope_type
          when 'contact' then 400
          when 'workflow' then 300
          when 'user' then 200
          when 'organization' then 100
          else 0
        end desc,
        case p.preference_key when 'delivery_method' then 2 else 1 end desc,
        p.updated_at desc
        limit 1
      ) pref on true
      where q.tenant_id = $1
        and q.status in ('draft', 'needs_review', 'approved', 'queued', 'failed', 'blocked')
      order by
        case q.status when 'needs_review' then 1 when 'approved' then 2 when 'queued' then 3 when 'failed' then 4 else 5 end,
        coalesce(q.scheduled_for, q.created_at) asc
      limit 80
      `,
      [workspaceId, session?.userId ?? ""]
    ),
    queryPostgres<{
      provider_key: string;
      display_name: string;
      status: string;
      credentials_status: string;
      live_actions_enabled: boolean;
      ownership_mode: string;
      sender_identity: string | null;
      monthly_included_units: number | null;
      monthly_used_units: number;
      overage_policy: string;
    }>(
      `
      select provider_key, display_name, status, credentials_status, live_actions_enabled,
        ownership_mode, sender_identity, monthly_included_units, monthly_used_units, overage_policy
      from public.provider_accounts
      where tenant_id = $1
      order by ownership_mode, display_name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      action_type: string;
      default_provider_key: string;
      ownership_mode: string;
      fallback_provider_key: string | null;
      status: string;
      plain_language_rule: string;
    }>(
      `
      select id, action_type, default_provider_key, ownership_mode, fallback_provider_key, status, plain_language_rule
      from public.provider_routing_rules
      where tenant_id = $1
      order by action_type
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
      { label: "Needs review", value: num(metrics?.needs_review), detail: "Owner chose approval" },
      { label: "Approved", value: num(metrics?.approved), detail: "Ready to run" },
      { label: "Blocked", value: num(metrics?.blocked), detail: "Stopped by a safety rule" },
      { label: "Connected services", value: num(metrics?.live_providers), detail: "Allowed to act live" },
      { label: "Consent granted", value: num(metrics?.consent_granted), detail: "customer contact records" },
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
      lastError: row.last_error,
      bodyPreview: row.body_preview,
      createdAt: row.created_at,
      resolvedMethod: row.resolved_method
        ?? (row.action_type === "email_send"
          ? "email"
          : row.action_type === "voice_call"
            ? "ai_voice_call"
            : row.action_type === "phone_call"
              ? "human_call"
              : row.provider_key === "google_voice_manual"
                ? "google_voice"
                : row.provider_key === "manual_sms"
                  ? "native_sms"
                  : row.action_type === "sms_send"
                    ? "automatic_sms"
                    : "copy_message"),
      resolvedScope: row.resolved_scope ?? "this action",
      workflowKey: row.workflow_key,
      phone: row.phone,
      email: row.email
    })),
    providers: (providerResult?.rows ?? []).map((row) => ({
      providerKey: row.provider_key,
      displayName: row.display_name,
      status: row.status,
      credentialsStatus: row.credentials_status,
      liveActionsEnabled: row.live_actions_enabled,
      ownershipMode: row.ownership_mode,
      senderIdentity: row.sender_identity,
      monthlyIncludedUnits: row.monthly_included_units,
      monthlyUsedUnits: row.monthly_used_units,
      overagePolicy: row.overage_policy
    })),
    routingRules: (routingResult?.rows ?? []).map((row) => ({
      id: row.id,
      actionType: row.action_type,
      defaultProviderKey: row.default_provider_key,
      ownershipMode: row.ownership_mode,
      fallbackProviderKey: row.fallback_provider_key,
      status: row.status,
      rule: row.plain_language_rule
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
