"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { callHandlingStrategies, callPriorityClasses } from "@/lib/office-manager/call-management";
import {
  requestOwnerDestinationVerification,
  saveOwnerConversationPreference,
  updateOwnerConversationSettings,
  verifyOwnerDestination
} from "@/lib/office-manager/owner-briefings";
import { saveScopedPreference } from "@/lib/preferences/saved-preferences";
import { linesFromText } from "@/lib/phone/voice-agent-profile";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type VoiceCustomizationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type OwnerBriefingSetupState = {
  status: "idle" | "success" | "error";
  message: string;
};

const attentionStateSchema = z.enum([
  "available", "busy", "driving", "on_job", "focus", "meeting",
  "lunch", "vacation", "emergency_only"
]);

const ownerBriefingSetupSchema = z.object({
  phoneNumber: z.string().trim().max(32),
  voiceEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  maximumProactiveCallsPerDay: z.coerce.number().int().min(0).max(20),
  timezone: z.string().trim().min(1).max(80),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")),
  voicemailAllowed: z.boolean(),
  retryAllowed: z.boolean(),
  textSummaryAfterCall: z.boolean()
}).refine((value) => value.voiceEnabled || value.smsEnabled, {
  message: "Choose voice calls, text briefings, or both."
});

async function currentOwnerBriefingActor() {
  await requirePermission("tenant:manage");
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session?.userId) {
    throw new Error("Sign in with your personal Ferocity account to configure private owner briefings.");
  }
  return { tenantId, userId: session.userId };
}

