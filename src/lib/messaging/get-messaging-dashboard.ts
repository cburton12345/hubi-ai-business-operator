import { queryPostgres } from "@/lib/db/postgres";
import { getMessagingProviderStatus } from "@/lib/messaging/messaging-engine";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MessagingDashboard = {
  webhookUrl: string;
  providers: Array<{
    providerKey: string;
    displayName: string;
    status: string;
    family: string;
    capabilities: string[];
    runtimeStatus: string;
    missing: string[];
  }>;
  accounts: Array<{
    id: string;
    providerKey: string;
    ownershipMode: string;
    accountLabel: string;
    connectionStatus: string;
    credentialsStatus: string;
    liveSendingEnabled: boolean;
    outboundEnabled: boolean;
    emergencyPaused: boolean;
    hourlySendCap: number | null;
    dailySendCap: number | null;
    perRecipientHourlyCap: number | null;
  }>;
  registrations: Array<{
    id: string;
    providerKey: string;
    registrationType: string;
    status: string;
    legalBusinessName: string | null;
    websiteUrl: string | null;
  }>;
  metrics: {
    messagesThisMonth: number;
    failuresThisMonth: number;
    optOuts: number;
    manualTextsReady: number;
    unreadConversations: number;
    overdueResponses: number;
  };
  conversations: Array<{
    id: string;
    subject: string;
    channel: string;
    status: string;
    contactName: string;
    unreadCount: number;
    responseDue: string;
    lastMessage: string;
    lastMessageAt: string;
  }>;
  failures: Array<{
    id: string;
    providerKey: string;
    routeName: string;
    safeErrorCategory: string;
    safeErrorMessage: string;
    retryable: boolean;
    createdAt: string;
  }>;
};

function envAppUrl() {
  return process.env.FEROCITY_APP_URL || "https://ferocity.live";
}

function capabilities(row: {
  supports_sms: boolean;
  supports_mms: boolean;
  supports_email: boolean;
  supports_voice: boolean;
  supports_manual_send: boolean;
  supports_inbound_webhook: boolean;
  supports_delivery_webhook: boolean;
}) {
  return [
    row.supports_sms ? "SMS" : null,
    row.supports_mms ? "MMS" : null,
    row.supports_email ? "Email" : null,
    row.supports_voice ? "Voice" : null,
    row.supports_manual_send ? "Manual send" : null,
    row.supports_inbound_webhook ? "Inbound webhooks" : null,
    row.supports_delivery_webhook ? "Delivery webhooks" : null
  ].filter(Boolean) as string[];
}

