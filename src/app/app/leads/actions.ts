"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateLeadIntelligence } from "@/lib/ai/lead-intelligence";
import { requirePermission } from "@/lib/auth/require-permission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import { leadPriorities, leadStatuses, qualificationStatuses } from "@/lib/leads/constants";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const statusUpdateSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(leadStatuses),
  qualificationStatus: z.enum(qualificationStatuses),
  priority: z.enum(leadPriorities),
  note: z.string().max(1000).optional()
});

const assignmentSchema = z.object({
  leadId: z.string().min(1),
  assigneeEmail: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(1000).optional()
});

const convertLeadSchema = z.object({
  leadId: z.string().min(1),
  createEstimate: z.boolean().default(false),
  createJob: z.boolean().default(false)
});

const legalQualificationSchema = z.object({
  leadId: z.string().min(1),
  note: z.string().max(1000).optional()
});

const routingReviewSchema = z.object({
  leadId: z.string().min(1),
  suggestedBuyerProfile: z.string().max(600).optional(),
  routingNotes: z.string().max(1000).optional()
});

function scoreLead(input: {
  status: string;
  qualificationStatus: string;
  priority: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  consentToContact: boolean;
  legal?: {
    hasAttorney: boolean | null;
    treatmentReceived: boolean | null;
    disclaimerAcknowledged: boolean;
    incidentDate: Date | null;
  };
}) {
  let score = 20;
  const reasons: string[] = [];

  if (input.email) {
    score += 10;
    reasons.push("Email provided");
  }
  if (input.phone) {
    score += 15;
    reasons.push("Phone provided");
  }
  if (input.message && input.message.length > 40) {
    score += 15;
    reasons.push("Detailed message");
  }
  if (input.consentToContact) {
    score += 10;
    reasons.push("Consent captured");
  }
  if (input.priority === "high") {
    score += 15;
    reasons.push("High priority");
  }
  if (input.qualificationStatus === "qualified") {
    score += 15;
    reasons.push("Qualified status");
  }
  if (input.legal) {
    if (input.legal.disclaimerAcknowledged) {
      score += 10;
      reasons.push("Legal disclaimer acknowledged");
    }
    if (input.legal.treatmentReceived) {
      score += 15;
      reasons.push("Treatment received");
    }
    if (input.legal.hasAttorney === false) {
      score += 10;
      reasons.push("No attorney reported");
    }
    if (input.legal.incidentDate) {
      const ageDays = (Date.now() - input.legal.incidentDate.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays >= 0 && ageDays <= 730) {
        score += 10;
        reasons.push("Incident date is within review window");
      }
    }
  }
  if (input.status === "spam") {
    score = 5;
    reasons.push("Marked as spam");
  }

  const bounded = Math.max(0, Math.min(100, score));
  const grade = input.status === "spam" ? "spam_review" : bounded >= 75 ? "hot" : bounded >= 45 ? "warm" : "cold";
  return { score: bounded, grade, reasons };
}

