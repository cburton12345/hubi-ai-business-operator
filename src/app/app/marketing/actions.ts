"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateWeeklyMarketingPlans } from "@/lib/ai/phase2-marketing-operator";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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

const managedServiceSchema = z.object({
  serviceKey: z.enum(["managed_local_seo", "managed_ads", "managed_creative", "managed_video_ads", "managed_review_growth", "managed_content", "managed_email_followup"]),
  monthlyBudgetCents: z.number().int().min(0).max(100000000),
  notes: z.string().max(1000).optional()
});

const managedServiceMeta: Record<
  z.infer<typeof managedServiceSchema>["serviceKey"],
  { name: string; family: "seo" | "ads" | "creative" | "video" | "reviews" | "content" | "email"; feeBps: number }
> = {
  managed_local_seo: { name: "Managed Local SEO", family: "seo", feeBps: 1500 },
  managed_ads: { name: "Managed Ads", family: "ads", feeBps: 1500 },
  managed_creative: { name: "Managed Ad Creative", family: "creative", feeBps: 1000 },
  managed_video_ads: { name: "Managed Video Ads", family: "video", feeBps: 1500 },
  managed_review_growth: { name: "Managed Review Growth", family: "reviews", feeBps: 1000 },
  managed_content: { name: "Managed Content", family: "content", feeBps: 1000 },
  managed_email_followup: { name: "Managed Email Follow-Up", family: "email", feeBps: 1000 }
};

export async function generateWeeklyMarketingPlansAction() {
  await requirePermission("ai:queue");

  await generateWeeklyMarketingPlans(await getCurrentWorkspaceId());
  revalidatePath("/app");
  revalidatePath("/app/marketing");
  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
}

export async function requestManagedMarketingServiceAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = managedServiceSchema.safeParse({
    serviceKey: formData.get("serviceKey"),
    monthlyBudgetCents: Number(formData.get("monthlyBudgetCents") ?? 0),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const meta = managedServiceMeta[parsed.data.serviceKey];

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.managed_service_programs (
      tenant_id, service_key, service_name, service_family, status, provider_ownership,
      monthly_budget_cents, management_fee_bps, approval_mode, live_spend_enabled,
      live_publishing_enabled, notes, metadata_json, created_by_user_id, updated_at
    )
    values (
      $1, $2, $3, $4, 'requested', 'ferocity_managed',
      $5, $6, 'approval_required', false, false, $7,
      jsonb_build_object(
        'plainStatus', 'Ferocity can plan and prepare this service. Live spend, publishing, and customer sends stay off until approved.',
        'requestedBy', $8::text
      ),
      nullif($9::text, '')::uuid,
      now()
    )
    on conflict (tenant_id, service_key) do update
    set status = case when public.managed_service_programs.status = 'cancelled' then 'requested' else public.managed_service_programs.status end,
        monthly_budget_cents = excluded.monthly_budget_cents,
        management_fee_bps = excluded.management_fee_bps,
        notes = excluded.notes,
        metadata_json = public.managed_service_programs.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id
    `,
    [
      workspaceId,
      parsed.data.serviceKey,
      meta.name,
      meta.family,
      parsed.data.monthlyBudgetCents,
      meta.feeBps,
      parsed.data.notes ?? "",
      actor.email,
      actor.userId === "admin-token" ? "" : actor.userId
    ]
  );

  const programId = result?.rows[0]?.id;
  if (programId) {
    await queryPostgres(
      `
      insert into public.managed_service_events (
        tenant_id, managed_service_program_id, event_type, event_status, amount_cents, metadata_json
      )
      values ($1, $2, 'managed_service_requested', 'needs_approval', $3, $4::jsonb)
      `,
      [
        workspaceId,
        programId,
        parsed.data.monthlyBudgetCents,
        JSON.stringify({
          serviceKey: parsed.data.serviceKey,
          serviceName: meta.name,
          approvalRequired: true,
          liveSpendEnabled: false,
          livePublishingEnabled: false
        })
      ]
    );
  }

  revalidatePath("/app/marketing");
  revalidatePath("/app/integrations");
  revalidatePath("/app/billing");
}

export async function updateCalendarItemAction(formData: FormData) {
  await requirePermission("approval:review_low");

  const parsed = calendarUpdateSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
    scheduledFor: formData.get("scheduledFor")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined
  });

  if (!parsed.success) return;

  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null;
  const publishedAt = parsed.data.status === "published" ? new Date().toISOString() : null;
  const workspaceId = await getCurrentWorkspaceId();
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
    [workspaceId, parsed.data.itemId, parsed.data.status, scheduledFor, publishedAt, parsed.data.notes ?? ""]
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
  await requirePermission("approval:review_low");

  const parsed = draftUpdateSchema.safeParse({
    draftId: formData.get("draftId"),
    title: formData.get("title"),
    body: formData.get("body"),
    status: formData.get("status"),
    notes: formData.get("notes")?.toString() || undefined
  });

  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();

  const result = await queryPostgres<{ tenant_id: string; brand_id: string }>(
    `
    update public.ai_drafts
    set title = $3, body = $4, status = $5, updated_at = now()
    where tenant_id = $1 and id = $2
    returning tenant_id, brand_id
    `,
    [workspaceId, parsed.data.draftId, parsed.data.title, parsed.data.body, parsed.data.status]
  );
  const draft = result?.rows[0];

  if (draft) {
    await queryPostgres(
      `
      insert into public.content_versions (
        tenant_id,
        brand_id,
        draft_id,
        version_number,
        title,
        body,
        status,
        created_by_user_id
      )
      values (
        $1,
        $2,
        $3,
        coalesce((select max(version_number) + 1 from public.content_versions where draft_id = $3), 1),
        $4,
        $5,
        $6,
        $7
      )
      on conflict (draft_id, version_number) do nothing
      `,
      [
        draft.tenant_id,
        draft.brand_id,
        parsed.data.draftId,
        parsed.data.title,
        parsed.data.body,
        parsed.data.status,
        session?.userId ?? null
      ]
    );

    if (parsed.data.notes) {
      await queryPostgres(
        `
        insert into public.content_comments (tenant_id, brand_id, draft_id, user_id, body)
        values ($1, $2, $3, $4, $5)
        `,
        [draft.tenant_id, draft.brand_id, parsed.data.draftId, session?.userId ?? null, parsed.data.notes]
      );
    }

    await queryPostgres(
      `
      insert into public.approval_audit_events (
        tenant_id,
        brand_id,
        target_type,
        target_id,
        action,
        user_id,
        metadata_json
      )
      values ($1, $2, 'ai_draft', $3, $4, $5, $6::jsonb)
      `,
      [
        draft.tenant_id,
        draft.brand_id,
        parsed.data.draftId,
        `ai_draft.${parsed.data.status}`,
        session?.userId ?? null,
        JSON.stringify({ status: parsed.data.status, notes: parsed.data.notes ?? "" })
      ]
    );

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
