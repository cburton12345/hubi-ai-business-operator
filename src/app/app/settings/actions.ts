"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { isSafePublicHref, normalizeDemoEmbedUrl, publicCopyKeys } from "@/lib/public-site/featured-demo";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const featuredDemoSchema = z.object({
  enabled: z.boolean(),
  sourceType: z.enum(["direct_video", "youtube", "vimeo"]),
  mediaUrl: z.union([z.string().url().max(2000), z.literal("")]),
  posterUrl: z.union([z.string().url().max(2000), z.literal("")]),
  eyebrow: z.string().min(1).max(80),
  headline: z.string().min(1).max(180),
  body: z.string().min(1).max(500),
  ctaLabel: z.string().min(1).max(80),
  ctaHref: z.string().regex(/^\/(?!\/)/).max(300)
}).superRefine((value, ctx) => {
  for (const [field, raw] of [["mediaUrl", value.mediaUrl], ["posterUrl", value.posterUrl]] as const) {
    if (raw && new URL(raw).protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: [field], message: "Use a secure HTTPS URL." });
    }
  }
});

const settingsSchema = z.object({
  displayName: z.string().min(1).max(180),
  timezone: z.string().min(1).max(80),
  defaultReportEmail: z.union([z.string().email(), z.literal("")]),
  planKey: z.string().min(1).max(80),
  exportPolicy: z.enum(["manual_only", "approved_exports_only"])
});

const publicCopySchema = z.object({
  contentKey: z.enum(publicCopyKeys),
  eyebrow: z.string().min(1).max(80),
  headline: z.string().min(1).max(180),
  body: z.string().min(1).max(500),
  ctaLabel: z.string().min(1).max(80),
  ctaHref: z.string().refine(isSafePublicHref),
  secondaryCtaLabel: z.string().min(1).max(80),
  secondaryCtaHref: z.string().refine(isSafePublicHref)
});

export async function updateWorkspaceSettingsAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = settingsSchema.safeParse({
    displayName: formData.get("displayName"),
    timezone: formData.get("timezone"),
    defaultReportEmail: formData.get("defaultReportEmail") ?? "",
    planKey: formData.get("planKey"),
    exportPolicy: formData.get("exportPolicy")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.workspace_settings (tenant_id, display_name, timezone, default_report_email, plan_key, export_policy, updated_at)
    values ($1, $2, $3, $4, $5, $6, now())
    on conflict (tenant_id) do update
    set display_name = excluded.display_name,
        timezone = excluded.timezone,
        default_report_email = excluded.default_report_email,
        plan_key = excluded.plan_key,
        export_policy = excluded.export_policy,
        updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.displayName,
      parsed.data.timezone,
      parsed.data.defaultReportEmail || null,
      parsed.data.planKey,
      parsed.data.exportPolicy
    ]
  );
  revalidatePath("/app/settings");
}

export async function updateChecklistAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const items = String(formData.get("items") ?? "");
  const checklist = items
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const done = line.startsWith("[x]");
      return {
        key: line.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
        label: line.replace(/^\[[ x]\]\s*/i, ""),
        done
      };
    });

  await queryPostgres("update public.workspace_settings set onboarding_checklist_json = $2::jsonb, updated_at = now() where tenant_id = $1", [
    workspaceId,
    JSON.stringify(checklist)
  ]);
  revalidatePath("/app/settings");
}

export async function updateFeaturedDemoAction(formData: FormData) {
  const actor = await requirePermission("platform:manage");
  const parsed = featuredDemoSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    sourceType: formData.get("sourceType"),
    mediaUrl: String(formData.get("mediaUrl") ?? "").trim(),
    posterUrl: String(formData.get("posterUrl") ?? "").trim(),
    eyebrow: formData.get("eyebrow"),
    headline: formData.get("headline"),
    body: formData.get("body"),
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref")
  });
  if (!parsed.success) redirect("/app/settings?demo=invalid");

  const value = parsed.data;
  if (value.enabled && !normalizeDemoEmbedUrl(value.sourceType, value.mediaUrl)) {
    redirect("/app/settings?demo=invalid_url");
  }
  await queryPostgres(
    `
    with saved as (
      insert into public.platform_public_content (
        content_key, enabled, source_type, media_url, poster_url, eyebrow, headline, body,
        cta_label, cta_href, updated_by, updated_at
      ) values ('featured_demo', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      on conflict (content_key) do update
      set enabled = excluded.enabled,
          source_type = excluded.source_type,
          media_url = excluded.media_url,
          poster_url = excluded.poster_url,
          eyebrow = excluded.eyebrow,
          headline = excluded.headline,
          body = excluded.body,
          cta_label = excluded.cta_label,
          cta_href = excluded.cta_href,
          updated_by = excluded.updated_by,
          updated_at = now()
      returning *
    )
    insert into public.platform_public_content_versions (content_key, snapshot_json, changed_by)
    select content_key, to_jsonb(saved), $10 from saved
    `,
    [
      value.enabled,
      value.sourceType,
      value.mediaUrl || null,
      value.posterUrl || null,
      value.eyebrow,
      value.headline,
      value.body,
      value.ctaLabel,
      value.ctaHref,
      actor.userId
    ]
  );
  revalidatePath("/");
  revalidatePath("/demo");
  revalidatePath("/app/settings");
  redirect("/app/settings?demo=saved");
}

export async function updatePublicCopyAction(formData: FormData) {
  const actor = await requirePermission("platform:manage");
  const parsed = publicCopySchema.safeParse({
    contentKey: formData.get("contentKey"),
    eyebrow: formData.get("eyebrow"),
    headline: formData.get("headline"),
    body: formData.get("body"),
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref"),
    secondaryCtaLabel: formData.get("secondaryCtaLabel"),
    secondaryCtaHref: formData.get("secondaryCtaHref")
  });
  if (!parsed.success) redirect("/app/settings?content=invalid");

  const value = parsed.data;
  await queryPostgres(
    `
    with saved as (
      insert into public.platform_public_content (
        content_key, enabled, eyebrow, headline, body, cta_label, cta_href,
        secondary_cta_label, secondary_cta_href, updated_by, updated_at
      ) values ($1, true, $2, $3, $4, $5, $6, $7, $8, $9, now())
      on conflict (content_key) do update
      set enabled = true,
          eyebrow = excluded.eyebrow,
          headline = excluded.headline,
          body = excluded.body,
          cta_label = excluded.cta_label,
          cta_href = excluded.cta_href,
          secondary_cta_label = excluded.secondary_cta_label,
          secondary_cta_href = excluded.secondary_cta_href,
          updated_by = excluded.updated_by,
          updated_at = now()
      returning *
    )
    insert into public.platform_public_content_versions (content_key, snapshot_json, changed_by)
    select content_key, to_jsonb(saved), $9 from saved
    `,
    [
      value.contentKey,
      value.eyebrow,
      value.headline,
      value.body,
      value.ctaLabel,
      value.ctaHref,
      value.secondaryCtaLabel,
      value.secondaryCtaHref,
      actor.userId
    ]
  );

  revalidatePath("/");
  revalidatePath("/demo");
  revalidatePath("/pricing");
  revalidatePath("/app/settings");
  redirect(`/app/settings?content=saved&slot=${encodeURIComponent(value.contentKey)}`);
}
