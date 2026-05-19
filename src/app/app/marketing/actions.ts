"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateWeeklyMarketingPlans } from "@/lib/ai/phase2-marketing-operator";
import { queryPostgres } from "@/lib/db/postgres";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

const calendarUpdateSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(["draft", "scheduled", "approved", "published", "rejected", "upcoming"]),
  scheduledFor: z.string().optional(),
  notes: z.string().optional()
});

const draftUpdateSchema = z.object({
  draftId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  status: z.enum(["draft", "needs_review", "approved", "rejected", "published", "archived"]),
  notes: z.string().optional()
});

export async function generateWeeklyMarketingPlansAction() {
  await generateWeeklyMarketingPlans();
  revalidatePath("/app");
  revalidatePath("/app/marketing");
  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
}

export async function updateCalendarItemAction(formData: FormData) {
  const parsed = calendarUpdateSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
    scheduledFor: formData.get("scheduledFor")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined
  });

  if (!parsed.success) return;

  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null;
  const publishedAt = parsed.data.status === "published" ? new Date().toISOString() : null;
  const result = await queryPostgres<{ tenant_id: string; brand_id: string }>(
    `
    update public.marketing_calendar_items
    set status = $3,
        scheduled_for = coalesce($4::timestamptz, scheduled_for),
        published_at = case when $3 = 'published' then coalesce(published_at, $5::timestamptz) else published_at end,
        notes = $6,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning tenant_id, brand_id
    `,
    [internalTenantId, parsed.data.itemId, parsed.data.status, scheduledFor, publishedAt, parsed.data.notes ?? ""]
  );
  const item = result?.rows[0];

  if (item) {
    await queryPostgres(
      `
      insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
      values ($1, $2, 'user', $3, 'marketing_calendar_item', $4, $5::jsonb)
      `,
      [
        item.tenant_id,
        item.brand_id,
        `marketing_calendar.${parsed.data.status}`,
        parsed.data.itemId,
        JSON.stringify({ status: parsed.data.status, scheduledFor, notes: parsed.data.notes ?? "" })
      ]
    );
  }

  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
}

export async function updateDraftReviewAction(formData: FormData) {
  const parsed = draftUpdateSchema.safeParse({
    draftId: formData.get("draftId"),
    title: formData.get("title"),
    body: formData.get("body"),
    status: formData.get("status"),
    notes: formData.get("notes")?.toString() || undefined
  });

  if (!parsed.success) return;

  const result = await queryPostgres<{ tenant_id: string; brand_id: string }>(
    `
    update public.ai_drafts
    set title = $3, body = $4, status = $5, updated_at = now()
    where tenant_id = $1 and id = $2
    returning tenant_id, brand_id
    `,
    [internalTenantId, parsed.data.draftId, parsed.data.title, parsed.data.body, parsed.data.status]
  );
  const draft = result?.rows[0];

  if (draft) {
    await queryPostgres(
      `
      insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
      values ($1, $2, 'user', $3, 'ai_draft', $4, $5::jsonb)
      `,
      [
        draft.tenant_id,
        draft.brand_id,
        `ai_draft.${parsed.data.status}`,
        parsed.data.draftId,
        JSON.stringify({ status: parsed.data.status, notes: parsed.data.notes ?? "" })
      ]
    );
  }

  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/approvals");
}
