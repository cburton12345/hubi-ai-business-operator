"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { leadStatuses, qualificationStatuses } from "@/lib/leads/constants";

const statusUpdateSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(leadStatuses),
  qualificationStatus: z.enum(qualificationStatuses),
  note: z.string().max(1000).optional()
});

export async function updateLeadWorkflow(formData: FormData) {
  const parsed = statusUpdateSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    qualificationStatus: formData.get("qualificationStatus"),
    note: formData.get("note") || undefined
  });

  if (!parsed.success) {
    return;
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const { leadId, status, qualificationStatus, note } = parsed.data;

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .update({
      status,
      qualification_status: qualificationStatus,
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
    body: note || `Lead updated to ${status} / ${qualificationStatus}.`,
    metadata_json: {
      status,
      qualificationStatus
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
      qualificationStatus
    }
  });

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${leadId}`);

  return;
}
