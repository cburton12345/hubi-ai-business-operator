import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkLeadIntakeLimits } from "@/lib/billing/plan-limits";
import { queryPostgres } from "@/lib/db/postgres";
import type { PublicLeadInput } from "@/lib/leads/schemas";
import { logAppError } from "@/lib/observability/log-error";
import { getPushNotificationPreferences, pushPreferencesAllowEvent, type PushSeverity } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { evaluateQualification } from "@/lib/revenue-growth/qualification";

type FormRecord = {
  id: string;
  tenant_id: string;
  brand_id: string;
  active: boolean;
};

type LeadRecord = {
  id: string;
};

type QualificationQuestionRow = {
  form_id: string;
  id: string;
  required: boolean;
  scoring_json: unknown;
};

function textDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolDetail(details: Record<string, unknown>, key: string) {
  return typeof details[key] === "boolean" ? details[key] : null;
}

function dateDetail(details: Record<string, unknown>, key: string) {
  const value = textDetail(details, key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function intDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function numericDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function includesAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function classifyReceptionistLead(input: PublicLeadInput): { severity: PushSeverity; ownerAttention: boolean; reason: string } {
  const detailText = JSON.stringify(input.details ?? {});
  const text = `${input.leadType} ${input.source ?? ""} ${input.sourceDetail ?? ""} ${input.message ?? ""} ${detailText}`;
  const urgent = input.leadType === "case_intake" || includesAny(text, [
    "urgent",
    "asap",
    "emergency",
    "same day",
    "today",
    "tomorrow",
    "leak",
    "storm",
    "flood",
    "no heat",
    "not working",
    "broken",
    "injury",
    "accident",
    "lawsuit"
  ]);

  if (urgent) {
    return {
      severity: "high",
      ownerAttention: true,
      reason: "urgent language, legal intake, or same-day risk"
    };
  }

  return {
    severity: "medium",
    ownerAttention: false,
    reason: "normal lead captured and queued for follow-up"
  };
}

function leadContactLabel(input: PublicLeadInput) {
  return input.name?.trim() || input.email?.trim() || input.phone?.trim() || "New lead";
}

function sourceLabel(input: PublicLeadInput) {
  return [input.source ?? "website", input.sourceDetail].filter(Boolean).join(" / ");
}

async function applyRevenueQualification({
  tenantId,
  brandId,
  leadId,
  publicFormKey,
  details
}: {
  tenantId: string;
  brandId: string;
  leadId: string;
  publicFormKey: string;
  details: Record<string, unknown>;
}) {
  const answerValue = details.qualificationAnswers;
  const answers = answerValue && typeof answerValue === "object" && !Array.isArray(answerValue)
    ? answerValue as Record<string, unknown>
    : {};
  const questionsResult = await queryPostgres<QualificationQuestionRow>(
    `
    select f.id as form_id, q.id, q.required, q.scoring_json
    from public.revenue_qualification_forms f
    join public.revenue_qualification_questions q
      on q.tenant_id = f.tenant_id and q.form_id = f.id
    where f.tenant_id = $1
      and f.status = 'active'
      and f.metadata_json->>'publicFormKey' = $2
    order by q.question_order
    `,
    [tenantId, publicFormKey]
  );
  const questions = questionsResult?.rows ?? [];
  if (!questions.length) return null;

  const {
    answers: normalizedAnswers,
    missingRequired,
    leadScore,
    qualificationStatus
  } = evaluateQualification(
    questions.map((question) => ({
      id: question.id,
      required: question.required,
      scoringJson: question.scoring_json
    })),
    answers
  );
  const formId = questions[0].form_id;

  await queryPostgres(
    `
    update public.leads
    set qualification_status = $3,
        lead_score = $4,
        priority = case when $3 = 'qualified' and $4 >= 80 then 'high' else priority end,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      leadId,
      qualificationStatus,
      leadScore,
      JSON.stringify({
        revenueQualification: {
          formId,
          answers: normalizedAnswers,
          score: leadScore,
          missingRequired,
          evaluatedAt: new Date().toISOString()
        }
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.lead_events (
      tenant_id, brand_id, lead_id, type, body, metadata_json
    )
    values ($1, $2, $3, 'qualification', $4, $5::jsonb)
    `,
    [
      tenantId,
      brandId,
      leadId,
      `Revenue qualification evaluated this lead as ${qualificationStatus.replaceAll("_", " ")} with a score of ${leadScore}.`,
      JSON.stringify({ formId, qualificationStatus, leadScore, missingRequired, answers: normalizedAnswers })
    ]
  );

  return { formId, qualificationStatus, leadScore, missingRequired };
}

async function applyReferralAttribution(input: {
  tenantId: string;
  brandId: string;
  leadId: string;
  details: Record<string, unknown>;
}) {
  const token = typeof input.details.referralToken === "string" ? input.details.referralToken.trim() : "";
  if (!/^[a-f0-9]{24,64}$/i.test(token)) return;
  const referral = await queryPostgres<{ id: string; customer_id: string }>(
    `
    update public.customer_referral_links
    set attributed_leads = attributed_leads + 1, updated_at = now()
    where tenant_id = $1 and brand_id = $2 and referral_token = $3 and status = 'active'
    returning id, customer_id
    `,
    [input.tenantId, input.brandId, token]
  );
  const row = referral?.rows[0];
  if (!row) return;
  await queryPostgres(
    `
    insert into public.growth_attribution_events (
      tenant_id, brand_id, event_type, entity_type, entity_id, metadata_json
    )
    values ($1,$2,'lead_created','lead',$3,$4::jsonb)
    `,
    [
      input.tenantId,
      input.brandId,
      input.leadId,
      JSON.stringify({ channel: "customer_referral", referralLinkId: row.id, referringCustomerId: row.customer_id })
    ]
  );
}

async function recordReceptionistLeadEvent({
  tenantId,
  brandId,
  formId,
  leadId,
  input
}: {
  tenantId: string;
  brandId: string;
  formId: string;
  leadId: string;
  input: PublicLeadInput;
}) {
  const classification = classifyReceptionistLead(input);
  const status = classification.ownerAttention ? "needs_owner" : "ai_handled";
  const title = classification.ownerAttention ? "AI Receptionist found a lead worth interrupting you" : "AI Receptionist captured a lead";
  const summary = [
    `${leadContactLabel(input)} came in from ${sourceLabel(input)}.`,
    input.message ? `Message: ${input.message.slice(0, 180)}` : "No message was included.",
    classification.ownerAttention
      ? "Ferocity saved the lead and flagged it for owner review."
      : "Ferocity saved the lead, source, consent, and follow-up context without needing owner interruption."
  ].join(" ");
  const actionHref = `/app/lead-command`;
  const metadata = {
    formId,
    leadId,
    leadType: input.leadType,
    source: input.source ?? "website",
    sourceDetail: input.sourceDetail ?? null,
    consentToContact: input.consentToContact,
    utm: input.utm ?? null,
    details: input.details ?? {},
    receptionistReason: classification.reason
  };

  try {
    const ownerEvent = await queryPostgres<{ id: string }>(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
        money_cents, risk_type, confidence_score, metadata_json
      )
      values ($1, 'ferocity', 'Ferocity', $2, 'lead.receptionist_intake', $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 'revenue', $12, $13::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
      set title = excluded.title,
          summary = excluded.summary,
          severity = excluded.severity,
          status = excluded.status,
          owner_attention = excluded.owner_attention,
          ai_handled = excluded.ai_handled,
          ai_summary = excluded.ai_summary,
          recommended_action = excluded.recommended_action,
          action_href = excluded.action_href,
          confidence_score = excluded.confidence_score,
          metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
          updated_at = now()
      returning id
      `,
      [
        tenantId,
        `public-lead:${leadId}`,
        title,
        summary,
        classification.severity,
        status,
        classification.ownerAttention,
        !classification.ownerAttention,
        classification.ownerAttention
          ? "AI captured the lead and found enough urgency to ask for owner review."
          : "AI captured the lead and queued it for normal follow-up.",
        classification.ownerAttention
          ? "Open Leads & Customers and approve the fastest useful follow-up."
          : "Review this in the next lead sweep or daily briefing.",
        actionHref,
        classification.ownerAttention ? 86 : 78,
        JSON.stringify(metadata)
      ]
    );

    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, brand_id, event_family, event_type, title, body, primary_entity_type, primary_entity_id, metadata_json
      )
      values ($1, $2, 'lead', 'lead.receptionist_intake', $3, $4, 'lead', $5, $6::jsonb)
      `,
      [tenantId, brandId, title, summary, leadId, JSON.stringify({ ...metadata, ownerEventId: ownerEvent?.rows[0]?.id ?? null })]
    );

    const preferences = await getPushNotificationPreferences(tenantId);
    if (
      classification.ownerAttention &&
      pushPreferencesAllowEvent({
        preferences,
        severity: classification.severity,
        status,
        ownerAttention: classification.ownerAttention,
        moneyCents: 0,
        riskType: "revenue"
      })
    ) {
      await sendWorkspacePushNotifications({
        tenantId,
        eventType: "lead.receptionist_intake",
        title,
        body: classification.ownerAttention ? summary : `New lead captured from ${sourceLabel(input)}.`,
        url: actionHref,
        tag: `lead-receptionist-${leadId}`,
        metadata: { ...metadata, ownerEventId: ownerEvent?.rows[0]?.id ?? null }
      });
    }
  } catch (error) {
    await logAppError({
      source: "lead_receptionist_event",
      message: error instanceof Error ? error.message : "Unable to record AI receptionist event.",
      severity: "warning",
      tenantId,
      metadata: { brandId, formId, leadId }
    });
  }
}

export async function createPublicLead(input: PublicLeadInput, requestMeta: { ipAddress?: string; userAgent?: string }) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return createPublicLeadWithPostgres(input, requestMeta);
  }

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, tenant_id, brand_id, active")
    .eq("public_key", input.formPublicKey)
    .maybeSingle<FormRecord>();

  if (formError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to resolve lead form."
    };
  }

  if (!form || !form.active) {
    return {
      ok: false,
      status: 404,
      error: "Lead form was not found."
    };
  }

  const limit = await checkLeadIntakeLimits(form.tenant_id);
  if (!limit.ok) {
    return {
      ok: false,
      status: limit.status,
      error: limit.error
    };
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      tenant_id: form.tenant_id,
      brand_id: form.brand_id,
      form_id: form.id,
      source: input.source ?? "website",
      source_detail: input.sourceDetail,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      lead_type: input.leadType,
      status: "new",
      qualification_status: input.leadType === "case_intake" ? "needs_review" : "unqualified",
      priority: input.leadType === "case_intake" ? "high" : "normal",
      consent_to_contact: input.consentToContact,
      metadata_json: {
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      }
    })
    .select("id")
    .single<LeadRecord>();

  if (leadError || !lead) {
    return {
      ok: false,
      status: 500,
      error: "Unable to create lead."
    };
  }

  await insertLeadDetails({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    leadType: input.leadType,
    details: input.details
  });
  await applyRevenueQualification({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    publicFormKey: input.formPublicKey,
    details: input.details
  });
  await applyReferralAttribution({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    details: input.details
  });

  const payload = {
    tenant_id: form.tenant_id,
    brand_id: form.brand_id,
    form_id: form.id,
    lead_id: lead.id,
    payload_json: {
      source: input.source,
      sourceDetail: input.sourceDetail,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      leadType: input.leadType,
      consentToContact: input.consentToContact,
      details: input.details,
      utm: input.utm,
      submittedAt: input.submittedAt ?? null
    },
    ip_address: requestMeta.ipAddress,
    user_agent: requestMeta.userAgent
  };

  await supabase.from("form_submissions").insert(payload);
  await supabase.from("lead_events").insert({
    tenant_id: form.tenant_id,
    brand_id: form.brand_id,
    lead_id: lead.id,
    type: "form_submission",
    body: "Lead captured from public form.",
    metadata_json: {
      source: input.source ?? "website",
      leadType: input.leadType,
      utm: input.utm
    }
  });

  await recordReceptionistLeadEvent({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    formId: form.id,
    leadId: lead.id,
    input
  });

  return {
    ok: true,
    status: 201,
    leadId: lead.id
  };
}