export async function updateLeadWorkflow(formData: FormData) {
  await requirePermission("lead:manage");

  const parsed = statusUpdateSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    qualificationStatus: formData.get("qualificationStatus"),
    priority: formData.get("priority"),
    note: formData.get("note") || undefined
  });

  if (!parsed.success) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  const { leadId, status, qualificationStatus, priority, note } = parsed.data;

  if (!supabase) {
    const leadResult = await queryPostgres<{ tenant_id: string; brand_id: string }>(
      `
      update public.leads
      set status = $3, qualification_status = $4, priority = $5, updated_at = now()
      where tenant_id = $1 and id = $2
      returning tenant_id, brand_id
      `,
      [workspaceId, leadId, status, qualificationStatus, priority]
    );
    const lead = leadResult?.rows[0];

    if (!lead) {
      return;
    }

    await queryPostgres(
      `
      insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
      values ($1, $2, $3, 'status_change', $4, $5::jsonb)
      `,
      [
        lead.tenant_id,
        lead.brand_id,
        leadId,
        note || `Lead updated to ${status} / ${qualificationStatus} / ${priority}.`,
        JSON.stringify({ status, qualificationStatus, priority })
      ]
    );

    await queryPostgres(
      `
      insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
      values ($1, $2, 'user', 'lead.workflow_updated', 'lead', $3, $4::jsonb)
      `,
      [lead.tenant_id, lead.brand_id, leadId, JSON.stringify({ status, qualificationStatus, priority })]
    );

    revalidatePath("/app/leads");
    revalidatePath(`/app/leads/${leadId}`);
    return;
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .update({
      status,
      qualification_status: qualificationStatus,
      priority,
      updated_at: new Date().toISOString()
    })
    .eq("tenant_id", workspaceId)
    .eq("id", leadId)
    .select("tenant_id, brand_id")
    .single<{ tenant_id: string; brand_id: string }>();

  if (leadError || !lead) {
    return;
  }

  await supabase.from("lead_events").insert({
    tenant_id: lead.tenant_id,
    brand_id: lead.brand_id,
    lead_id: leadId,
    type: "status_change",
    body: note || `Lead updated to ${status} / ${qualificationStatus} / ${priority}.`,
    metadata_json: {
      status,
      qualificationStatus,
      priority
    }
  });

  await supabase.from("activity_logs").insert({
    tenant_id: lead.tenant_id,
    brand_id: lead.brand_id,
    actor_type: "user",
    action: "lead.workflow_updated",
    target_type: "lead",
    target_id: leadId,
    metadata_json: {
      status,
      qualificationStatus,
      priority
    }
  });

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${leadId}`);

  return;
}

export async function generateLeadIntelligenceAction(formData: FormData) {
  await requirePermission("lead:manage");

  const leadId = formData.get("leadId")?.toString();
  if (!leadId) return;

  await generateLeadIntelligence(leadId);
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app");
}

export async function calculateLeadScoreAction(formData: FormData) {
  await requirePermission("lead:manage");
  const leadId = formData.get("leadId")?.toString();
  if (!leadId) return;

  const workspaceId = await getCurrentWorkspaceId();
  const leadResult = await queryPostgres<{
    tenant_id: string;
    brand_id: string;
    status: string;
    qualification_status: string;
    priority: string;
    email: string | null;
    phone: string | null;
    message: string | null;
    consent_to_contact: boolean;
    lead_type: string;
  }>(
    `
    select tenant_id, brand_id, status, qualification_status, priority, email, phone, message, consent_to_contact, lead_type
    from public.leads
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead) return;
  const legalResult =
    lead.lead_type === "case_intake"
      ? await queryPostgres<{
          has_attorney: boolean | null;
          treatment_received: boolean | null;
          legal_disclaimer_acknowledged: boolean;
          incident_date: Date | null;
        }>(
          `
          select has_attorney, treatment_received, legal_disclaimer_acknowledged, incident_date
          from public.legal_lead_details
          where tenant_id = $1 and lead_id = $2
          limit 1
          `,
          [workspaceId, leadId]
        )
      : null;
  const legal = legalResult?.rows[0];

  const scored = scoreLead({
    status: lead.status,
    qualificationStatus: lead.qualification_status,
    priority: lead.priority,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    consentToContact: lead.consent_to_contact,
    legal: legal
      ? {
          hasAttorney: legal.has_attorney,
          treatmentReceived: legal.treatment_received,
          disclaimerAcknowledged: legal.legal_disclaimer_acknowledged,
          incidentDate: legal.incident_date
        }
      : undefined
  });

  await queryPostgres(
    `
    insert into public.lead_scores (tenant_id, brand_id, lead_id, score, grade, reasons_json, updated_at)
    values ($1, $2, $3, $4, $5, $6::jsonb, now())
    on conflict (lead_id) do update
    set score = excluded.score,
        grade = excluded.grade,
        reasons_json = excluded.reasons_json,
        updated_at = now()
    `,
    [lead.tenant_id, lead.brand_id, leadId, scored.score, scored.grade, JSON.stringify(scored.reasons)]
  );

  await queryPostgres(
    "insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json) values ($1, $2, $3, 'score_updated', $4, $5::jsonb)",
    [lead.tenant_id, lead.brand_id, leadId, `Lead score updated to ${scored.score} (${scored.grade}).`, JSON.stringify(scored)]
  );

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${leadId}`);
}

export async function qualifyLegalLeadAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = legalQualificationSchema.safeParse({
    leadId: formData.get("leadId"),
    note: String(formData.get("note") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const leadResult = await queryPostgres<{
    tenant_id: string;
    brand_id: string;
    lead_type: string;
    consent_to_contact: boolean;
    email: string | null;
    phone: string | null;
    message: string | null;
    status: string;
  }>(
    `
    select tenant_id, brand_id, lead_type, consent_to_contact, email, phone, message, status
    from public.leads
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead || lead.lead_type !== "case_intake") return;

  const detailsResult = await queryPostgres<{
    has_attorney: boolean | null;
    treatment_received: boolean | null;
    legal_disclaimer_acknowledged: boolean;
    incident_date: Date | null;
  }>(
    `
    select has_attorney, treatment_received, legal_disclaimer_acknowledged, incident_date
    from public.legal_lead_details
    where tenant_id = $1 and lead_id = $2
    limit 1
    `,
    [workspaceId, parsed.data.leadId]
  );
  const details = detailsResult?.rows[0];
  if (!details) return;

  const needsReview = !details.legal_disclaimer_acknowledged || details.has_attorney === true;
  const qualified = details.legal_disclaimer_acknowledged && details.has_attorney !== true && details.treatment_received === true;
  const qualificationStatus = qualified ? "qualified" : needsReview ? "needs_review" : "unqualified";
  const priority = qualified ? "high" : needsReview ? "normal" : "low";
  const status = lead.status === "new" ? "contacted" : lead.status;
  const scored = scoreLead({
    status,
    qualificationStatus,
    priority,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    consentToContact: lead.consent_to_contact,
    legal: {
      hasAttorney: details.has_attorney,
      treatmentReceived: details.treatment_received,
      disclaimerAcknowledged: details.legal_disclaimer_acknowledged,
      incidentDate: details.incident_date
    }
  });

  await queryPostgres(
    `
    update public.leads
    set qualification_status = $3,
        priority = $4,
        status = $5,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.leadId, qualificationStatus, priority, status]
  );
  await queryPostgres(
    `
    insert into public.lead_scores (tenant_id, brand_id, lead_id, score, grade, reasons_json, updated_at)
    values ($1, $2, $3, $4, $5, $6::jsonb, now())
    on conflict (lead_id) do update
    set score = excluded.score,
        grade = excluded.grade,
        reasons_json = excluded.reasons_json,
        updated_at = now()
    `,
    [lead.tenant_id, lead.brand_id, parsed.data.leadId, scored.score, scored.grade, JSON.stringify(scored.reasons)]
  );
  await queryPostgres(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'qualification', $4, $5::jsonb)
    `,
    [
      lead.tenant_id,
      lead.brand_id,
      parsed.data.leadId,
      parsed.data.note || `Legal lead reviewed as ${qualificationStatus} with ${priority} priority. Manual approval required before any external routing.`,
      JSON.stringify({ qualificationStatus, priority, score: scored.score, reasons: scored.reasons })
    ]
  );
  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${parsed.data.leadId}`);
}

export async function createLegalRoutingReviewAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = routingReviewSchema.safeParse({
    leadId: formData.get("leadId"),
    suggestedBuyerProfile: String(formData.get("suggestedBuyerProfile") ?? ""),
    routingNotes: String(formData.get("routingNotes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const leadResult = await queryPostgres<{ tenant_id: string; brand_id: string; lead_type: string }>(
    "select tenant_id, brand_id, lead_type from public.leads where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead || lead.lead_type !== "case_intake") return;

  await queryPostgres(
    `
    insert into public.lead_routing_reviews (
      tenant_id,
      brand_id,
      lead_id,
      routing_type,
      status,
      suggested_buyer_profile,
      routing_notes,
      approval_required
    )
    values ($1, $2, $3, 'legal_buyer_review', 'needs_approval', $4, $5, true)
    on conflict (tenant_id, lead_id, routing_type) do update
    set status = 'needs_approval',
        suggested_buyer_profile = excluded.suggested_buyer_profile,
        routing_notes = excluded.routing_notes,
        approval_required = true,
        updated_at = now()
    `,
    [
      lead.tenant_id,
      lead.brand_id,
      parsed.data.leadId,
      parsed.data.suggestedBuyerProfile?.trim() || null,
      parsed.data.routingNotes?.trim() || "Manual approval required before any external legal lead routing."
    ]
  );
  await queryPostgres(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'qualification', $4, $5::jsonb)
    `,
    [
      lead.tenant_id,
      lead.brand_id,
      parsed.data.leadId,
      "Legal routing review prepared. Manual approval is required before external routing.",
      JSON.stringify({
        suggestedBuyerProfile: parsed.data.suggestedBuyerProfile ?? "",
        routingNotes: parsed.data.routingNotes ?? "",
        approvalRequired: true
      })
    ]
  );
  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${parsed.data.leadId}`);
}

export async function assignLeadAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = assignmentSchema.safeParse({
    leadId: formData.get("leadId"),
    assigneeEmail: formData.get("assigneeEmail") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const leadResult = await queryPostgres<{ tenant_id: string; brand_id: string }>(
    "select tenant_id, brand_id from public.leads where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead) return;

  const userResult = parsed.data.assigneeEmail
    ? await queryPostgres<{ id: string }>(
        `
        select u.id
        from public.users u
        join public.tenant_users tu on tu.user_id = u.id
        where tu.tenant_id = $1 and lower(u.email) = lower($2) and tu.status = 'active'
        limit 1
        `,
        [workspaceId, parsed.data.assigneeEmail]
      )
    : null;
  const userId = userResult?.rows[0]?.id ?? null;

  await queryPostgres("update public.lead_assignments set status = 'completed', updated_at = now() where tenant_id = $1 and lead_id = $2 and status = 'active'", [
    workspaceId,
    parsed.data.leadId
  ]);
  await queryPostgres(
    `
    insert into public.lead_assignments (tenant_id, brand_id, lead_id, assigned_user_id, notes)
    values ($1, $2, $3, $4, $5)
    `,
    [lead.tenant_id, lead.brand_id, parsed.data.leadId, userId, parsed.data.notes ?? ""]
  );
  await queryPostgres(
    "insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json) values ($1, $2, $3, 'assignment', $4, $5::jsonb)",
    [
      lead.tenant_id,
      lead.brand_id,
      parsed.data.leadId,
      userId ? `Lead assigned to ${parsed.data.assigneeEmail}.` : "Lead assignment updated without a matching workspace user.",
      JSON.stringify({ assigneeEmail: parsed.data.assigneeEmail, notes: parsed.data.notes ?? "" })
    ]
  );

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${parsed.data.leadId}`);
}

export async function convertLeadToServiceCustomerAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = convertLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    createEstimate: formData.get("createEstimate") === "on",
    createJob: formData.get("createJob") === "on"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const leadResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    lead_type: string;
    metadata_json: { details?: Record<string, unknown> } | null;
  }>(
    `
    select id, tenant_id, brand_id, name, email, phone, message, lead_type, metadata_json
    from public.leads
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead) return;

  const details = lead.metadata_json?.details ?? {};
  const location = typeof details.location === "string" ? details.location : "";
  const existingCustomer = await queryPostgres<{ id: string }>(
    "select id from public.customers where tenant_id = $1 and source_lead_id = $2 limit 1",
    [workspaceId, lead.id]
  );
  let customerId = existingCustomer?.rows[0]?.id;

  if (!customerId) {
    const customerResult = await queryPostgres<{ id: string }>(
      `
      insert into public.customers (tenant_id, brand_id, source_lead_id, name, email, phone, city, notes, ai_summary)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id
      `,
      [
        lead.tenant_id,
        lead.brand_id,
        lead.id,
        lead.name ?? "Unknown customer",
        lead.email,
        lead.phone,
        location || null,
        lead.message,
        `Created from ${lead.lead_type} lead. Review contact details, service need, and next action before sending any customer message.`
      ]
    );
    customerId = customerResult?.rows[0]?.id;
  }

  if (!customerId) return;

  if (parsed.data.createEstimate) {
    const estimateResult = await queryPostgres<{ id: string }>(
      `
      insert into public.service_estimates (tenant_id, brand_id, customer_id, source_lead_id, title, customer_summary, internal_notes, manual_follow_up_draft)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning id
      `,
      [
        lead.tenant_id,
        lead.brand_id,
        customerId,
        lead.id,
        `${lead.name ?? "Customer"} estimate draft`,
        "Estimate draft created from lead intake. Add line items and confirm scope before sending manually.",
        lead.message,
        "Hi, thanks for reaching out. I am preparing an estimate based on your request and will confirm the details before anything is finalized."
      ]
    );
    const estimate = estimateResult?.rows[0];
    if (estimate) {
      await queryPostgres(
        `
        insert into public.estimate_line_items (tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents)
        values ($1, $2, 'Scope review', 'Placeholder line item. Replace with real pricing before sharing.', 1, 0, 0)
        `,
        [lead.tenant_id, estimate.id]
      );
    }
  }

  if (parsed.data.createJob) {
    await queryPostgres(
      `
      insert into public.service_jobs (tenant_id, brand_id, customer_id, source_lead_id, title, status, service_area, dispatcher_notes, ai_next_action)
      values ($1, $2, $3, $4, $5, 'unscheduled', $6, $7, $8)
      `,
      [
        lead.tenant_id,
        lead.brand_id,
        customerId,
        lead.id,
        `${lead.name ?? "Customer"} service job`,
        location || null,
        lead.message,
        "Schedule the job, assign a team member, and confirm service details manually."
      ]
    );
  }

  await queryPostgres(
    `
    update public.leads
    set qualification_status = 'qualified',
        status = case when status = 'new' then 'contacted' else status end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, lead.id]
  );
  await queryPostgres(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'qualification', $4, $5::jsonb)
    `,
    [
      lead.tenant_id,
      lead.brand_id,
      lead.id,
      "Lead converted into a service customer record.",
      JSON.stringify({ customerId, createEstimate: parsed.data.createEstimate, createJob: parsed.data.createJob })
    ]
  );

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${lead.id}`);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/customers/${customerId}`);
}