export async function saveOwnerBriefingSetupAction(
  _previousState: OwnerBriefingSetupState,
  formData: FormData
): Promise<OwnerBriefingSetupState> {
  const parsed = ownerBriefingSetupSchema.safeParse({
    phoneNumber: formData.get("phoneNumber"),
    voiceEnabled: formData.get("voiceEnabled") === "on",
    smsEnabled: formData.get("smsEnabled") === "on",
    maximumProactiveCallsPerDay: formData.get("maximumProactiveCallsPerDay") ?? 2,
    timezone: formData.get("timezone") ?? "America/Los_Angeles",
    quietHoursStart: formData.get("quietHoursStart") ?? "",
    quietHoursEnd: formData.get("quietHoursEnd") ?? "",
    voicemailAllowed: formData.get("voicemailAllowed") === "on",
    retryAllowed: formData.get("retryAllowed") === "on",
    textSummaryAfterCall: formData.get("textSummaryAfterCall") === "on"
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Review the owner briefing settings." };
  }

  try {
    const actor = await currentOwnerBriefingActor();
    const settings = {
      ...actor,
      ...parsed.data,
      quietHoursStart: parsed.data.quietHoursStart || null,
      quietHoursEnd: parsed.data.quietHoursEnd || null
    };
    if (parsed.data.phoneNumber) {
      if (parsed.data.phoneNumber.replace(/\D/g, "").length < 10) {
        return { status: "error", message: "Enter a valid phone number." };
      }
      await saveOwnerConversationPreference(settings);
    } else {
      await updateOwnerConversationSettings(settings);
    }
    const verificationStatus = await queryPostgres<{ status: string }>(
      `select status from public.owner_conversation_preferences where tenant_id=$1 and user_id=$2 limit 1`,
      [actor.tenantId, actor.userId]
    );
    const delivery = verificationStatus?.rows[0]?.status === "pending_verification"
      ? await requestOwnerDestinationVerification(actor)
      : { ok: true as const, message: "Your verified phone remains active." };
    revalidatePath("/app/office-manager");
    return delivery.ok
      ? { status: "success", message: "Settings saved. " + delivery.message }
      : { status: "error", message: "Settings saved, but " + delivery.message.toLowerCase() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Owner briefing setup could not be saved." };
  }
}

export async function resendOwnerVerificationAction(
  _previousState: OwnerBriefingSetupState,
  _formData: FormData
): Promise<OwnerBriefingSetupState> {
  try {
    const actor = await currentOwnerBriefingActor();
    const result = await requestOwnerDestinationVerification(actor);
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "A new code could not be sent." };
  }
}

export async function verifyOwnerDestinationAction(
  _previousState: OwnerBriefingSetupState,
  formData: FormData
): Promise<OwnerBriefingSetupState> {
  const parsed = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code.") })
    .safeParse({ code: formData.get("code") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter the code." };
  try {
    const actor = await currentOwnerBriefingActor();
    const result = await verifyOwnerDestination({ ...actor, code: parsed.data.code });
    revalidatePath("/app/office-manager");
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The code could not be verified." };
  }
}

export async function setOwnerAttentionStateAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = z.object({
    state: attentionStateSchema,
    durationMinutes: z.coerce.number().int().min(0).max(43_200)
  }).safeParse({
    state: formData.get("state"),
    durationMinutes: formData.get("durationMinutes") ?? 0
  });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  await queryPostgres(
    `update public.owner_attention_states
     set status='cleared', updated_at=now()
     where tenant_id=$1 and status='active'
       and ($2::text is null or user_id=$2::uuid or user_id is null)`,
    [tenantId, session?.userId ?? null]
  );
  await queryPostgres(
    `insert into public.owner_attention_states (
       tenant_id, user_id, state_key, status, starts_at, expires_at, source, metadata_json
     ) values (
       $1, $2, $3, 'active', now(),
       case when $4 > 0 then now() + make_interval(mins => $4) else null end,
       'manual', '{"changedInline":true}'::jsonb
     )`,
    [tenantId, session?.userId ?? null, parsed.data.state, parsed.data.durationMinutes]
  );
  revalidatePath("/app/office-manager");
}

export async function setCallHandlingModeAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = z.object({ modeId: z.string().uuid() }).safeParse({ modeId: formData.get("modeId") });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const mode = await queryPostgres<{ mode_key: string }>(
    `select mode_key from public.call_handling_modes
     where tenant_id=$1 and id=$2 and status='active' limit 1`,
    [tenantId, parsed.data.modeId]
  );
  if (!mode?.rows[0]) return;
  await queryPostgres(
    `update public.call_handling_modes
     set is_default=(id=$2), updated_at=now()
     where tenant_id=$1 and brand_id is null and status='active'`,
    [tenantId, parsed.data.modeId]
  );
  await saveScopedPreference({
    tenantId,
    domain: "call_management",
    key: "active_mode",
    scope: { type: "organization", key: "default" },
    value: { modeKey: mode.rows[0].mode_key },
    userId: session?.userId,
    metadata: { changedInline: true }
  });
  revalidatePath("/app/office-manager");
}

export async function createCustomCallModeAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = z.object({
    displayName: z.string().trim().min(2).max(80),
    description: z.string().trim().max(240),
    handlingStrategy: z.enum(callHandlingStrategies),
    schedule: z.enum(["always", "business_hours", "after_hours", "weekends"]),
    minimumTransferScore: z.coerce.number().int().min(0).max(100),
    minimumSalesValueDollars: z.coerce.number().min(0).max(10_000_000)
  }).safeParse({
    displayName: formData.get("displayName"),
    description: formData.get("description") ?? "",
    handlingStrategy: formData.get("handlingStrategy"),
    schedule: formData.get("schedule") ?? "always",
    minimumTransferScore: formData.get("minimumTransferScore") ?? 70,
    minimumSalesValueDollars: formData.get("minimumSalesValueDollars") ?? 0
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const categories = callPriorityClasses.filter((category) => formData.get(`category:${category}`) === "on");
  const modeKey = `custom_${Date.now()}`;
  await queryPostgres(
    `insert into public.call_handling_modes (
       tenant_id, mode_key, display_name, description, handling_strategy,
       active_when_json, transfer_categories_json, minimum_transfer_score,
       minimum_sales_value_cents, is_custom, metadata_json
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,true,'{"changedInline":true}'::jsonb)`,
    [
      tenantId, modeKey, parsed.data.displayName, parsed.data.description,
      parsed.data.handlingStrategy,
      JSON.stringify(parsed.data.schedule === "always"
        ? {}
        : { schedule: parsed.data.schedule, startHour: 8, endHour: 17, weekdays: [1, 2, 3, 4, 5] }),
      JSON.stringify(categories), parsed.data.minimumTransferScore,
      Math.round(parsed.data.minimumSalesValueDollars * 100)
    ]
  );
  revalidatePath("/app/office-manager");
}

const voiceCustomizationSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  greeting: z.string().trim().min(1).max(280),
  tone: z.string().trim().min(1).max(180),
  languages: z.string().trim().max(400),
  callGoals: z.string().trim().max(1800),
  customInstructions: z.string().trim().max(3000),
  escalationTopics: z.string().trim().max(1800)
});

