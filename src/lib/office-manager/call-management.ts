import { queryPostgres } from "@/lib/db/postgres";
import { safeLogAppError } from "@/lib/observability/log-error";
import { resolveSavedPreference } from "@/lib/preferences/saved-preferences";

export const callPriorityClasses = [
  "emergency", "urgent", "sales_opportunity", "existing_customer", "vip",
  "warranty", "supplier", "employee", "spam", "unknown"
] as const;
export type CallPriorityClass = typeof callPriorityClasses[number];

export const callHandlingStrategies = [
  "ai_first", "simultaneous", "owner_first", "important_only",
  "ai_unless_requested", "schedule_based", "presence_based", "custom"
] as const;
export type CallHandlingStrategy = typeof callHandlingStrategies[number];

export type CallManagementSignals = {
  summary?: string | null;
  transcript?: string | null;
  outcome?: string | null;
  sentiment?: string | null;
  leadQualification?: string | null;
  estimatedValueCents?: number;
  existingCustomer?: boolean;
  vipCustomer?: boolean;
  warrantyCall?: boolean;
  supplierCall?: boolean;
  employeeCall?: boolean;
  ownerRequested?: boolean;
  requestedEmployee?: string | null;
  aiAllowed?: boolean;
};

export type CallHandlingModeInput = {
  id?: string | null;
  modeKey: string;
  displayName: string;
  handlingStrategy: CallHandlingStrategy;
  transferCategories: CallPriorityClass[];
  aiHandleCategories?: string[];
  minimumTransferScore: number;
  minimumSalesValueCents: number;
};

