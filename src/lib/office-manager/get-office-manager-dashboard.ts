import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OfficeManagerDashboard = {
  metrics: {
    profiles: number;
    channels: number;
    liveChannels: number;
    openSessions: number;
    pendingActions: number;
    memoryFacts: number;
    callsAnswered: number;
    conversationsHandled: number;
    appointmentsBooked: number;
    ownerMinutesSaved: number;
  };
  profile: {
    id: string;
    displayName: string;
    status: string;
    roleSummary: string;
    defaultTone: string;
    autonomyMode: string;
    interruptionStyle: string;
    greeting: string;
    languages: string[];
    callGoals: string[];
    customInstructions: string[];
    escalationRules: string[];
    industry: string;
  } | null;
  channels: Array<{
    id: string;
    channelKey: string;
    providerKey: string;
    status: string;
    liveActionsEnabled: boolean;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    approvalMode: string;
    setupNotes: string;
  }>;
  actions: Array<{
    id: string;
    title: string;
    summary: string;
    actionType: string;
    status: string;
    priority: string;
    confidenceScore: number;
  }>;
  memory: Array<{
    id: string;
    title: string;
    factText: string;
    factType: string;
    status: string;
    sensitivity: string;
  }>;
  recentSessions: Array<{
    id: string;
    channelKey: string;
    status: string;
    intentKey: string;
    summary: string;
    customerSentiment: string;
    lastMessageAt: string | null;
  }>;
  voiceRoutes: Array<{
    id: string;
    routeFamily: string;
    primaryProviderKey: string;
    fallbackProviderKey: string | null;
    status: string;
    plainLanguageStatus: string;
    liveActionsEnabled: boolean;
  }>;
};

function count(value: unknown) {
  return Number(value ?? 0);
}