async function createPublicLeadWithPostgres(
  input: PublicLeadInput,
  requestMeta: { ipAddress?: string; userAgent?: string }
) {
  const formResult = await queryPostgres<FormRecord>(
    `
    select id, tenant_id, brand_id, active
    from public.forms
    where public_key = $1
    limit 1
    `,
    [input.formPublicKey]
  );
  const form = formResult?.rows[0];

  if (!form || !form.active) {
    return {
      ok: false,
      status: 404,
      error: "Lead form was not found."
    };
  }

  const limit = await checkLeadIntakeLimits(form.tenant_id);
  if (!limit.ok) {
    return {
      ok: false,
      status: limit.status,
      error: limit.error
    };
  }

  const leadResult = await queryPostgres<LeadRecord>(
    `
    insert into public.leads (
      tenant_id,
      brand_id,
      form_id,
      source,
      source_detail,
      name,
      email,
      phone,
      message,
      lead_type,
      status,
      qualification_status,
      priority,
      consent_to_contact,
      metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', $11, $12, $13, $14::jsonb)
    returning id
    `,
    [
      form.tenant_id,
      form.brand_id,
      form.id,
      input.source ?? "website",
      input.sourceDetail ?? null,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.message ?? null,
      input.leadType,
      input.leadType === "case_intake" ? "needs_review" : "unqualified",
      input.leadType === "case_intake" ? "high" : "normal",
      input.consentToContact,
      JSON.stringify({
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      })
    ]
  );
  const lead = leadResult?.rows[0];

  if (!lead) {
    return {
      ok: false,
      status: 500,
      error: "Unable to create lead."
    };
  }

  await insertLeadDetailsWithPostgres({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    leadType: input.leadType,
    details: input.details
  });
  await applyRevenueQualification({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    publicFormKey: input.formPublicKey,
    details: input.details
  });
  await applyReferralAttribution({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    details: input.details
  });

  await queryPostgres(
    `
    insert into public.form_submissions (
      tenant_id,
      brand_id,
      form_id,
      lead_id,
      payload_json,
      ip_address,
      user_agent
    )
    values ($1, $2, $3, $4, $5::jsonb, $6::inet, $7)
    `,
    [
      form.tenant_id,
      form.brand_id,
      form.id,
      lead.id,
      JSON.stringify({
        source: input.source,
        sourceDetail: input.sourceDetail,
        name: input.name,
        email: input.email,
        phone: input.phone,
        message: input.message,
        leadType: input.leadType,
        consentToContact: input.consentToContact,
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      }),
      requestMeta.ipAddress ?? null,
      requestMeta.userAgent ?? null
    ]
  );

  await queryPostgres(
    `
    insert into public.lead_events (
      tenant_id,
      brand_id,
      lead_id,
      type,
      body,
      metadata_json
    )
    values ($1, $2, $3, 'form_submission', 'Lead captured from public form.', $4::jsonb)
    `,
    [
      form.tenant_id,
      form.brand_id,
      lead.id,
      JSON.stringify({
        source: input.source ?? "website",
        leadType: input.leadType,
        utm: input.utm
      })
    ]
  );

  await recordReceptionistLeadEvent({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    formId: form.id,
    leadId: lead.id,
    input
  });

  return {
    ok: true,
    status: 201,
    leadId: lead.id
  };
}

