"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateWeeklyMarketingPlans } from "@/lib/ai/phase2-marketing-operator";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { analyzeProviderPromotion, resolvePromotionSafetyBoundaries } from "@/lib/marketing-os/provider-promotions";
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

const promotionSchema = z.object({
  providerKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9_:-]+$/),
  laneKey: z.enum(["customer_owned", "ferocity_managed"]),
  title: z.string().trim().min(3).max(160),
  offerSource: z.enum(["business_profile", "provider_dashboard", "email", "representative", "other"]),
  offerUrl: z.union([z.literal(""), z.string().url().refine((value) => new URL(value).protocol === "https:")]),
  creditAmount: z.coerce.number().positive().max(1_000_000),
  requiredSpendAmount: z.coerce.number().positive().max(5_000_000),
  plannedSpendAmount: z.coerce.number().min(0).max(5_000_000),
  claimDeadline: z.union([z.literal(""), z.string().date()]),
  qualifyingPeriodEndsAt: z.union([z.literal(""), z.string().date()]),
  creditExpiresAt: z.union([z.literal(""), z.string().date()]),
  newAccountOnly: z.boolean(),
  termsSummary: z.string().trim().max(3000)
});

const promotionApprovalSchema = z.object({
  promotionId: z.string().uuid(),
  customBudgetAmount: z.union([z.literal(""), z.coerce.number().positive().max(5_000_000)]),
  customDailyLimitAmount: z.union([z.literal(""), z.coerce.number().positive().max(1_000_000)])
});

