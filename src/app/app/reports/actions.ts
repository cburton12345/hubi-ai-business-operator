"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollarsToCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const normalized = raw.replace(/[$,\s]/g, "");
  const dollars = Number(normalized);
  return Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : Number.NaN;
}

function wholeNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Number(raw.replace(/[,\s]/g, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function decimalNumber(value: FormDataEntryValue | null, optional = false) {
  const raw = String(value ?? "").trim();
  if (!raw) return optional ? undefined : Number.NaN;
  const parsed = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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

export type GrowthBaselineActionState = { ok: boolean; message?: string; error?: string };

export async function saveGrowthBaselineAction(
  _state: GrowthBaselineActionState,
  formData: FormData
): Promise<GrowthBaselineActionState> {
  const actor = await requirePermission("tenant:manage");
  const parsed = baselineSchema.safeParse({
    baselineDate: String(formData.get("baselineDate") ?? "") || undefined,
    monthlyRevenueCents: dollarsToCents(formData.get("monthlyRevenue")),
    monthlyLeads: wholeNumber(formData.get("monthlyLeads")),
    monthlyBookedJobs: wholeNumber(formData.get("monthlyBookedJobs")),
    monthlyAdSpendCents: dollarsToCents(formData.get("monthlyAdSpend")),
    averageTicketCents: dollarsToCents(formData.get("averageTicket")),
    closeRatePercent: decimalNumber(formData.get("closeRatePercent")),
    reviewCount: wholeNumber(formData.get("reviewCount")),
    reviewRating: decimalNumber(formData.get("reviewRating"), true),
    websiteSessions: wholeNumber(formData.get("websiteSessions")),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const labels: Record<string, string> = {
      monthlyRevenueCents: "Monthly revenue",
      monthlyLeads: "Monthly leads",
      monthlyBookedJobs: "Booked jobs",
      monthlyAdSpendCents: "Ad spend",
      averageTicketCents: "Average ticket",
      closeRatePercent: "Close rate",
      reviewCount: "Review count",
      reviewRating: "Review rating",
      websiteSessions: "Website sessions"
    };
    return { ok: false, error: `${labels[String(field)] ?? "A baseline value"} is missing or invalid. Enter 0 only when the true value is zero.` };
  }

  const tenantId = await getCurrentWorkspaceId();
  const closeRateBps = Math.round(parsed.data.closeRatePercent * 100);
  const baselineDate = parsed.data.baselineDate || new Date().toISOString().slice(0, 10);

  const saved = await queryPostgres(
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
  return saved
    ? { ok: true, message: "Baseline saved. Ferocity will use it for future comparisons." }
    : { ok: false, error: "The baseline could not be saved. Your entries are still here; try again." };
}
