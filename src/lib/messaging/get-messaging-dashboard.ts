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
    deliveryProblems: number;
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
    messages: Array<{
      id: string;
      direction: string;
      channel: string;
      providerKey: string;
      body: string;
      createdAt: string;
      deliveryStatus: string;
      rawStatus: string | null;
      errorCode: string | null;
      safeReason: string | null;
      deliveryUpdatedAt: string | null;
      retryAttempt: number;
      events: Array<{ status: string; rawStatus: string | null; reason: string | null; at: string }>;
    }>;
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
  messageHealth: Array<{
    id: string;
    conversationId: string | null;
    channel: string;
    providerKey: string;
    destination: string;
    body: string;
    deliveryStatus: string;
    rawStatus: string | null;
    errorCode: string | null;
    safeReason: string | null;
    deliveryFinal: boolean;
    deliveryUpdatedAt: string;
    retryOfMessageId: string | null;
    retryAttempt: number;
    manualHref: string | null;
    events: Array<{ status: string; rawStatus: string | null; reason: string | null; at: string }>;
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
  const [providerResult, accountResult, registrationResult, metricResult, failureResult, conversationResult, messageHealthResult] = await Promise.all([
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
      delivery_problems: string;
    }>(
      `
      select
        (select count(*) from public.messages where tenant_id = $1 and created_at >= date_trunc('month', now()))::text as messages_this_month,
        (select count(*) from public.messaging_provider_failures where tenant_id = $1 and created_at >= date_trunc('month', now()))::text as failures_this_month,
        (select count(*) from public.messaging_opt_outs where tenant_id = $1 and active = true)::text as opt_outs,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and action_type = 'sms_send' and provider_key = 'manual_sms' and status in ('needs_review','approved','queued'))::text as manual_texts_ready,
        (select count(*) from public.messaging_conversations where tenant_id = $1 and unread_count > 0 and status not in ('closed', 'archived'))::text as unread_conversations,
        (select count(*) from public.messaging_conversations where tenant_id = $1 and status = 'waiting_on_team' and first_response_due_at < now())::text as overdue_responses,
        (select count(*) from public.messages where tenant_id = $1 and direction = 'outbound'
          and delivery_status in ('failed','rejected','undelivered','suspected_filtered'))::text as delivery_problems
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
      messages_json: Array<{
        id: string;
        direction: string;
        channel: string;
        providerKey: string | null;
        body: string;
        createdAt: string;
        deliveryStatus: string;
        rawStatus: string | null;
        errorCode: string | null;
        safeReason: string | null;
        deliveryUpdatedAt: string | null;
        retryAttempt: number;
        events: Array<{ status: string; rawStatus: string | null; reason: string | null; at: string }>;
      }>;
    }>(
      `
      select c.id, c.subject, c.channel, c.status,
        coalesce(cu.name, l.name, p.display_name, p.contact_value) as contact_name,
        c.unread_count, c.first_response_due_at, c.last_message_at,
        (select m.body from public.messages m
          where m.tenant_id = c.tenant_id and m.conversation_id = c.id
          order by m.created_at desc limit 1) as last_message,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', timeline.id,
            'direction', timeline.direction,
            'channel', timeline.channel,
            'providerKey', timeline.provider_key,
            'body', timeline.body,
            'createdAt', timeline.created_at,
            'deliveryStatus', timeline.delivery_status,
            'rawStatus', timeline.delivery_raw_status,
            'errorCode', timeline.delivery_error_code,
            'safeReason', timeline.delivery_safe_reason,
            'deliveryUpdatedAt', timeline.delivery_updated_at,
            'retryAttempt', timeline.retry_attempt,
            'events', timeline.events
          ) order by timeline.created_at asc)
          from (
            select m.id, m.direction, m.channel, m.provider_key, m.body, m.created_at,
              m.delivery_status, m.delivery_raw_status, m.delivery_error_code,
              m.delivery_safe_reason, m.delivery_updated_at, m.retry_attempt,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'status', de.normalized_status,
                  'rawStatus', de.raw_provider_status,
                  'reason', de.safe_error_message,
                  'at', de.receipt_at
                ) order by de.receipt_at desc)
                from (
                  select normalized_status, raw_provider_status, safe_error_message, receipt_at
                  from public.message_delivery_events
                  where tenant_id = c.tenant_id and message_id = m.id
                  order by receipt_at desc
                  limit 5
                ) de
              ), '[]'::jsonb) as events
            from public.messages m
            where m.tenant_id = c.tenant_id and m.conversation_id = c.id
            order by m.created_at desc
            limit 20
          ) timeline
        ), '[]'::jsonb) as messages_json
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
    ),
    queryPostgres<{
      id: string;
      conversation_id: string | null;
      channel: string;
      provider_key: string | null;
      to_value: string | null;
      body: string;
      delivery_status: string;
      delivery_raw_status: string | null;
      delivery_error_code: string | null;
      delivery_safe_reason: string | null;
      delivery_final: boolean;
      delivery_updated_at: Date | null;
      retry_of_message_id: string | null;
      retry_attempt: number;
      manual_href: string | null;
      events_json: Array<{ status: string; rawStatus: string | null; reason: string | null; at: string }>;
    }>(
      `select m.id, m.conversation_id, m.channel, m.provider_key, m.to_value, m.body,
         m.delivery_status, m.delivery_raw_status, m.delivery_error_code,
         m.delivery_safe_reason, m.delivery_final, m.delivery_updated_at,
         m.retry_of_message_id, m.retry_attempt, m.metadata_json->>'manualHref' as manual_href,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'status', e.normalized_status,
             'rawStatus', e.raw_provider_status,
             'reason', e.safe_error_message,
             'at', e.receipt_at
           ) order by e.receipt_at desc)
           from (select * from public.message_delivery_events de
             where de.tenant_id=m.tenant_id and de.message_id=m.id
             order by de.receipt_at desc limit 5) e
         ), '[]'::jsonb) as events_json
       from public.messages m
       where m.tenant_id=$1 and m.direction='outbound'
       order by coalesce(m.delivery_updated_at, m.created_at) desc
       limit 50`,
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
      overdueResponses: Number(metricRow?.overdue_responses ?? 0),
      deliveryProblems: Number(metricRow?.delivery_problems ?? 0)
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
        : "No activity",
      messages: (Array.isArray(row.messages_json) ? row.messages_json : []).map((message) => ({
        id: message.id,
        direction: message.direction,
        channel: message.channel,
        providerKey: message.providerKey ?? "unknown",
        body: message.body,
        createdAt: new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt)),
        deliveryStatus: message.deliveryStatus,
        rawStatus: message.rawStatus,
        errorCode: message.errorCode,
        safeReason: message.safeReason,
        deliveryUpdatedAt: message.deliveryUpdatedAt
          ? new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.deliveryUpdatedAt))
          : null,
        retryAttempt: message.retryAttempt,
        events: Array.isArray(message.events) ? message.events : []
      }))
    })),
    failures: (failureResult?.rows ?? []).map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      routeName: row.route_name,
      safeErrorCategory: row.safe_error_category,
      safeErrorMessage: row.safe_error_message,
      retryable: row.retryable,
      createdAt: row.created_at?.toISOString() ?? ""
    })),
    messageHealth: (messageHealthResult?.rows ?? []).map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      channel: row.channel,
      providerKey: row.provider_key ?? "unknown",
      destination: row.to_value ?? "Unknown destination",
      body: row.body,
      deliveryStatus: row.delivery_status,
      rawStatus: row.delivery_raw_status,
      errorCode: row.delivery_error_code,
      safeReason: row.delivery_safe_reason,
      deliveryFinal: row.delivery_final,
      deliveryUpdatedAt: row.delivery_updated_at
        ? new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(row.delivery_updated_at)
        : "Awaiting provider update",
      retryOfMessageId: row.retry_of_message_id,
      retryAttempt: row.retry_attempt,
      manualHref: row.manual_href,
      events: Array.isArray(row.events_json) ? row.events_json : []
    }))
  };
}
