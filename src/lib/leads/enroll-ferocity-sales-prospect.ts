import "server-only";

import { queryPostgres } from "@/lib/db/postgres";
import { buildFerocitySalesFollowUpPlan } from "@/lib/leads/ferocity-sales-followup-plan";
import type { PublicLeadInput } from "@/lib/leads/schemas";

export async function enrollFerocitySalesProspect(input: {
  tenantId: string;
  brandId: string;
  leadId: string;
  lead: PublicLeadInput;
}) {
  if (!input.lead.consentToContact || (!input.lead.email && !input.lead.phone)) return { enrolled: 0 };

  const channel = input.lead.email ? "email" : "sms";
  const sessionId = typeof input.lead.details?.chatSessionId === "string" ? input.lead.details.chatSessionId : null;
  let enrolled = 0;

  for (const step of buildFerocitySalesFollowUpPlan(input.lead)) {
    const result = await queryPostgres<{ id: string }>(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at,
        ai_suggested_message, metadata_json
      )
      select $1, $2, $3, $4, $5, 'scheduled', now() + make_interval(hours => $6), $7, $8::jsonb
      where not exists (
        select 1
        from public.follow_up_workflows existing
        where existing.tenant_id = $1
          and existing.lead_id = $3
          and existing.metadata_json->>'salesMotion' = 'ferocity_self_growth'
          and existing.metadata_json->>'sequenceStep' = $9
      )
      returning id
      `,
      [
        input.tenantId,
        input.brandId,
        input.leadId,
        step.workflowType,
        channel,
        step.delayHours,
        step.message,
        JSON.stringify({
          createdByAgent: "ferocity_self_growth",
          salesMotion: "ferocity_self_growth",
          sequenceStep: step.step,
          stopOnReply: true,
          contactConsentCaptured: true,
          liveCustomerSend: true,
          executionAuthority: "workspace_policy",
          chatSessionId: sessionId,
          sourceDetail: input.lead.sourceDetail ?? null,
          objective: "convert_ferocity_prospect"
        }),
        String(step.step)
      ]
    );
    enrolled += result?.rows[0] ? 1 : 0;
  }

  return { enrolled };
}
