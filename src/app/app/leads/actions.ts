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

function scoreLead(input: {
  status: string;
  qualificationStatus: string;
  priority: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  consentToContact: boolean;
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
  }>(
    `
    select tenant_id, brand_id, status, qualification_status, priority, email, phone, message, consent_to_contact
    from public.leads
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, leadId]
  );
  const lead = leadResult?.rows[0];
  if (!lead) return;

  const scored = scoreLead({
    status: lead.status,
    qualificationStatus: lead.qualification_status,
    priority: lead.priority,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    consentToContact: lead.consent_to_contact
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
