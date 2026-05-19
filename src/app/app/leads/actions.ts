"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import { leadPriorities, leadStatuses, qualificationStatuses } from "@/lib/leads/constants";

const statusUpdateSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(leadStatuses),
  qualificationStatus: z.enum(qualificationStatuses),
  priority: z.enum(leadPriorities),
  note: z.string().max(1000).optional()
});

export async function updateLeadWorkflow(formData: FormData) {
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

  const { leadId, status, qualificationStatus, priority, note } = parsed.data;

  if (!supabase) {
    const leadResult = await queryPostgres<{ tenant_id: string; brand_id: string }>(
      `
      update public.leads
      set status = $3, qualification_status = $4, priority = $5, updated_at = now()
      where tenant_id = $1 and id = $2
      returning tenant_id, brand_id
      `,
      ["11111111-1111-4111-8111-111111111111", leadId, status, qualificationStatus, priority]
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
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
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