export type CallManagementDecision = {
  priorityClass: CallPriorityClass;
  urgencyScore: number;
  estimatedValueCents: number;
  decision:
    | "ai_handle" | "ring_owner" | "ring_simultaneously" | "screen_then_transfer"
    | "voicemail" | "schedule_callback" | "transfer_employee" | "block";
  shouldInterruptOwner: boolean;
  callerContext: string;
  screeningSummary: string;
  decisionReason: string;
  confidenceScore: number;
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function cleanText(signals: CallManagementSignals) {
  return `${signals.summary ?? ""} ${signals.transcript ?? ""} ${signals.outcome ?? ""}`.toLowerCase();
}

function classify(signals: CallManagementSignals): { priority: CallPriorityClass; score: number; reason: string } {
  const text = cleanText(signals);
  if (includesAny(text, ["telemarketer", "robocall", "wrong number", "spam"])) {
    return { priority: "spam", score: 0, reason: "The call appears to be spam or a wrong number." };
  }
  if (includesAny(text, [
    "active roof leak", "roof is leaking", "fire", "gas leak", "flooding",
    "burst pipe", "electrical emergency", "life safety", "emergency repair"
  ])) {
    return { priority: "emergency", score: 98, reason: "The caller described an active emergency or property-damage risk." };
  }
  if (signals.vipCustomer) return { priority: "vip", score: 92, reason: "This is a recognized VIP customer." };
  if (signals.employeeCall) return { priority: "employee", score: 82, reason: "An employee is calling the business." };
  if (signals.supplierCall) return { priority: "supplier", score: 62, reason: "A supplier is calling the business." };
  if (signals.warrantyCall || includesAny(text, ["warranty", "installation problem", "work we completed"])) {
    return { priority: "warranty", score: 78, reason: "The call concerns warranty or completed work." };
  }
  const salesSignal = signals.leadQualification === "hot"
    || includesAny(text, ["ready to buy", "approve the proposal", "approve proposal", "schedule today", "sign today", "accept the estimate"]);
  if (salesSignal) {
    const valueBoost = Math.min(15, Math.floor((signals.estimatedValueCents ?? 0) / 500000));
    return { priority: "sales_opportunity", score: Math.min(98, 80 + valueBoost), reason: "The caller is ready to move a sales opportunity forward." };
  }
  if (signals.sentiment === "urgent" || signals.sentiment === "angry" || signals.ownerRequested) {
    return { priority: "urgent", score: signals.ownerRequested ? 85 : 80, reason: signals.ownerRequested ? "The caller specifically requested the owner." : "The caller needs urgent or escalated help." };
  }
  if (signals.existingCustomer || signals.outcome === "existing_customer") {
    return { priority: "existing_customer", score: 58, reason: "This is an existing customer without an emergency signal." };
  }
  return { priority: "unknown", score: 35, reason: "Ferocity does not yet have enough evidence to classify the call as important." };
}

export function decideCallHandling(
  signals: CallManagementSignals,
  mode: CallHandlingModeInput,
  attentionState = "available"
): CallManagementDecision {
  const classified = classify(signals);
  const text = cleanText(signals);
  const estimatedValueCents = Math.max(0, Math.round(signals.estimatedValueCents ?? 0));
  const routine = includesAny(text, [
    "office hours", "business hours", "schedule appointment", "reschedule",
    "appointment change", "pricing question", "status update", "faq"
  ]);
  const transferCategory = mode.transferCategories.includes(classified.priority);
  const valueQualifies = mode.minimumSalesValueCents > 0 && estimatedValueCents >= mode.minimumSalesValueCents;
  const emergencyOnly = attentionState === "driving" || attentionState === "emergency_only";
  const protectedAttention = ["busy", "driving", "on_job", "focus", "meeting", "lunch", "vacation", "emergency_only"].includes(attentionState);
  const threshold = emergencyOnly ? Math.max(95, mode.minimumTransferScore)
    : protectedAttention ? Math.max(80, mode.minimumTransferScore)
      : mode.minimumTransferScore;
  const important = classified.priority === "emergency"
    || classified.score >= threshold
    || valueQualifies
    || (signals.ownerRequested && !emergencyOnly);

  let decision: CallManagementDecision["decision"] = "ai_handle";
  let shouldInterruptOwner = false;
  let decisionReason = routine
    ? "AI can handle this routine request without interrupting the owner."
    : classified.reason;

  if (signals.aiAllowed === false) {
    decision = protectedAttention && classified.priority !== "emergency" ? "voicemail" : "ring_owner";
    shouldInterruptOwner = decision === "ring_owner";
    decisionReason = decision === "ring_owner"
      ? "This caller's saved preference requires a person."
      : "This caller opted out of AI calls, and the owner is unavailable, so the call should go to voicemail.";
  } else if (classified.priority === "spam") {
    decision = "block";
    decisionReason = "Spam should not interrupt the owner.";
  } else if (mode.handlingStrategy === "simultaneous") {
    decision = "ring_simultaneously";
    shouldInterruptOwner = true;
    decisionReason = "The active mode rings the owner and AI together.";
  } else if (mode.handlingStrategy === "owner_first") {
    decision = "ring_owner";
    shouldInterruptOwner = true;
    decisionReason = "The active mode rings the owner first and uses AI as backup.";
  } else if (signals.requestedEmployee && important) {
    decision = "transfer_employee";
    decisionReason = `The caller requested ${signals.requestedEmployee}.`;
  } else if (!routine && (important || transferCategory)) {
    decision = "screen_then_transfer";
    shouldInterruptOwner = true;
  }

  if (protectedAttention && classified.priority !== "emergency" && classified.score < threshold && !valueQualifies) {
    decision = "ai_handle";
    shouldInterruptOwner = false;
    decisionReason = `The owner is ${attentionState.replaceAll("_", " ")}; AI can handle or record this call without interrupting them.`;
  }

  const valueText = estimatedValueCents > 0
    ? ` Estimated opportunity value is ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(estimatedValueCents / 100)}.`
    : "";
  const personText = signals.existingCustomer ? "Existing customer. " : "";
  const screeningSummary = (signals.summary?.trim() || classified.reason).slice(0, 500);
  return {
    priorityClass: classified.priority,
    urgencyScore: classified.score,
    estimatedValueCents,
    decision,
    shouldInterruptOwner,
    callerContext: `${personText}${classified.reason}${valueText}`.trim(),
    screeningSummary,
    decisionReason,
    confidenceScore: classified.priority === "unknown" ? 60 : 88
  };
}

type StoredMode = {
  id: string;
  mode_key: string;
  display_name: string;
  handling_strategy: CallHandlingStrategy;
  active_when_json: {
    states?: string[];
    schedule?: "business_hours" | "after_hours" | "weekends" | "always";
    startHour?: number;
    endHour?: number;
    weekdays?: number[];
  } | null;
  transfer_categories_json: CallPriorityClass[] | null;
  ai_handle_categories_json: string[] | null;
  minimum_transfer_score: number;
  minimum_sales_value_cents: number;
  is_default: boolean;
};

function scheduleStatus(
  timeZone: string,
  activeWhen: StoredMode["active_when_json"],
  now = new Date()
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12) % 24;
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const weekdays = activeWhen?.weekdays ?? [1, 2, 3, 4, 5];
  const startHour = activeWhen?.startHour ?? 8;
  const endHour = activeWhen?.endHour ?? 17;
  const businessHours = weekdays.includes(dayIndex) && hour >= startHour && hour < endHour;
  return { businessHours, weekend: dayIndex === 0 || dayIndex === 6 };
}

