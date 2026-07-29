"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const serviceAreaSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(80).optional(),
  zip: z.string().trim().max(20).optional(),
  radiusMiles: z.coerce.number().int().min(1).max(250),
  priority: z.coerce.number().int().min(1).max(100),
  latitude: z.union([z.coerce.number().min(-90).max(90), z.literal("")]).optional(),
  longitude: z.union([z.coerce.number().min(-180).max(180), z.literal("")]).optional()
});

export async function saveServiceAreaTargetAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = serviceAreaSchema.safeParse({
    name: formData.get("name"),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    radiusMiles: formData.get("radiusMiles"),
    priority: formData.get("priority"),
    latitude: String(formData.get("latitude") ?? ""),
    longitude: String(formData.get("longitude") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.service_area_targets (
      tenant_id, name, city, state, zip, latitude, longitude,
      radius_miles, priority, status, notes, metadata_json
    )
    values (
      $1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''),
      nullif($6, '')::numeric, nullif($7, '')::numeric,
      $8, $9, 'active',
      'Keyless service area used for ZIP/city matching, lead fit, and route clustering.',
      '{"source":"manual_keyless_service_area"}'::jsonb
    )
    on conflict (
      tenant_id,
      coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
      name,
      coalesce(city, ''),
      coalesce(state, '')
    )
    do update set
      zip = excluded.zip,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      radius_miles = excluded.radius_miles,
      priority = excluded.priority,
      status = 'active',
      notes = excluded.notes,
      metadata_json = public.service_area_targets.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.name,
      parsed.data.city ?? "",
      parsed.data.state ?? "",
      parsed.data.zip ?? "",
      parsed.data.latitude === "" || parsed.data.latitude === undefined ? "" : String(parsed.data.latitude),
      parsed.data.longitude === "" || parsed.data.longitude === undefined ? "" : String(parsed.data.longitude),
      parsed.data.radiusMiles,
      parsed.data.priority
    ]
  );
  revalidatePath("/app/operator-depth");
  revalidatePath("/app/service/routes");
  revalidatePath("/app/system-health");
}

