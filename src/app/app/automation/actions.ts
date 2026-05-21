"use server";

import { revalidatePath } from "next/cache";
import { processQueuedAiTasks } from "@/lib/ai/process-queued-tasks";
import { queueWeeklyAiTasks } from "@/lib/ai/queue-weekly-tasks";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function runMarketingAutomationAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();

  const queued = await queueWeeklyAiTasks(workspaceId);
  const processed = await processQueuedAiTasks(workspaceId, 50);
  const rules = await queryPostgres<{
    id: string;
    brand_id: string;
    automation_type: string;
    cadence: string;
  }>(
    `
    select id, brand_id, automation_type, cadence
    from public.marketing_automation_rules
    where tenant_id = $1 and status = 'active'
    order by automation_type
    `,
    [workspaceId]
  );

  for (const rule of rules?.rows ?? []) {
    await queryPostgres(
      `
      insert into public.marketing_automation_runs (
        tenant_id,
        brand_id,
        rule_id,
        automation_type,
        status,
        summary,
        metadata_json
      )
      values ($1, $2, $3, $4, 'generated', $5, $6::jsonb)
      `,
      [
        workspaceId,
        rule.brand_id,
        rule.id,
        rule.automation_type,
        "Automation run created draft/review work only. No publishing, sending, budget, or external platform action was taken.",
        JSON.stringify({
          cadence: rule.cadence,
          queued,
          processed
        })
      ]
    );

    await queryPostgres(
      `
      update public.marketing_automation_rules
      set last_run_at = now(),
          next_run_at = case
            when cadence = 'weekly' then now() + interval '7 days'
            when cadence = 'biweekly' then now() + interval '14 days'
            when cadence = 'monthly' then now() + interval '1 month'
            else null
          end,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, rule.id]
    );
  }

  revalidatePath("/app/automation");
  revalidatePath("/app/tasks");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
  revalidatePath("/app/reports");
}
