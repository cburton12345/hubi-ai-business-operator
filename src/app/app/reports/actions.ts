"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollarsToCents(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "");
  const dollars = Number(normalized);
  return Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0;
}

function wholeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

const baselineSchema = z.object({
  baselineDate: z.string().optional(),
  monthlyRevenueCents: z.number().int().min(0),
  monthlyLeads: z.number().int().min(0),
  monthlyBookedJobs: z.number().int().min(0),
  monthlyAdSpendCents: z.number().int().min(0),
  averageTicketCents: z.number().int().min(0),
  closeRatePercent: z.number().min(0).max(100),
  reviewCount: z.number().int().min(0),
  reviewRating: z.number().min(0).max(5).optional(),
  websiteSessions: z.number().int().min(0),
  notes: z.string().max(1200).optional()
});

export async function saveGrowthBaselineAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = baselineSchema.safeParse({
    baselineDate: String(formData.get("baselineDate") ?? "") || undefined,
    monthlyRevenueCents: dollarsToCents(formData.get("monthlyRevenue")),
    monthlyLeads: wholeNumber(formData.get("monthlyLeads")),
    monthlyBookedJobs: wholeNumber(formData.get("monthlyBookedJobs")),
    monthlyAdSpendCents: dollarsToCents(formData.get("monthlyAdSpend")),
    averageTicketCents: dollarsToCents(formData.get("averageTicket")),
    closeRatePercent: Number(formData.get("closeRatePercent") ?? 0),
    reviewCount: wholeNumber(formData.get("reviewCount")),
    reviewRating: formData.get("reviewRating") ? Number(formData.get("reviewRating")) : undefined,
    websiteSessions: wholeNumber(formData.get("websiteSessions")),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const closeRateBps = Math.round(parsed.data.closeRatePercent * 100);
  const baselineDate = parsed.data.baselineDate || new Date().toISOString().slice(0, 10);

  await queryPostgres(
    `
    insert into public.business_growth_baselines (
      tenant_id, baseline_name, baseline_type, baseline_date, source, confidence,
      monthly_revenue_cents, monthly_leads, monthly_booked_jobs, monthly_ad_spend_cents,
      average_ticket_cents, close_rate_bps, review_count, review_rating, website_sessions,
      notes, metadata_json, created_by_user_id, updated_at
    )
    values (
      $1, 'Day 1 baseline', 'onboarding', $2::date, 'manual', 'owner_reported',
      $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, jsonb_build_object('savedFrom', 'reports_page', 'actorEmail', $13::text), nullif($14::text, '')::uuid, now()
    )
    on conflict (tenant_id, brand_scope_id, baseline_date) do update
    set monthly_revenue_cents = excluded.monthly_revenue_cents,
        monthly_leads = excluded.monthly_leads,
        monthly_booked_jobs = excluded.monthly_booked_jobs,
        monthly_ad_spend_cents = excluded.monthly_ad_spend_cents,
        average_ticket_cents = excluded.average_ticket_cents,
        close_rate_bps = excluded.close_rate_bps,
        review_count = excluded.review_count,
        review_rating = excluded.review_rating,
        website_sessions = excluded.website_sessions,
        notes = excluded.notes,
        confidence = excluded.confidence,
        metadata_json = public.business_growth_baselines.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      tenantId,
      baselineDate,
      parsed.data.monthlyRevenueCents,
      parsed.data.monthlyLeads,
      parsed.data.monthlyBookedJobs,
      parsed.data.monthlyAdSpendCents,
      parsed.data.averageTicketCents,
      closeRateBps,
      parsed.data.reviewCount,
      parsed.data.reviewRating ?? null,
      parsed.data.websiteSessions,
      parsed.data.notes ?? "",
      actor.email,
      actor.userId === "admin-token" ? "" : actor.userId
    ]
  );

  revalidatePath("/app/reports");
  revalidatePath("/app");
  revalidatePath("/app/owner-command-center");
}
