import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type BrainRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  meta: string;
  href: string;
};

export type BusinessBrainDashboard = {
  metrics: {
    brands: number;
    services: number;
    serviceAreas: number;
    customers: number;
    leads: number;
    jobs: number;
    reviews: number;
    proofAssets: number;
    integrations: number;
    laborRequests: number;
    availableWorkers: number;
  };
  completeness: BrainRow[];
  brands: BrainRow[];
  services: BrainRow[];
  serviceAreas: BrainRow[];
  businessProfiles: BrainRow[];
  customerSignals: BrainRow[];
  documentsAndProof: BrainRow[];
  integrations: BrainRow[];
  aiReadsFrom: BrainRow[];
};

function n(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function clean(value: string | null | undefined, fallback = "Not set") {
  return value && value.trim() ? value : fallback;
}

function row(id: string, title: string, detail: string, status: string, meta: string, href: string): BrainRow {
  return { id, title, detail, status, meta, href };
}

export async function getBusinessBrainDashboard(): Promise<BusinessBrainDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [
    metricResult,
    brandResult,
    serviceResult,
    areaResult,
    profileResult,
    customerResult,
    proofResult,
    integrationResult
  ] = await Promise.all([
    queryPostgres<{
      brands: string;
      services: string;
      service_areas: string;
      customers: string;
      leads: string;
      jobs: string;
      reviews: string;
      proof_assets: string;
      integrations: string;
      labor_requests: string;
      available_workers: string;
    }>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status <> 'archived')::text as brands,
        (select count(*) from public.brand_services where tenant_id = $1 and active = true)::text as services,
        (select count(*) from public.brand_locations where tenant_id = $1 and active = true)::text as service_areas,
        (select count(*) from public.customers where tenant_id = $1)::text as customers,
        (select count(*) from public.leads where tenant_id = $1)::text as leads,
        (select count(*) from public.service_jobs where tenant_id = $1)::text as jobs,
        (select count(*) from public.review_request_workflows where tenant_id = $1)::text as reviews,
        (select count(*) from public.ugc_assets where tenant_id = $1)::text as proof_assets,
        (select count(*) from public.integration_connections where tenant_id = $1)::text as integrations,
        (select count(*) from public.labor_staffing_requests where tenant_id = $1 and status not in ('cancelled','filled'))::text as labor_requests,
        (select count(*) from public.labor_worker_availability where tenant_id = $1 and status in ('available','needs_review'))::text as available_workers
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      slug: string;
      domain: string | null;
      phone: string | null;
      email: string | null;
      industry: string | null;
      primary_goal: string | null;
      primary_location: string | null;
      status: string;
    }>(
      `
      select id, name, slug, domain, phone, email, industry, primary_goal, primary_location, status
      from public.brands
      where tenant_id = $1 and status <> 'archived'
      order by created_at asc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_slug: string;
      name: string;
      description: string | null;
      priority: number;
      active: boolean;
    }>(
      `
      select s.id, b.slug as brand_slug, s.name, s.description, s.priority, s.active
      from public.brand_services s
      join public.brands b on b.id = s.brand_id
      where s.tenant_id = $1
      order by s.active desc, s.priority desc, s.name
      limit 18
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_slug: string;
      service_area_name: string | null;
      city: string | null;
      state: string | null;
      priority: number;
      active: boolean;
    }>(
      `
      select l.id, b.slug as brand_slug, l.service_area_name, l.city, l.state, l.priority, l.active
      from public.brand_locations l
      join public.brands b on b.id = l.brand_id
      where l.tenant_id = $1
      order by l.active desc, l.priority desc, l.service_area_name
      limit 18
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      company_name: string | null;
      website_url: string | null;
      brand_voice: string | null;
      services_json: unknown[];
      service_areas_json: unknown[];
      status: string;
    }>(
      `
      select id, company_name, website_url, brand_voice, services_json, service_areas_json, status
      from public.marketing_os_business_profiles
      where tenant_id = $1 and status <> 'archived'
      order by updated_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      total_jobs: string;
      total_invoices: string;
      updated_at: string;
    }>(
      `
      select c.id, c.name, c.email, c.phone, c.updated_at,
        (select count(*) from public.service_jobs j where j.tenant_id = c.tenant_id and j.customer_id = c.id)::text as total_jobs,
        (select count(*) from public.service_invoices i where i.tenant_id = c.tenant_id and i.customer_id = c.id)::text as total_invoices
      from public.customers c
      where c.tenant_id = $1
      order by c.updated_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      asset_type: string;
      status: string;
      service_label: string | null;
      approved_for_ai_reuse: boolean;
    }>(
      `
      select id, title, asset_type, status, service_label, approved_for_ai_reuse
      from public.marketing_media_assets
      where tenant_id = $1 and status <> 'archived'
      order by updated_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      provider: string;
      display_name: string | null;
      status: string;
      last_checked_at: string | null;
    }>(
      `
      select id, provider, display_name, status, last_checked_at
      from public.integration_connections
      where tenant_id = $1
      order by updated_at desc
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const metricsRow = metricResult?.rows[0];
  const metrics = {
    brands: n(metricsRow?.brands),
    services: n(metricsRow?.services),
    serviceAreas: n(metricsRow?.service_areas),
    customers: n(metricsRow?.customers),
    leads: n(metricsRow?.leads),
    jobs: n(metricsRow?.jobs),
    reviews: n(metricsRow?.reviews),
    proofAssets: n(metricsRow?.proof_assets),
    integrations: n(metricsRow?.integrations),
    laborRequests: n(metricsRow?.labor_requests),
    availableWorkers: n(metricsRow?.available_workers)
  };

  const completeness = [
    row("brands", "Business identity", "Name, industry, website, phone, email, goal, and service area.", metrics.brands > 0 ? "ready" : "needs_setup", `${metrics.brands} brand(s)`, "/app/brands"),
    row("services", "Services and pricing memory", "The work Ferocity should sell, route, schedule, quote, and write about.", metrics.services > 0 ? "ready" : "needs_setup", `${metrics.services} active service(s)`, "/app/brands"),
    row("areas", "Territories", "Cities, service areas, routes, and local SEO targets.", metrics.serviceAreas > 0 ? "ready" : "needs_setup", `${metrics.serviceAreas} active area(s)`, "/app/brands"),
    row("customers", "Customer history", "Customers, leads, jobs, invoices, reviews, proof, and follow-up history.", metrics.customers > 0 || metrics.leads > 0 ? "learning" : "needs_data", `${metrics.customers} customer(s), ${metrics.leads} lead(s)`, "/app/leads"),
    row("proof", "Proof and reputation", "Photos, videos, reviews, testimonials, before/after proof, and permissions.", metrics.proofAssets > 0 || metrics.reviews > 0 ? "learning" : "needs_data", `${metrics.proofAssets} proof asset(s), ${metrics.reviews} review workflow(s)`, "/app/proof"),
    row("labor", "Labor capacity", "Worker requests, available workers, subcontractor bench, match suggestions, and owner-approved contact.", metrics.laborRequests > 0 || metrics.availableWorkers > 0 ? "learning" : "needs_data", `${metrics.laborRequests} request(s), ${metrics.availableWorkers} worker(s)`, "/app/labor-bench"),
    row("connections", "Connected tools", "Website, email, calendar, payments, marketplace, ads, reviews, and other provider links.", metrics.integrations > 0 ? "connected" : "needs_setup", `${metrics.integrations} connection(s)`, "/app/integrations")
  ];

  return {
    metrics,
    completeness,
    brands: (brandResult?.rows ?? []).map((brand) =>
      row(
        brand.id,
        brand.name,
        `${clean(brand.industry)} / ${clean(brand.primary_location)} / ${clean(brand.primary_goal)}`,
        brand.status,
        `${clean(brand.domain, "No website")} / ${clean(brand.phone, "No phone")} / ${clean(brand.email, "No email")}`,
        `/app/brands/${brand.slug}`
      )
    ),
    services: (serviceResult?.rows ?? []).map((service) =>
      row(service.id, service.name, clean(service.description, "No service description yet"), service.active ? "active" : "paused", `priority ${service.priority}`, `/app/brands/${service.brand_slug}`)
    ),
    serviceAreas: (areaResult?.rows ?? []).map((area) =>
      row(
        area.id,
        clean(area.service_area_name, [area.city, area.state].filter(Boolean).join(", ") || "Service area"),
        [area.city, area.state].filter(Boolean).join(", ") || "No city/state detail",
        area.active ? "active" : "paused",
        `priority ${area.priority}`,
        `/app/brands/${area.brand_slug}`
      )
    ),
    businessProfiles: (profileResult?.rows ?? []).map((profile) =>
      row(
        profile.id,
        clean(profile.company_name, "Business profile"),
        clean(profile.brand_voice, "No brand voice captured yet"),
        profile.status,
        `${clean(profile.website_url, "No website")} / ${profile.services_json.length} service(s) / ${profile.service_areas_json.length} area(s)`,
        "/app/marketing-os"
      )
    ),
    customerSignals: (customerResult?.rows ?? []).map((customer) =>
      row(
        customer.id,
        clean(customer.name, customer.email ?? customer.phone ?? "Customer"),
        `${clean(customer.email, "No email")} / ${clean(customer.phone, "No phone")}`,
        "known",
        `${customer.total_jobs} job(s) / ${customer.total_invoices} invoice(s)`,
        `/app/service/customers/${customer.id}`
      )
    ),
    documentsAndProof: (proofResult?.rows ?? []).map((asset) =>
      row(
        asset.id,
        asset.title,
        `${asset.asset_type} / ${clean(asset.service_label, "general")}`,
        asset.status,
        asset.approved_for_ai_reuse ? "AI reuse approved" : "not approved for AI reuse",
        "/app/proof"
      )
    ),
    integrations: (integrationResult?.rows ?? []).map((integration) =>
      row(
        integration.id,
        integration.display_name ?? integration.provider,
        integration.provider,
        integration.status,
        integration.last_checked_at ? `checked ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(integration.last_checked_at))}` : "not checked yet",
        "/app/integrations"
      )
    ),
    aiReadsFrom: [
      row("setup", "Build My System", "Turns Business Brain gaps into setup plans, workflows, drafts, and safe defaults.", "active", "AI Guided setup", "/app/build-system"),
      row("workforce", "AI Workforce", "Routes owner requests to operators for sales, marketing, reviews, collections, scheduling, and setup.", "active", "AI operators", "/app/ai-workforce"),
      row("owner", "Owner Command", "Uses events, timelines, revenue, and risks to show what needs the owner.", "active", "Owner layer", "/app/owner-command-center"),
      row("timeline", "Automation Timeline", "Shows what Ferocity prepared, changed, blocked, synced, or needs approval for.", "active", "Trust feed", "/app/automation-timeline"),
      row("labor", "Labor Bench", "Feeds worker needs, worker availability, and approved staffing actions into the owner layer.", "active", "Staffing signal", "/app/labor-bench")
    ]
  };
}