export async function saveVoiceCustomizationAction(
  _previousState: VoiceCustomizationState,
  formData: FormData
): Promise<VoiceCustomizationState> {
  await requirePermission("tenant:manage");
  const parsed = voiceCustomizationSchema.safeParse({
    profileId: formData.get("profileId"),
    displayName: formData.get("displayName"),
    greeting: formData.get("greeting"),
    tone: formData.get("tone"),
    languages: formData.get("languages"),
    callGoals: formData.get("callGoals"),
    customInstructions: formData.get("customInstructions"),
    escalationTopics: formData.get("escalationTopics")
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the phone-agent fields. A name, greeting, and speaking style are required."
    };
  }

  const workspaceId = await getCurrentWorkspaceId();
  const languages = parsed.data.languages
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  const escalationRules = linesFromText(parsed.data.escalationTopics);
  const updated = await queryPostgres<{ id: string }>(
    `
    update public.office_manager_profiles
    set display_name = $3,
        default_tone = $4,
        escalation_rules_json = case
          when cardinality($5::text[]) > 0 then to_jsonb($5::text[])
          else escalation_rules_json
        end,
        metadata_json = metadata_json || $6::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status <> 'archived'
    returning id
    `,
    [
      workspaceId,
      parsed.data.profileId,
      parsed.data.displayName,
      parsed.data.tone,
      escalationRules,
      JSON.stringify({
        voiceGreeting: parsed.data.greeting,
        voiceLanguages: languages.length ? languages : ["English"],
        voiceCallGoals: linesFromText(parsed.data.callGoals),
        voiceCustomInstructions: linesFromText(parsed.data.customInstructions),
        voiceCustomizedAt: new Date().toISOString()
      })
    ]
  );
  if (!updated?.rows[0]) {
    return { status: "error", message: "That phone-agent profile was not found in this workspace." };
  }

  revalidatePath("/app/office-manager");
  revalidatePath("/app/receptionist-setup");
  return {
    status: "success",
    message: "Phone-agent behavior saved. These instructions will be applied to any connected voice provider."
  };
}