async function insertLeadDetails({
  tenantId,
  brandId,
  leadId,
  leadType,
  details
}: {
  tenantId: string;
  brandId: string;
  leadId: string;
  leadType: PublicLeadInput["leadType"];
  details: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  if (leadType === "appointment" || leadType === "quote" || leadType === "general") {
    await supabase.from("local_service_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      service_interest: textDetail(details, "serviceInterest"),
      location: textDetail(details, "location"),
      appointment_window: textDetail(details, "appointmentWindow"),
      urgency: textDetail(details, "urgency")
    });
  }

  if (leadType === "rental_request") {
    await supabase.from("rental_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      rental_item_type: textDetail(details, "rentalItemType"),
      rental_start_date: dateDetail(details, "rentalStartDate"),
      rental_end_date: dateDetail(details, "rentalEndDate"),
      delivery_needed: boolDetail(details, "deliveryNeeded"),
      location: textDetail(details, "location")
    });
  }

  if (leadType === "demo") {
    await supabase.from("software_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      company_name: textDetail(details, "companyName"),
      role: textDetail(details, "role"),
      current_system: textDetail(details, "currentSystem"),
      units_managed: intDetail(details, "unitsManaged"),
      demo_requested: true
    });
  }

  if (leadType === "buyer" || leadType === "seller" || leadType === "bidder" || leadType === "consignor") {
    await supabase.from("marketplace_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      intent: leadType,
      asset_category: textDetail(details, "assetCategory"),
      estimated_value: numericDetail(details, "estimatedValue"),
      location: textDetail(details, "location")
    });
  }

  if (leadType === "case_intake") {
    await supabase.from("legal_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      case_type: textDetail(details, "caseType"),
      incident_date: dateDetail(details, "incidentDate"),
      state: textDetail(details, "state") ?? textDetail(details, "location"),
      injury_type: textDetail(details, "injuryType"),
      has_attorney: boolDetail(details, "hasAttorney"),
      treatment_received: boolDetail(details, "treatmentReceived"),
      legal_disclaimer_acknowledged: Boolean(details.legalDisclaimerAcknowledged)
    });
  }
}

