"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateWeeklyMarketingPlans } from "@/lib/ai/phase2-marketing-operator";
import { queryPostgres } from "@/lib/db/postgres";

const schema = z.object({
  workspaceSlug: z.string().min(1)
});

export async function generateWorkspaceMarketingPlanAction(formData: FormData) {
  const parsed = schema.safeParse({
    workspaceSlug: formData.get("workspaceSlug")
  });

  if (!parsed.success) return;

  const workspaceResult = await queryPostgres<{ id: string; slug: string }>(
    `
    select id, slug
    from public.tenants
    where slug = $1
    limit 1
    `,
    [parsed.data.workspaceSlug]
  );
  const workspace = workspaceResult?.rows[0];

  if (!workspace) return;

  await generateWeeklyMarketingPlans(workspace.id);
  revalidatePath(`/app/tenant/${workspace.slug}`);
  revalidatePath("/app/marketing");
  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
}