export async function evaluateAndStoreCallManagementDecision(input: {
  tenantId: string;
  callId: string;
  additionalSignals?: Partial<CallManagementSignals>;
}) {
  const callResult = await queryPostgres<{
    summary: string | null;
    transcript_text: string | null;
    outcome: string | null;
    sentiment: string | null;
    lead_qualification: string | null;
    customer_id: string | null;
    lead_id: string | null;
    caller_number: string | null;
    lead_priority: string | null;
    estimated_value_cents: number;
    vip_customer: boolean;
    no_ai_calls: boolean;
  }>(
    `select c.summary, t.transcript_text, c.outcome, c.sentiment, c.lead_qualification,
       c.customer_id, c.lead_id, c.caller_number, l.priority as lead_priority,
       coalesce((
         select max(e.total_cents) from public.service_estimates e
         where e.tenant_id = c.tenant_id and e.customer_id = c.customer_id
           and e.status not in ('declined','expired','archived')
       ),0)::int as estimated_value_cents,
       exists (
         select 1
         from public.customer_tag_assignments cta
         join public.customer_tags ct
           on ct.tenant_id = cta.tenant_id and ct.id = cta.tag_id
         where cta.tenant_id = c.tenant_id and cta.customer_id = c.customer_id
           and lower(ct.name) in ('vip','priority','preferred')
       ) as vip_customer,
       coalesce((
         select (p.value_json->>'noAiCalls')::boolean
         from public.scoped_saved_preferences p
         where p.tenant_id=c.tenant_id
           and p.preference_domain='communication'
           and p.preference_key='contact_profile'
           and p.scope_type='contact'
           and p.scope_key in (
             case when c.customer_id is null then '' else 'customer:' || c.customer_id::text end,
             case when c.lead_id is null then '' else 'lead:' || c.lead_id::text end
           )
           and p.status='active'
         order by p.updated_at desc limit 1
       ), false) as no_ai_calls
     from public.receptionist_calls c
     left join public.receptionist_call_transcripts t
       on t.tenant_id = c.tenant_id and t.call_id = c.id
     left join public.leads l on l.tenant_id = c.tenant_id and l.id = c.lead_id
     where c.tenant_id = $1 and c.id = $2 limit 1`,
    [input.tenantId, input.callId]
  );
  const call = callResult?.rows[0];
  if (!call) return null;

  const [stateResult, modeResult, settingsResult] = await Promise.all([
    queryPostgres<{ state_key: string; user_id: string | null }>(
      `select state_key, user_id from public.owner_attention_states
       where tenant_id=$1 and status='active' and starts_at <= now()
         and (expires_at is null or expires_at > now())
       order by starts_at desc limit 1`,
      [input.tenantId]
    ),
    queryPostgres<StoredMode>(
      `select id, mode_key, display_name, handling_strategy, active_when_json,
         transfer_categories_json, ai_handle_categories_json,
         minimum_transfer_score, minimum_sales_value_cents, is_default
       from public.call_handling_modes
       where tenant_id=$1 and status='active'
       order by is_default desc, created_at asc`,
      [input.tenantId]
    ),
    queryPostgres<{ timezone: string }>(
      "select timezone from public.workspace_settings where tenant_id=$1 limit 1",
      [input.tenantId]
    )
  ]);
  const preferenceResult = await queryPostgres<{ mode_key: string; scope_type: string }>(
    `select value_json->>'modeKey' as mode_key, scope_type
     from public.scoped_saved_preferences
     where tenant_id=$1 and preference_domain='call_management'
       and preference_key='active_mode' and status='active'
       and (
         (scope_type='contact' and scope_key in ($2,$3))
         or (scope_type='workflow' and scope_key='inbound_call')
         or (scope_type='user' and scope_key=$4)
         or (scope_type='organization' and scope_key='default')
       )
     order by case scope_type when 'contact' then 4 when 'workflow' then 3 when 'user' then 2 else 1 end desc,
       updated_at desc limit 1`,
    [
      input.tenantId,
      call.customer_id ? `customer:${call.customer_id}` : "",
      call.lead_id ? `lead:${call.lead_id}` : "",
      stateResult?.rows[0]?.user_id ?? ""
    ]
  );

  const state = stateResult?.rows[0]?.state_key ?? "available";
  const modes = modeResult?.rows ?? [];
  const preferredMode = preferenceResult?.rows[0];
  const mode = modes.find((item) => item.mode_key === preferredMode?.mode_key)
    ?? modes.find((item) => item.active_when_json?.states?.includes(state))
    ?? modes.find((item) => item.is_default)
    ?? modes[0];
  if (!mode) return null;
  const schedule = scheduleStatus(
    settingsResult?.rows[0]?.timezone ?? "America/Los_Angeles",
    mode.active_when_json
  );
  let effectiveStrategy = mode.handling_strategy;
  if (mode.active_when_json?.schedule === "after_hours") {
    effectiveStrategy = schedule.businessHours ? "owner_first" : "ai_first";
  } else if (mode.active_when_json?.schedule === "business_hours") {
    effectiveStrategy = schedule.businessHours ? "ai_first" : "owner_first";
  } else if (mode.active_when_json?.schedule === "weekends") {
    effectiveStrategy = schedule.weekend ? "ai_first" : "owner_first";
  }

  const signals: CallManagementSignals = {
    summary: call.summary,
    transcript: call.transcript_text,
    outcome: call.outcome,
    sentiment: call.sentiment,
    leadQualification: call.lead_qualification,
    existingCustomer: Boolean(call.customer_id),
    vipCustomer: call.vip_customer,
    estimatedValueCents: call.estimated_value_cents,
    aiAllowed: !call.no_ai_calls,
    ...input.additionalSignals
  };
  let decision = decideCallHandling(signals, {
    id: mode.id,
    modeKey: mode.mode_key,
    displayName: mode.display_name,
    handlingStrategy: effectiveStrategy,
    transferCategories: mode.transfer_categories_json ?? ["emergency","urgent","sales_opportunity","vip"],
    aiHandleCategories: mode.ai_handle_categories_json ?? [],
    minimumTransferScore: mode.minimum_transfer_score,
    minimumSalesValueCents: mode.minimum_sales_value_cents
  }, state);

  const remembered = await resolveSavedPreference<{ response?: string }>({
    tenantId: input.tenantId,
    domain: "call_management",
    key: `priority_action:${decision.priorityClass}`,
    scopes: [
      ...(call.customer_id ? [{ type: "contact" as const, key: `customer:${call.customer_id}` }] : []),
      ...(call.lead_id ? [{ type: "contact" as const, key: `lead:${call.lead_id}` }] : []),
      { type: "workflow", key: "inbound_call" },
      ...(stateResult?.rows[0]?.user_id ? [{ type: "user" as const, key: stateResult.rows[0].user_id }] : []),
      { type: "organization", key: "default" }
    ],
    fallback: {}
  });
  const rememberedAction: Record<string, CallManagementDecision["decision"]> = {
    accept: "ring_owner",
    decline: "ai_handle",
    voicemail: "voicemail",
    return_to_ai: "ai_handle",
    transfer_employee: "transfer_employee",
    schedule_callback: "schedule_callback"
  };
  const overrideAction = remembered.value.response ? rememberedAction[remembered.value.response] : null;
  if (overrideAction && decision.priorityClass !== "emergency" && decision.priorityClass !== "spam") {
    decision = {
      ...decision,
      decision: overrideAction,
      shouldInterruptOwner: ["ring_owner", "transfer_employee"].includes(overrideAction),
      decisionReason: `Using the saved ${remembered.scope?.type ?? "business"} preference for ${decision.priorityClass.replaceAll("_", " ")} calls.`
    };
  }

  const stored = await queryPostgres<{ id: string }>(
    `insert into public.call_management_decisions (
       tenant_id, call_id, mode_id, priority_class, urgency_score,
       estimated_value_cents, decision, should_interrupt_owner, caller_context,
       screening_summary, decision_reason, confidence_score,
       resolved_scope, resolved_mode_source, metadata_json
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     on conflict (tenant_id, call_id) do update set
       mode_id=excluded.mode_id, priority_class=excluded.priority_class,
       urgency_score=excluded.urgency_score, estimated_value_cents=excluded.estimated_value_cents,
       decision=case when public.call_management_decisions.owner_response is null
         then excluded.decision else public.call_management_decisions.decision end,
       should_interrupt_owner=case when public.call_management_decisions.owner_response is null
         then excluded.should_interrupt_owner else public.call_management_decisions.should_interrupt_owner end,
       caller_context=excluded.caller_context, screening_summary=excluded.screening_summary,
       decision_reason=excluded.decision_reason, confidence_score=excluded.confidence_score,
       metadata_json=public.call_management_decisions.metadata_json || excluded.metadata_json,
       updated_at=now()
     returning id`,
    [
      input.tenantId, input.callId, mode.id, decision.priorityClass, decision.urgencyScore,
      decision.estimatedValueCents, decision.decision, decision.shouldInterruptOwner,
      decision.callerContext, decision.screeningSummary, decision.decisionReason,
      decision.confidenceScore, remembered.scope?.type ?? preferredMode?.scope_type ?? "organization",
      remembered.source === "saved" ? "saved_priority_preference" : preferredMode ? "saved_preference" : state !== "available" ? "attention_state" : "organization_default",
      JSON.stringify({
        attentionState: state,
        modeKey: mode.mode_key,
        effectiveStrategy,
        businessHours: schedule.businessHours,
        providerIndependent: true
      })
    ]
  );
  return { id: stored?.rows[0]?.id ?? null, ...decision, modeKey: mode.mode_key, attentionState: state };
}

export async function safelyEvaluateAndStoreCallManagementDecision(
  input: Parameters<typeof evaluateAndStoreCallManagementDecision>[0]
) {
  try {
    return await evaluateAndStoreCallManagementDecision(input);
  } catch (error) {
    await safeLogAppError({
      source: "intelligent_call_management",
      tenantId: input.tenantId,
      severity: "warning",
      category: "call_routing_decision",
      retryable: true,
      message: error instanceof Error ? error.message : "Call-management decision failed.",
      metadata: { callId: input.callId, failOpen: true }
    });
    return null;
  }
}