function iso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function getOfficeManagerDashboard(): Promise<OfficeManagerDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricResult, profileResult, channelResult, actionResult, memoryResult, sessionResult, voiceRouteResult] = await Promise.all([
    queryPostgres<Record<string, string>>(
      `
      select
        (select count(*) from public.office_manager_profiles where tenant_id = $1 and status <> 'archived')::text as profiles,
        (select count(*) from public.office_manager_channel_configs where tenant_id = $1)::text as channels,
        (select count(*) from public.office_manager_channel_configs where tenant_id = $1 and live_actions_enabled = true)::text as live_channels,
        (select count(*) from public.office_manager_conversation_sessions where tenant_id = $1 and status in ('open','waiting_on_customer','waiting_on_owner'))::text as open_sessions,
        (select count(*) from public.office_manager_action_requests where tenant_id = $1 and status in ('draft','needs_review','queued','blocked'))::text as pending_actions,
        (select count(*) from public.office_manager_memory_facts where tenant_id = $1 and status in ('needs_review','approved','active'))::text as memory_facts,
        coalesce((select sum(calls_answered) from public.office_manager_performance_metrics where tenant_id = $1 and metric_date >= current_date - interval '30 days'), 0)::text as calls_answered,
        coalesce((select sum(conversations_handled) from public.office_manager_performance_metrics where tenant_id = $1 and metric_date >= current_date - interval '30 days'), 0)::text as conversations_handled,
        coalesce((select sum(appointments_booked) from public.office_manager_performance_metrics where tenant_id = $1 and metric_date >= current_date - interval '30 days'), 0)::text as appointments_booked,
        coalesce((select sum(owner_minutes_saved) from public.office_manager_performance_metrics where tenant_id = $1 and metric_date >= current_date - interval '30 days'), 0)::text as owner_minutes_saved
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      display_name: string;
      status: string;
      role_summary: string;
      default_tone: string;
      autonomy_mode: string;
      interruption_style: string;
      escalation_rules_json: unknown;
      metadata_json: unknown;
      industry: string | null;
    }>(
      `
      select p.id, p.display_name, p.status, p.role_summary, p.default_tone, p.autonomy_mode,
             p.interruption_style, p.escalation_rules_json, p.metadata_json, b.industry
      from public.office_manager_profiles p
      left join public.brands b on b.tenant_id = p.tenant_id and b.id = p.brand_id
      where p.tenant_id = $1 and p.status <> 'archived'
      order by p.updated_at desc
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      channel_key: string;
      provider_key: string | null;
      status: string;
      live_actions_enabled: boolean;
      inbound_enabled: boolean;
      outbound_enabled: boolean;
      approval_mode: string;
      setup_notes: string | null;
    }>(
      `
      select id, channel_key, provider_key, status, live_actions_enabled, inbound_enabled, outbound_enabled, approval_mode, setup_notes
      from public.office_manager_channel_configs
      where tenant_id = $1
      order by case channel_key when 'phone' then 0 when 'sms' then 1 when 'email' then 2 when 'website_chat' then 3 when 'owner_command' then 4 else 5 end
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string | null;
      action_type: string;
      status: string;
      priority: string;
      confidence_score: number;
    }>(
      `
      select id, title, summary, action_type, status, priority, confidence_score
      from public.office_manager_action_requests
      where tenant_id = $1
      order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      fact_text: string;
      fact_type: string;
      status: string;
      sensitivity: string;
    }>(
      `
      select id, title, fact_text, fact_type, status, sensitivity
      from public.office_manager_memory_facts
      where tenant_id = $1
      order by updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      channel_key: string;
      status: string;
      intent_key: string | null;
      summary: string | null;
      customer_sentiment: string | null;
      last_message_at: Date | string | null;
    }>(
      `
      select id, channel_key, status, intent_key, summary, customer_sentiment, last_message_at
      from public.office_manager_conversation_sessions
      where tenant_id = $1
      order by coalesce(last_message_at, started_at) desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      route_family: string;
      primary_provider_key: string;
      fallback_provider_key: string | null;
      status: string;
      plain_language_status: string;
      live_actions_enabled: boolean;
    }>(
      `
      select id, route_family, primary_provider_key, fallback_provider_key, status, plain_language_status, live_actions_enabled
      from public.voice_provider_routes
      where tenant_id = $1
      order by case route_family
        when 'telephony' then 0
        when 'sip' then 1
        when 'speech_to_text' then 2
        when 'text_to_speech' then 3
        when 'realtime_llm' then 4
        else 5
      end
      `,
      [workspaceId]
    )
  ]);

  const metric = metricResult?.rows[0] ?? {};
  const profile = profileResult?.rows[0] ?? null;
  const profileMetadata = record(profile?.metadata_json);

  return {
    metrics: {
      profiles: count(metric.profiles),
      channels: count(metric.channels),
      liveChannels: count(metric.live_channels),
      openSessions: count(metric.open_sessions),
      pendingActions: count(metric.pending_actions),
      memoryFacts: count(metric.memory_facts),
      callsAnswered: count(metric.calls_answered),
      conversationsHandled: count(metric.conversations_handled),
      appointmentsBooked: count(metric.appointments_booked),
      ownerMinutesSaved: count(metric.owner_minutes_saved)
    },
    profile: profile
      ? {
          id: profile.id,
          displayName: profile.display_name,
          status: profile.status,
          roleSummary: profile.role_summary,
          defaultTone: profile.default_tone,
          autonomyMode: profile.autonomy_mode,
          interruptionStyle: profile.interruption_style,
          greeting: typeof profileMetadata.voiceGreeting === "string"
            ? profileMetadata.voiceGreeting
            : "Thank you for calling. How can I help you today?",
          languages: strings(profileMetadata.voiceLanguages).length
            ? strings(profileMetadata.voiceLanguages)
            : ["English"],
          callGoals: strings(profileMetadata.voiceCallGoals),
          customInstructions: strings(profileMetadata.voiceCustomInstructions),
          escalationRules: strings(profile.escalation_rules_json),
          industry: profile.industry ?? "General business"
        }
      : null,
    channels: (channelResult?.rows ?? []).map((row) => ({
      id: row.id,
      channelKey: row.channel_key,
      providerKey: row.provider_key ?? "not selected",
      status: row.status,
      liveActionsEnabled: row.live_actions_enabled,
      inboundEnabled: row.inbound_enabled,
      outboundEnabled: row.outbound_enabled,
      approvalMode: row.approval_mode,
      setupNotes: row.setup_notes ?? "Configure the provider, consent rules, and approval mode before live use."
    })),
    actions: (actionResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary ?? "Review this office-manager action before it runs.",
      actionType: row.action_type,
      status: row.status,
      priority: row.priority,
      confidenceScore: Number(row.confidence_score)
    })),
    memory: (memoryResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      factText: row.fact_text,
      factType: row.fact_type,
      status: row.status,
      sensitivity: row.sensitivity
    })),
    recentSessions: (sessionResult?.rows ?? []).map((row) => ({
      id: row.id,
      channelKey: row.channel_key,
      status: row.status,
      intentKey: row.intent_key ?? "unknown",
      summary: row.summary ?? "No summary yet.",
      customerSentiment: row.customer_sentiment ?? "unknown",
      lastMessageAt: iso(row.last_message_at)
    })),
    voiceRoutes: (voiceRouteResult?.rows ?? []).map((row) => ({
      id: row.id,
      routeFamily: row.route_family,
      primaryProviderKey: row.primary_provider_key,
      fallbackProviderKey: row.fallback_provider_key,
      status: row.status,
      plainLanguageStatus: row.plain_language_status,
      liveActionsEnabled: row.live_actions_enabled
    }))
  };
}