export async function refreshOperatorDepthAction() {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    delete from public.lead_source_scores
    where tenant_id = $1 and metadata_json->>'refreshedFrom' = 'leads'
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    delete from public.connector_run_history
    where tenant_id = $1
      and run_type in ('manual_check', 'health_check')
      and started_at >= date_trunc('day', now())
      and metadata_json ? 'reason'
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_area_targets (tenant_id, brand_id, name, city, state, priority, status, notes, metadata_json)
    select
      l.tenant_id,
      l.brand_id,
      coalesce(nullif(l.service_area_name, ''), concat_ws(', ', nullif(l.city, ''), nullif(l.state, '')), 'Primary service area'),
      l.city,
      l.state,
      greatest(50, l.priority * 10),
      case when l.active then 'active' else 'paused' end,
      'Created from brand service area. Use this to route leads, prioritize city pages, and score local demand.',
      jsonb_build_object('seededFrom', 'brand_locations', 'brandLocationId', l.id)
    from public.brand_locations l
    where l.tenant_id = $1
      and not exists (
        select 1 from public.service_area_targets s
        where s.tenant_id = l.tenant_id
          and (s.brand_id = l.brand_id or (s.brand_id is null and l.brand_id is null))
          and s.name = coalesce(nullif(l.service_area_name, ''), concat_ws(', ', nullif(l.city, ''), nullif(l.state, '')), 'Primary service area')
          and coalesce(s.city, '') = coalesce(l.city, '')
          and coalesce(s.state, '') = coalesce(l.state, '')
      )
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.lead_source_scores (
      tenant_id, brand_id, source_family, source_name, campaign_name, lead_count, qualified_count, won_count,
      fit_score, urgency_score, confidence_score, recommendation, measured_from, measured_to, metadata_json
    )
    select
      l.tenant_id,
      l.brand_id,
      case
        when lower(coalesce(l.source, '')) like '%google%' or lower(coalesce(l.source, '')) like '%seo%' then 'organic'
        when lower(coalesce(l.source, '')) like '%facebook%' then 'paid'
        when lower(coalesce(l.source, '')) like '%marketplace%' then 'referral'
        when coalesce(l.source, '') = '' then 'unknown'
        else 'manual'
      end,
      coalesce(nullif(l.source, ''), 'Unknown source'),
      nullif(l.source_detail, ''),
      count(*)::integer,
      count(*) filter (where l.qualification_status = 'qualified')::integer,
      count(*) filter (where l.status = 'won')::integer,
      least(100, 45 + count(*)::integer * 5 + count(*) filter (where l.status = 'won')::integer * 20),
      least(100, 40 + count(*) filter (where l.priority = 'high')::integer * 15 + count(*) filter (where l.status in ('new','qualified'))::integer * 5),
      least(100, 20 + count(*)::integer * 10),
      case
        when count(*) filter (where l.status = 'won') > 0 then 'Protect this source. It has already produced won work.'
        when count(*) >= 3 then 'Watch this source closely and tighten follow-up.'
        else 'Keep tracking before making budget decisions.'
      end,
      min(l.created_at),
      max(l.created_at),
      jsonb_build_object('refreshedFrom', 'leads')
    from public.leads l
    where l.tenant_id = $1
    group by l.tenant_id, l.brand_id, coalesce(nullif(l.source, ''), 'Unknown source'), nullif(l.source_detail, '')
    having count(*) > 0
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.connector_run_history (tenant_id, provider_key, run_type, status, records_found, records_skipped, completed_at, metadata_json)
    select tenant_id, provider, 'manual_check', 'skipped', 0, 1, now(),
      jsonb_build_object('reason', 'Provider is registered. Live sync remains disabled until keys and approvals are ready.')
    from public.integration_connections
    where tenant_id = $1
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.connector_run_history (tenant_id, provider_key, run_type, status, records_found, records_skipped, completed_at, metadata_json)
    select tenant_id, provider_key, 'health_check', 'skipped', 0, 1, now(),
      jsonb_build_object('reason', 'Provider account checked for readiness. No live external action was run.')
    from public.provider_accounts
    where tenant_id = $1
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.credential_rotation_alerts (tenant_id, provider_key, credential_label, status, severity, notes, metadata_json)
    select tenant_id, provider, 'workspace credentials',
      case when credentials_status in ('expired', 'invalid') then 'expired' else 'watching' end,
      case when credentials_status in ('expired', 'invalid') then 'high' else 'normal' end,
      case
        when credentials_status = 'configured' then 'Credential is configured. Add rotation reminders before live automation scales.'
        else 'Credential is not ready. Keep live actions disabled until this is configured and verified.'
      end,
      jsonb_build_object('source', 'integration_connections', 'credentialsStatus', credentials_status)
    from public.integration_connections
    where tenant_id = $1
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.operator_daily_digests (
      tenant_id, digest_date, status, urgent_leads, stale_estimates, overdue_invoices,
      review_opportunities, seo_refreshes, provider_issues, summary, next_actions_json, metadata_json
    )
    select
      $1::uuid,
      current_date,
      'ready',
      (select count(*)::integer from public.leads where tenant_id = $1 and status in ('new','qualified') and priority = 'high'),
      (select count(*)::integer from public.service_estimates where tenant_id = $1 and status = 'sent_manually' and created_at < now() - interval '3 days'),
      (select count(*)::integer from public.service_invoices where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue') and due_date < current_date),
      (select count(*)::integer from public.review_request_workflows where tenant_id = $1 and status in ('draft','scheduled')),
      (select count(*)::integer from public.brand_landing_pages where tenant_id = $1 and status in ('planned','draft')),
      (select count(*)::integer from public.integration_connections where tenant_id = $1 and credentials_status <> 'configured'),
      'Daily operator digest created from real Ferocity records. Use it as the morning command summary.',
      jsonb_build_array(
        'Reply to urgent new leads first',
        'Follow up on viewed or aging estimates',
        'Protect cash by preparing invoice reminders',
        'Review SEO and public export drafts before publishing'
      ),
      jsonb_build_object('refreshedBy', 'operator_depth')
    where not exists (
      select 1 from public.operator_daily_digests
      where tenant_id = $1 and brand_id is null and digest_date = current_date
    )
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.review_first_export_queue (tenant_id, brand_id, export_type, provider_key, target_label, title, body, status, risk_level, source_table, source_id, metadata_json)
    select tenant_id, brand_id,
      case output_type
        when 'gbp_post' then 'gbp_post'
        when 'facebook_post' then 'ad_creative'
        when 'seo_page' then 'website_page'
        when 'ad_creative' then 'ad_creative'
        else 'other'
      end,
      'manual_export',
      output_type,
      coalesce(title, 'Customer proof content'),
      summary,
      'needs_review',
      'medium',
      'ugc_content_outputs',
      id,
      jsonb_build_object('source', 'ugc_content_outputs')
    from public.ugc_content_outputs u
    where tenant_id = $1
      and status in ('planned','draft')
      and not exists (
        select 1 from public.review_first_export_queue q
        where q.tenant_id = u.tenant_id and q.source_table = 'ugc_content_outputs' and q.source_id = u.id
      )
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.review_first_export_queue (tenant_id, brand_id, export_type, provider_key, target_label, title, body, status, risk_level, source_table, source_id, metadata_json)
    select tenant_id, brand_id, 'website_page', 'website_connector', coalesce(page_type, 'growth page'), title, primary_keyword,
      'needs_review', 'medium', 'brand_landing_pages', id, jsonb_build_object('source', 'brand_landing_pages')
    from public.brand_landing_pages p
    where tenant_id = $1
      and status in ('draft','needs_review')
      and not exists (
        select 1 from public.review_first_export_queue q
        where q.tenant_id = p.tenant_id and q.source_table = 'brand_landing_pages' and q.source_id = p.id
      )
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.document_review_items (tenant_id, brand_id, related_type, related_id, title, status, risk_level, summary, required_actions_json, metadata_json)
    select tenant_id, brand_id, 'invoice', id, title, 'needs_review', 'medium',
      'Invoice is overdue or partially paid. Review before sending payment follow-up.',
      jsonb_build_array('Check balance', 'Confirm customer contact', 'Approve reminder copy'),
      jsonb_build_object('source', 'service_invoices')
    from public.service_invoices i
    where tenant_id = $1
      and status in ('partially_paid','overdue')
      and not exists (
        select 1 from public.document_review_items d
        where d.tenant_id = i.tenant_id and d.related_type = 'invoice' and d.related_id = i.id
      )
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.operator_subscriptions (tenant_id, brand_id, subscription_type, label, match_value, channel, frequency, status, metadata_json)
    select b.tenant_id, b.id, 'source', 'Daily lead and source digest', b.slug, 'dashboard', 'daily', 'active',
      jsonb_build_object('reason', 'Keep operators watching lead flow, source quality, and follow-up risk.')
    from public.brands b
    where b.tenant_id = $1 and b.status <> 'archived'
      and not exists (
        select 1 from public.operator_subscriptions s
        where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.subscription_type = 'source' and s.label = 'Daily lead and source digest'
      )
    `,
    [workspaceId]
  );

  revalidatePath("/app/operator-depth");
  revalidatePath("/app/system-health");
}