const promotionProgressSchema = z.object({
  promotionId: z.string().uuid(),
  qualifyingSpendAmount: z.coerce.number().min(0).max(5_000_000)
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

export async function captureProviderPromotionAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = promotionSchema.safeParse({
    providerKey: formData.get("providerKey"),
    laneKey: formData.get("laneKey"),
    title: formData.get("title"),
    offerSource: formData.get("offerSource"),
    offerUrl: String(formData.get("offerUrl") ?? "").trim(),
    creditAmount: formData.get("creditAmount"),
    requiredSpendAmount: formData.get("requiredSpendAmount"),
    plannedSpendAmount: formData.get("plannedSpendAmount"),
    claimDeadline: formData.get("claimDeadline") ?? "",
    qualifyingPeriodEndsAt: formData.get("qualifyingPeriodEndsAt") ?? "",
    creditExpiresAt: formData.get("creditExpiresAt") ?? "",
    newAccountOnly: formData.get("newAccountOnly") === "on",
    termsSummary: formData.get("termsSummary") ?? ""
  });
  if (!parsed.success) redirect("/app/marketing?promotion=invalid");

  const workspaceId = await getCurrentWorkspaceId();
  const value = parsed.data;
  const creditCents = Math.round(value.creditAmount * 100);
  const requiredSpendCents = Math.round(value.requiredSpendAmount * 100);
  const plannedSpendCents = Math.round(value.plannedSpendAmount * 100);
  const analysis = analyzeProviderPromotion({
    creditCents,
    requiredSpendCents,
    plannedSpendWithoutOfferCents: plannedSpendCents,
    claimDeadline: value.claimDeadline || null,
    qualifyingPeriodEndsAt: value.qualifyingPeriodEndsAt || null
  });
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.provider_promotion_opportunities (
      tenant_id, provider_key, lane_key, title, offer_source, offer_url,
      credit_cents, required_spend_cents, planned_spend_without_offer_cents,
      claim_deadline, qualifying_period_ends_at, credit_expires_at, new_account_only,
      terms_summary, status, recommendation, recommendation_reason,
      incremental_spend_cents, conservative_net_value_cents, required_daily_spend_cents,
      metadata_json
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12::timestamptz,$13,
      $14,'recommended',$15,$16,$17,$18,$19,$20::jsonb
    ) returning id
    `,
    [
      workspaceId,
      value.providerKey,
      value.laneKey,
      value.title,
      value.offerSource,
      value.offerUrl || null,
      creditCents,
      requiredSpendCents,
      plannedSpendCents,
      value.claimDeadline || null,
      value.qualifyingPeriodEndsAt || null,
      value.creditExpiresAt || null,
      value.newAccountOnly,
      value.termsSummary,
      analysis.recommendation,
      analysis.reason,
      analysis.incrementalSpendCents,
      analysis.conservativeNetValueCents,
      analysis.requiredDailySpendCents,
      JSON.stringify({ analyzedAt: new Date().toISOString(), capturedBy: actor.email, noProviderAction: true })
    ]
  );
  const promotionId = result?.rows[0]?.id;
  if (promotionId) {
    await queryPostgres(
      `
      insert into public.provider_promotion_events (tenant_id, promotion_id, event_type, actor_user_id, metadata_json)
      values
        ($1,$2,'captured',$3,$4::jsonb),
        ($1,$2,'analyzed',$3,$5::jsonb)
      `,
      [
        workspaceId,
        promotionId,
        actorUserId,
        JSON.stringify({ source: value.offerSource, noProviderAction: true }),
        JSON.stringify({ recommendation: analysis.recommendation, reason: analysis.reason })
      ]
    );
  }
  revalidatePath("/app/marketing");
  redirect("/app/marketing?promotion=saved");
}

export async function approveProviderPromotionAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = promotionApprovalSchema.safeParse({
    promotionId: formData.get("promotionId"),
    customBudgetAmount: String(formData.get("customBudgetAmount") ?? "").trim(),
    customDailyLimitAmount: String(formData.get("customDailyLimitAmount") ?? "").trim()
  });
  if (!parsed.success) redirect("/app/marketing?promotion=invalid_approval");
  const workspaceId = await getCurrentWorkspaceId();
  const promotion = await queryPostgres<{
    provider_key: string;
    lane_key: "customer_owned" | "ferocity_managed";
    required_spend_cents: number;
    required_daily_spend_cents: number;
  }>(
    `select provider_key, lane_key, required_spend_cents, required_daily_spend_cents
     from public.provider_promotion_opportunities
     where id=$1 and tenant_id=$2 and status='recommended' and recommendation <> 'skip'
     limit 1`,
    [parsed.data.promotionId, workspaceId]
  );
  const row = promotion?.rows[0];
  if (!row) redirect("/app/marketing?promotion=invalid_approval");
  const requiredSpendCents = Number(row.required_spend_cents);
  let approvedBudgetCents: number;
  let approvedDailyCapCents: number;
  try {
    const boundaries = resolvePromotionSafetyBoundaries({
      requiredSpendCents,
      requiredDailySpendCents: Number(row.required_daily_spend_cents),
      customBudgetCents: parsed.data.customBudgetAmount === "" ? null : parsed.data.customBudgetAmount * 100,
      customDailyLimitCents: parsed.data.customDailyLimitAmount === "" ? null : parsed.data.customDailyLimitAmount * 100
    });
    approvedBudgetCents = boundaries.budgetCents;
    approvedDailyCapCents = boundaries.dailyCents;
  } catch {
    redirect("/app/marketing?promotion=invalid_approval");
  }

  const control = await queryPostgres<{ id: string; daily_cap_cents: number; monthly_cap_cents: number }>(
    `
    insert into public.managed_ad_budget_controls (
      tenant_id, provider_key, lane_key, status, prepaid_required, approved_by_customer,
      live_spend_enabled, daily_cap_cents, monthly_cap_cents, stop_loss_cents, notes, metadata_json
    ) values (
      $1,$2,$3,'not_ready',$4,false,false,$5,$6,$6,
      'Promotion budget captured. Live spend remains off until provider readiness and final campaign authorization pass.',
      jsonb_build_object('promotionId',$7::text,'promotionApproved',true,'liveSpendEnabled',false)
    )
    on conflict (tenant_id, provider_key, lane_key) do update
    set metadata_json = public.managed_ad_budget_controls.metadata_json || excluded.metadata_json,
        notes = excluded.notes,
        updated_at = now()
    returning id, daily_cap_cents, monthly_cap_cents
    `,
    [workspaceId, row.provider_key, row.lane_key, row.lane_key === "ferocity_managed", approvedDailyCapCents, approvedBudgetCents, parsed.data.promotionId]
  );
  const controlRow = control?.rows[0];
  if (!controlRow) redirect("/app/marketing?promotion=save_failed");
  const controlId = controlRow.id;
  const effectiveBudgetCents = Math.min(approvedBudgetCents, Number(controlRow.monthly_cap_cents));
  const effectiveDailyCapCents = Math.min(approvedDailyCapCents, Number(controlRow.daily_cap_cents));
  if (effectiveBudgetCents < Number(row.required_spend_cents) || effectiveDailyCapCents <= 0) {
    redirect("/app/marketing?promotion=budget_conflict");
  }
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;

  await queryPostgres(
    `
    update public.provider_promotion_opportunities
    set status='approved', budget_control_id=$3, approved_budget_cents=$4,
        approved_daily_cap_cents=$5, approved_by_user_id=$6, approved_at=now(), updated_at=now(),
        metadata_json = metadata_json || $7::jsonb
    where id=$1 and tenant_id=$2
    `,
    [
      parsed.data.promotionId,
      workspaceId,
      controlId,
      effectiveBudgetCents,
      effectiveDailyCapCents,
      actorUserId,
      JSON.stringify({
        liveSpendEnabled: false,
        campaignCreated: false,
        customerCustomBudget: parsed.data.customBudgetAmount !== "",
        customerCustomDailyLimit: parsed.data.customDailyLimitAmount !== ""
      })
    ]
  );
  await queryPostgres(
    `insert into public.provider_promotion_events (tenant_id,promotion_id,event_type,actor_user_id,amount_cents,metadata_json)
     values ($1,$2,'approved',$3,$4,$5::jsonb)`,
    [workspaceId, parsed.data.promotionId, actorUserId, effectiveBudgetCents, JSON.stringify({ dailyCapCents: effectiveDailyCapCents, liveSpendEnabled: false })]
  );
  revalidatePath("/app/marketing");
  revalidatePath("/app/billing");
  redirect("/app/marketing?promotion=approved");
}

export async function recordProviderPromotionProgressAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = promotionProgressSchema.safeParse({
    promotionId: formData.get("promotionId"),
    qualifyingSpendAmount: formData.get("qualifyingSpendAmount")
  });
  if (!parsed.success) redirect("/app/marketing?promotion=invalid_progress");
  const workspaceId = await getCurrentWorkspaceId();
  const amountCents = Math.round(parsed.data.qualifyingSpendAmount * 100);
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;
  const updated = await queryPostgres<{ status: string }>(
    `
    update public.provider_promotion_opportunities
    set qualifying_spend_recorded_cents=$3,
        status=case when $3 >= required_spend_cents then 'qualified' else case when status='approved' then 'activated' else status end end,
        activated_at=case when $3 > 0 then coalesce(activated_at,now()) else activated_at end,
        qualified_at=case when $3 >= required_spend_cents then coalesce(qualified_at,now()) else qualified_at end,
        updated_at=now()
    where id=$1 and tenant_id=$2 and status in ('approved','activated','qualified')
    returning status
    `,
    [parsed.data.promotionId, workspaceId, amountCents]
  );
  if (!updated?.rows[0]) redirect("/app/marketing?promotion=invalid_progress");
  await queryPostgres(
    `insert into public.provider_promotion_events (tenant_id,promotion_id,event_type,actor_user_id,amount_cents,metadata_json)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      workspaceId,
      parsed.data.promotionId,
      updated.rows[0].status === "qualified" ? "qualified" : "progress_recorded",
      actorUserId,
      amountCents,
      JSON.stringify({ cumulativeQualifyingSpend: true, providerReported: false })
    ]
  );
  revalidatePath("/app/marketing");
  redirect("/app/marketing?promotion=progress_saved");
}

export async function declineProviderPromotionAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = z.object({ promotionId: z.string().uuid() }).safeParse({ promotionId: formData.get("promotionId") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;
  const updated = await queryPostgres(
    `update public.provider_promotion_opportunities set status='declined', updated_at=now() where id=$1 and tenant_id=$2 and status in ('captured','recommended')`,
    [parsed.data.promotionId, workspaceId]
  );
  if (updated?.rowCount) {
    await queryPostgres(
      `insert into public.provider_promotion_events (tenant_id,promotion_id,event_type,actor_user_id,metadata_json) values ($1,$2,'declined',$3,'{"providerAction":false}'::jsonb)`,
      [workspaceId, parsed.data.promotionId, actorUserId]
    );
  }
  revalidatePath("/app/marketing");
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