export async function prepareOfficeManagerAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const brand = await queryPostgres<{ id: string }>(
    "select id from public.brands where tenant_id = $1 and status = 'active' order by created_at asc limit 1",
    [workspaceId]
  );
  const brandId = brand?.rows[0]?.id ?? null;

  const profile = await queryPostgres<{ id: string }>(
    `
    insert into public.office_manager_profiles (
      tenant_id, brand_id, status, display_name, role_summary, default_tone, autonomy_mode,
      interruption_style, escalation_rules_json, industry_playbooks_json, guardrails_json, memory_rules_json, provider_preferences_json, metadata_json
    )
    values (
      $1, $2, 'ready', 'Ferocity Office Manager',
      'AI office manager for customer service, scheduling, follow-up, collections, owner assistance, and voice-ready workflows.',
      'warm, confident, direct, and natural',
      'approval_required',
      'natural',
      $3::jsonb,
      $4::jsonb,
      $5::jsonb,
      $6::jsonb,
      $7::jsonb,
      '{"source":"office_manager_setup","liveVoice":false}'::jsonb
    )
    on conflict (tenant_id, brand_id) do update
    set status = 'ready',
        role_summary = public.office_manager_profiles.role_summary,
        default_tone = public.office_manager_profiles.default_tone,
        autonomy_mode = excluded.autonomy_mode,
        interruption_style = excluded.interruption_style,
        escalation_rules_json = case when jsonb_array_length(public.office_manager_profiles.escalation_rules_json) > 0
          then public.office_manager_profiles.escalation_rules_json else excluded.escalation_rules_json end,
        industry_playbooks_json = case when jsonb_array_length(public.office_manager_profiles.industry_playbooks_json) > 0
          then public.office_manager_profiles.industry_playbooks_json else excluded.industry_playbooks_json end,
        guardrails_json = case when jsonb_array_length(public.office_manager_profiles.guardrails_json) > 0
          then public.office_manager_profiles.guardrails_json else excluded.guardrails_json end,
        memory_rules_json = case when jsonb_array_length(public.office_manager_profiles.memory_rules_json) > 0
          then public.office_manager_profiles.memory_rules_json else excluded.memory_rules_json end,
        provider_preferences_json = excluded.provider_preferences_json,
        metadata_json = public.office_manager_profiles.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id
    `,
    [
      workspaceId,
      brandId,
      JSON.stringify([
        "Escalate money, legal, safety, angry customer, low confidence, failed provider, and owner approval decisions.",
        "Never finalize payment, publish publicly, order materials, or change schedules without the configured approval mode.",
        "Handoff with full context instead of forcing the customer to repeat information."
      ]),
      JSON.stringify(["general_business", "local_service", "contractor", "rental_property", "professional_services"]),
      JSON.stringify([
        "Do not pretend to be human if directly asked.",
        "Do not invent prices, warranties, schedule availability, legal advice, medical advice, or guaranteed outcomes.",
        "Use existing Ferocity records and create reviewable action requests before live actions."
      ]),
      JSON.stringify([
        "Use memory to improve service, not to be creepy.",
        "Store sensitive facts only when useful and reviewable.",
        "Prefer customer history, warranties, previous conversations, and owner rules over generic scripts."
      ]),
      JSON.stringify({
        voice: ["connected_voice_provider", "future_provider_adapter"],
        llm: "ferocity_ai_service",
        messaging: "connected_messaging_provider",
        email: "connected_email_provider"
      })
    ]
  );
  const profileId = profile?.rows[0]?.id;

  const channels = [
    ["phone", "connected_phone_provider", "not_connected", false, false, "Connect a business number and preferred voice service when ready."],
    ["sms", "connected_messaging_provider", "not_connected", false, false, "Connect any supported messaging service, or use assisted sending."],
    ["email", "connected_email_provider", "not_connected", false, false, "Connect the business email service used for customer conversations."],
    ["website_chat", "ferocity_web_chat", "ready", true, true, "Ferocity website chat is available through an active public form. Install and test it on each website before calling that site connected."],
    ["owner_command", "ferocity_ai_workforce", "ready", true, true, "Owner commands already route through AI Workforce and existing tools."],
    ["app_push", "ferocity_push", "ready", true, false, "Push/app alerts are available when device subscriptions are enabled."]
  ] as const;

  for (const [channelKey, providerKey, status, inbound, outbound, setupNotes] of channels) {
    await queryPostgres(
      `
      insert into public.office_manager_channel_configs (
        tenant_id, brand_id, profile_id, channel_key, provider_key, status, inbound_enabled, outbound_enabled,
        live_actions_enabled, approval_mode, setup_notes, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, false, 'approval_required', $9, '{"source":"office_manager_setup"}'::jsonb)
      on conflict (tenant_id, brand_id, channel_key) do update
      set profile_id = excluded.profile_id,
          status = case when excluded.provider_key in ('ferocity_web_chat','ferocity_ai_workforce','ferocity_push') then excluded.status else public.office_manager_channel_configs.status end,
          inbound_enabled = case when excluded.provider_key in ('ferocity_web_chat','ferocity_ai_workforce','ferocity_push') then excluded.inbound_enabled else public.office_manager_channel_configs.inbound_enabled end,
          outbound_enabled = case when excluded.provider_key in ('ferocity_web_chat','ferocity_ai_workforce','ferocity_push') then excluded.outbound_enabled else public.office_manager_channel_configs.outbound_enabled end,
          setup_notes = case when excluded.provider_key in ('ferocity_web_chat','ferocity_ai_workforce','ferocity_push') then excluded.setup_notes else public.office_manager_channel_configs.setup_notes end,
          metadata_json = public.office_manager_channel_configs.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, brandId, profileId, channelKey, providerKey, status, inbound, outbound, setupNotes]
    );
  }

  await queryPostgres(
    `
    insert into public.office_manager_memory_facts (
      tenant_id, brand_id, fact_type, status, title, fact_text, sensitivity, metadata_json
    )
    values
      ($1, $2, 'owner_rule', 'active', 'Approval-first office manager', 'The AI Office Manager prepares and routes work, but live calls, sends, publishing, payments, ordering, and schedule changes require configured approval rules.', 'internal', '{"source":"office_manager_setup"}'::jsonb),
      ($1, $2, 'sop', 'needs_review', 'Human-quality service standard', 'Respond quickly, keep context across channels, ask only for missing information, and hand off with the full summary when confidence is low.', 'internal', '{"source":"office_manager_setup"}'::jsonb)
    on conflict do nothing
    `,
    [workspaceId, brandId]
  );

  await queryPostgres(
    `
    insert into public.office_manager_action_requests (
      tenant_id, brand_id, action_type, status, priority, confidence_score, title, summary, recommended_action,
      idempotency_key, requires_owner, metadata_json
    )
    values ($1, $2, 'handoff_owner', 'needs_review', 'high', 88, 'Finish AI Office Manager setup', $3, $4, $5, true, '{"source":"office_manager_setup"}'::jsonb)
    on conflict (tenant_id, idempotency_key) do update
    set status = excluded.status,
        priority = excluded.priority,
        summary = excluded.summary,
        recommended_action = excluded.recommended_action,
        updated_at = now()
    `,
    [
      workspaceId,
      brandId,
      "Choose the first channels to activate, add provider keys when ready, confirm consent language, and decide what the office manager can do without owner approval.",
      "Start with owner commands, app alerts, email/review queues, and dashboard tasks. Add live phone after provider setup and call-recording rules are reviewed.",
      `office-manager-setup:${brandId ?? "workspace"}`
    ]
  );

  await queryPostgres(
    `
    insert into public.office_manager_performance_metrics (
      tenant_id, brand_id, metric_date, conversations_handled, owner_minutes_saved, metadata_json
    )
    values ($1, $2, current_date, 0, 0, '{"source":"office_manager_setup","seed":true}'::jsonb)
    on conflict (tenant_id, brand_id, metric_date) do update
    set metadata_json = public.office_manager_performance_metrics.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [workspaceId, brandId]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body, source_table, source_id, metadata_json
    )
    values ($1, $2, 'ai', 'office_manager_prepared', 'AI Office Manager prepared', 'Ferocity prepared the office-manager profile, channel readiness, memory rules, and setup action. Live voice remains off until providers and approvals are configured.', 'office_manager_profiles', $3, '{"source":"office_manager_setup","requiresApproval":true}'::jsonb)
    `,
    [workspaceId, brandId, profileId]
  );

  revalidatePath("/app/office-manager");
  revalidatePath("/app/automation-timeline");
  revalidatePath("/app");
}