export async function getMessagingDashboard(): Promise<MessagingDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [providerResult, accountResult, registrationResult, metricResult, failureResult, conversationResult] = await Promise.all([
    queryPostgres<{
      id: string;
      provider_key: string;
      display_name: string;
      status: string;
      provider_family: string;
      supports_sms: boolean;
      supports_mms: boolean;
      supports_email: boolean;
      supports_voice: boolean;
      supports_manual_send: boolean;
      supports_inbound_webhook: boolean;
      supports_delivery_webhook: boolean;
    }>(
      `
      select provider_key, display_name, status, provider_family, supports_sms, supports_mms,
             supports_email, supports_voice, supports_manual_send, supports_inbound_webhook, supports_delivery_webhook
      from public.messaging_providers
      where tenant_id = $1
      order by
        case provider_key
          when 'manual_sms' then 1
          when 'resend_email' then 2
          when 'twilio_sms' then 3
          when 'twilio_voice' then 4
          else 20
        end,
        display_name
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      ownership_mode: string;
      account_label: string;
      connection_status: string;
      credentials_status: string;
      live_sending_enabled: boolean;
      outbound_enabled: boolean;
      emergency_paused: boolean;
      hourly_send_cap: number | null;
      daily_send_cap: number | null;
      per_recipient_hourly_cap: number | null;
    }>(
      `
      select id, provider_key, ownership_mode, account_label, connection_status, credentials_status,
             live_sending_enabled, outbound_enabled, emergency_paused,
             hourly_send_cap, daily_send_cap, per_recipient_hourly_cap
      from public.tenant_messaging_accounts
      where tenant_id = $1
      order by provider_key, ownership_mode
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      registration_type: string;
      status: string;
      legal_business_name: string | null;
      website_url: string | null;
    }>(
      `
      select id, provider_key, registration_type, status, legal_business_name, website_url
      from public.messaging_registrations
      where tenant_id = $1
      order by updated_at desc
      limit 10
      `,
      [tenantId]
    ),
    queryPostgres<{
      messages_this_month: string;
      failures_this_month: string;
      opt_outs: string;
      manual_texts_ready: string;
      unread_conversations: string;
      overdue_responses: string;
    }>(
      `
      select
        (select count(*) from public.messages where tenant_id = $1 and created_at >= date_trunc('month', now()))::text as messages_this_month,
        (select count(*) from public.messaging_provider_failures where tenant_id = $1 and created_at >= date_trunc('month', now()))::text as failures_this_month,
        (select count(*) from public.messaging_opt_outs where tenant_id = $1 and active = true)::text as opt_outs,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and action_type = 'sms_send' and provider_key = 'manual_sms' and status in ('needs_review','approved','queued'))::text as manual_texts_ready,
        (select count(*) from public.messaging_conversations where tenant_id = $1 and unread_count > 0 and status not in ('closed', 'archived'))::text as unread_conversations,
        (select count(*) from public.messaging_conversations where tenant_id = $1 and status = 'waiting_on_team' and first_response_due_at < now())::text as overdue_responses
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      route_name: string;
      safe_error_category: string;
      safe_error_message: string;
      retryable: boolean;
      created_at: Date;
    }>(
      `
      select id, provider_key, route_name, safe_error_category, safe_error_message, retryable, created_at
      from public.messaging_provider_failures
      where tenant_id = $1
      order by created_at desc
      limit 10
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      subject: string;
      channel: string;
      status: string;
      contact_name: string | null;
      unread_count: number;
      first_response_due_at: Date | null;
      last_message: string | null;
      last_message_at: Date | null;
    }>(
      `
      select c.id, c.subject, c.channel, c.status,
        coalesce(cu.name, l.name, p.display_name, p.contact_value) as contact_name,
        c.unread_count, c.first_response_due_at, c.last_message_at,
        (select m.body from public.messages m
          where m.tenant_id = c.tenant_id and m.conversation_id = c.id
          order by m.created_at desc limit 1) as last_message
      from public.messaging_conversations c
      left join public.customers cu on cu.id = c.customer_id and cu.tenant_id = c.tenant_id
      left join public.leads l on l.id = c.lead_id and l.tenant_id = c.tenant_id
      left join lateral (
        select display_name, contact_value
        from public.conversation_participants cp
        where cp.tenant_id = c.tenant_id and cp.conversation_id = c.id
          and cp.participant_type in ('customer', 'lead')
        order by cp.created_at limit 1
      ) p on true
      where c.tenant_id = $1 and c.status not in ('closed', 'archived')
      order by (c.status = 'waiting_on_team') desc, c.unread_count desc, c.last_message_at desc nulls last
      limit 50
      `,
      [tenantId]
    )
  ]);

  const metricRow = metricResult?.rows[0];

  return {
    webhookUrl: `${envAppUrl().replace(/\/$/, "")}/api/messaging/webhooks/{provider}`,
    providers: (providerResult?.rows ?? []).map((row) => {
      const runtime = getMessagingProviderStatus(row.provider_key);
      return {
        providerKey: row.provider_key,
        displayName: row.display_name,
        status: row.status,
        family: row.provider_family,
        capabilities: capabilities(row),
        runtimeStatus: runtime.status,
        missing: runtime.missing
      };
    }),
    accounts: (accountResult?.rows ?? []).map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      ownershipMode: row.ownership_mode,
      accountLabel: row.account_label,
      connectionStatus: row.connection_status,
      credentialsStatus: row.credentials_status,
      liveSendingEnabled: row.live_sending_enabled,
      outboundEnabled: row.outbound_enabled,
      emergencyPaused: row.emergency_paused,
      hourlySendCap: row.hourly_send_cap,
      dailySendCap: row.daily_send_cap,
      perRecipientHourlyCap: row.per_recipient_hourly_cap
    })),
    registrations: (registrationResult?.rows ?? []).map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      registrationType: row.registration_type,
      status: row.status,
      legalBusinessName: row.legal_business_name,
      websiteUrl: row.website_url
    })),
    metrics: {
      messagesThisMonth: Number(metricRow?.messages_this_month ?? 0),
      failuresThisMonth: Number(metricRow?.failures_this_month ?? 0),
      optOuts: Number(metricRow?.opt_outs ?? 0),
      manualTextsReady: Number(metricRow?.manual_texts_ready ?? 0),
      unreadConversations: Number(metricRow?.unread_conversations ?? 0),
      overdueResponses: Number(metricRow?.overdue_responses ?? 0)
    },
    conversations: (conversationResult?.rows ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      channel: row.channel,
      status: row.status,
      contactName: row.contact_name ?? "Unknown contact",
      unreadCount: row.unread_count,
      responseDue: row.first_response_due_at
        ? new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(row.first_response_due_at)
        : "No SLA",
      lastMessage: row.last_message ?? "No message body",
      lastMessageAt: row.last_message_at
        ? new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(row.last_message_at)
        : "No activity"
    })),
    failures: (failureResult?.rows ?? []).map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      routeName: row.route_name,
      safeErrorCategory: row.safe_error_category,
      safeErrorMessage: row.safe_error_message,
      retryable: row.retryable,
      createdAt: row.created_at?.toISOString() ?? ""
    }))
  };
}
