"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  draftId: z.string().min(1)
});

function exportTypeForDraft(contentType: string) {
  if (contentType === "google_ad") return "ad_copy";
  if (contentType === "facebook_post" || contentType === "gbp_post") return "social_post";
  if (contentType === "email" || contentType === "sms") return "lead_followup";
  if (contentType === "blog" || contentType === "landing_page") return "seo_brief";
  return "copy_package";
}

export async function createExportFromDraftAction(formData: FormData) {
  const parsed = schema.safeParse({ draftId: formData.get("draftId") });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const draftResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string;
    content_type: string;
    title: string;
    body: string;
    risk_level: string;
  }>(
    `
    select id, tenant_id, brand_id, content_type, title, body, risk_level
    from public.ai_drafts
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.draftId]
  );
  const draft = draftResult?.rows[0];
  if (!draft) return;

  await queryPostgres(
    `
    insert into public.content_exports (
      tenant_id,
      brand_id,
      draft_id,
      export_type,
      title,
      body,
      checklist_json,
      created_by_user_id
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `,
    [
      draft.tenant_id,
      draft.brand_id,
      draft.id,
      exportTypeForDraft(draft.content_type),
      draft.title,
      draft.body,
      JSON.stringify([
        "Review for brand accuracy",
        "Confirm offers, pricing, licensing, and claims before use",
        "Publish or send manually only"
      ]),
      session?.userId ?? null
    ]
  );

  revalidatePath("/app/exports");
  revalidatePath("/app/review");
}
