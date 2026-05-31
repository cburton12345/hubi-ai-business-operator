"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

type PageSeedRow = {
  tenant_id: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  business_model: string;
  risk_profile: string;
  primary_location: string | null;
  service_name: string;
  service_description: string | null;
  area_name: string | null;
  form_id: string | null;
};

export async function prepareHostedGrowthPagesAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const gate = await getServiceGate(workspaceId, "hosted_growth_pages");
  if (!gate.enabled) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id,
        event_family,
        event_type,
        title,
        body,
        metadata_json
      )
      values ($1, 'system', 'service_control_blocked', 'Hosted growth pages blocked', $2, $3::jsonb)
      `,
      [workspaceId, gate.reason, JSON.stringify({ featureKey: "hosted_growth_pages", mode: gate.mode, currentUsage: gate.currentUsage, usageLimit: gate.usageLimit })]
    );
    revalidatePath("/app/sites");
    return;
  }
  const result = await queryPostgres<PageSeedRow>(
    `
    select
      b.tenant_id,
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      b.business_model,
      b.risk_profile,
      b.primary_location,
      coalesce(svc.name, b.industry, 'Service') as service_name,
      svc.description as service_description,
      coalesce(loc.service_area_name, concat_ws(', ', loc.city, loc.state), b.primary_location) as area_name,
      (
        select f.id
        from public.forms f
        where f.tenant_id = b.tenant_id and f.brand_id = b.id and f.active = true
        order by f.created_at asc
        limit 1
      ) as form_id
    from public.brands b
    left join lateral (
      select name, description
      from public.brand_services
      where tenant_id = b.tenant_id and brand_id = b.id and active = true
      order by priority desc, name
      limit 8
    ) svc on true
    left join lateral (
      select service_area_name, city, state
      from public.brand_locations
      where tenant_id = b.tenant_id and brand_id = b.id and active = true
      order by priority desc, service_area_name nulls last, city nulls last
      limit 8
    ) loc on true
    where b.tenant_id = $1 and b.status = 'active'
    order by b.name
    limit 80
    `,
    [workspaceId]
  );

  for (const row of result?.rows ?? []) {
    const area = row.area_name || row.primary_location || "service-area";
    const title = `${row.service_name} in ${area}`;
    const slug = slugify(title);
    const keyword = `${row.service_name} ${area}`.toLowerCase();
    const trackingCode = `hosted-page:${row.brand_slug}:${slug}`;

    await queryPostgres(
      `
      insert into public.brand_landing_pages (
        tenant_id,
        brand_id,
        title,
        slug,
        page_type,
        primary_keyword,
        status,
        url,
        headline,
        subheadline,
        form_id,
        tracking_code,
        noindex,
        metadata_json
      )
      values ($1, $2, $3, $4, 'city_page', $5, 'draft', $6, $7, $8, $9, $10, true, $11::jsonb)
      on conflict (brand_id, slug) do update set
        title = excluded.title,
        primary_keyword = excluded.primary_keyword,
        url = excluded.url,
        headline = excluded.headline,
        subheadline = excluded.subheadline,
        form_id = coalesce(public.brand_landing_pages.form_id, excluded.form_id),
        tracking_code = excluded.tracking_code,
        metadata_json = public.brand_landing_pages.metadata_json || excluded.metadata_json,
        updated_at = now()
      `,
      [
        row.tenant_id,
        row.brand_id,
        title,
        slug,
        keyword,
        `/sites/${row.brand_slug}/${slug}`,
        title,
        row.service_description || `Request ${row.service_name} from ${row.brand_name} in ${area}.`,
        row.form_id,
        trackingCode,
        JSON.stringify({
          generator: "hosted_growth_pages",
          businessModel: row.business_model,
          draftOnly: true,
          sourceService: row.service_name,
          sourceArea: area
        })
      ]
    );
  }

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id,
      event_family,
      event_type,
      title,
      body,
      metadata_json
    )
    values ($1, 'marketing', 'hosted_pages_prepared', 'Hosted growth pages prepared', 'Ferocity prepared draft hosted landing pages from active services, areas, and lead forms.', $2::jsonb)
    `,
    [workspaceId, JSON.stringify({ generator: "hosted_growth_pages", count: result?.rows.length ?? 0 })]
  );

  revalidatePath("/app/sites");
  revalidatePath("/app/seo");
}

export async function updateHostedGrowthPageAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const pageId = String(formData.get("pageId") ?? "");
  const status = String(formData.get("status") ?? "draft");
  const noindex = formData.get("noindex") === "on";

  if (!["draft", "planned", "published", "archived"].includes(status)) return;

  if (status === "published") {
    const gate = await getServiceGate(workspaceId, "hosted_growth_pages");
    if (!gate.enabled || gate.mode === "draft_only") {
      await queryPostgres(
        `
        insert into public.operator_timeline_events (
          tenant_id,
          event_family,
          event_type,
          title,
          body,
          primary_entity_type,
          primary_entity_id,
          source_table,
          source_id,
          metadata_json
        )
        values ($1, 'system', 'service_control_blocked', 'Hosted page publish blocked', $2, 'hosted_page', $3, 'brand_landing_pages', $3, $4::jsonb)
        `,
        [workspaceId, gate.mode === "draft_only" ? "Hosted growth pages are set to draft only." : gate.reason, pageId, JSON.stringify({ featureKey: "hosted_growth_pages", mode: gate.mode })]
      );
      revalidatePath("/app/sites");
      return;
    }
  }

  await queryPostgres(
    `
    update public.brand_landing_pages
    set
      status = $3,
      noindex = $4,
      published_at = case when $3 = 'published' and published_at is null then now() else published_at end,
      updated_at = now(),
      metadata_json = metadata_json || $5::jsonb
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      pageId,
      status,
      noindex,
      JSON.stringify({ lastStatusChange: "manual_operator", hostedPage: true })
    ]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id,
      event_family,
      event_type,
      title,
      body,
      primary_entity_type,
      primary_entity_id,
      source_table,
      source_id,
      metadata_json
    )
    values ($1, 'marketing', 'hosted_page_status_changed', 'Hosted page status changed', $2, 'hosted_page', $3, 'brand_landing_pages', $3, $4::jsonb)
    `,
    [workspaceId, `Hosted landing page set to ${status}.`, pageId, JSON.stringify({ status, noindex })]
  );

  revalidatePath("/app/sites");
  revalidatePath("/app/seo");
}