async function insertLeadDetailsWithPostgres({
  tenantId,
  brandId,
  leadId,
  leadType,
  details
}: {
  tenantId: string;
  brandId: string;
  leadId: string;
  leadType: PublicLeadInput["leadType"];
  details: Record<string, unknown>;
}) {
  if (leadType === "appointment" || leadType === "quote" || leadType === "general") {
    await queryPostgres(
      `
      insert into public.local_service_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        service_interest,
        location,
        appointment_window,
        urgency
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "serviceInterest"),
        textDetail(details, "location"),
        textDetail(details, "appointmentWindow"),
        textDetail(details, "urgency")
      ]
    );
  }

  if (leadType === "rental_request") {
    await queryPostgres(
      `
      insert into public.rental_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        rental_item_type,
        rental_start_date,
        rental_end_date,
        delivery_needed,
        location
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "rentalItemType"),
        dateDetail(details, "rentalStartDate"),
        dateDetail(details, "rentalEndDate"),
        boolDetail(details, "deliveryNeeded"),
        textDetail(details, "location")
      ]
    );
  }

  if (leadType === "demo") {
    await queryPostgres(
      `
      insert into public.software_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        company_name,
        role,
        current_system,
        units_managed,
        demo_requested
      )
      values ($1, $2, $3, $4, $5, $6, $7, true)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "companyName"),
        textDetail(details, "role"),
        textDetail(details, "currentSystem"),
        intDetail(details, "unitsManaged")
      ]
    );
  }

  if (leadType === "buyer" || leadType === "seller" || leadType === "bidder" || leadType === "consignor") {
    await queryPostgres(
      `
      insert into public.marketplace_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        intent,
        asset_category,
        estimated_value,
        location
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        brandId,
        leadId,
        leadType,
        textDetail(details, "assetCategory"),
        numericDetail(details, "estimatedValue"),
        textDetail(details, "location")
      ]
    );
  }

  if (leadType === "case_intake") {
    await queryPostgres(
      `
      insert into public.legal_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        case_type,
        incident_date,
        state,
        injury_type,
        has_attorney,
        treatment_received,
        legal_disclaimer_acknowledged
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "caseType"),
        dateDetail(details, "incidentDate"),
        textDetail(details, "state") ?? textDetail(details, "location"),
        textDetail(details, "injuryType"),
        boolDetail(details, "hasAttorney"),
        boolDetail(details, "treatmentReceived"),
        Boolean(details.legalDisclaimerAcknowledged)
      ]
    );
  }
}
