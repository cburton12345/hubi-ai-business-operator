import { queryPostgres } from "@/lib/db/postgres";
import { getServiceGate, type ServiceGate } from "@/lib/controls/service-gates";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dateLabel(value: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export type LaborBenchDashboard = {
  metrics: {
    openRequests: number;
    workersAvailable: number;
    approvalNeeded: number;
    placedMatches: number;
  };
  requests: {
    id: string;
    title: string;
    trade: string;
    serviceArea: string;
    startDate: string;
    headcount: number;
    payRange: string;
    urgency: string;
    status: string;
    notes: string;
    matchCount: number;
  }[];
  workers: {
    id: string;
    name: string;
    trade: string;
    serviceArea: string;
    availability: string;
    rate: string;
    source: string;
    status: string;
    consent: string;
    sourceDetail: string;
  }[];
  matches: {
    id: string;
    requestTitle: string;
    workerName: string;
    trade: string;
    score: number;
    reason: string;
    status: string;
    source: string;
  }[];
  publicWorkerIntakeUrl: string | null;
  gates: {
    requests: ServiceGate;
    workerIntake: ServiceGate;
    matchSuggestions: ServiceGate;
  };
  aiSuggestions: {
    title: string;
    detail: string;
    priority: "low" | "normal" | "high";
    href: string;
  }[];
};

function n(value: unknown) {
  return Number(value ?? 0);
}

export async function getLaborBenchDashboard(): Promise<LaborBenchDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [
    metricsResult,
    requestsResult,
    workersResult,
    matchesResult,
    publicFormResult,
    requestGate,
    workerIntakeGate,
    matchGate
  ] = await Promise.all([
    queryPostgres<{
      open_requests: string;
      workers_available: string;
      approval_needed: string;
      placed_matches: string;
    }>(
      `
      select
        (select count(*) from public.labor_staffing_requests where tenant_id = $1 and status in ('open','matching','approval_needed','contacting'))::text as open_requests,
        (select count(*) from public.labor_worker_availability where tenant_id = $1 and status in ('available','needs_review'))::text as workers_available,
        (select count(*) from public.labor_staffing_matches where tenant_id = $1 and status = 'suggested')::text as approval_needed,
        (select count(*) from public.labor_staffing_matches where tenant_id = $1 and status = 'placed')::text as placed_matches
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      trade: string;
      service_area: string | null;
      start_date: string | null;
      headcount: number;
      pay_range: string | null;
      urgency: string;
      status: string;
      notes: string | null;
      match_count: string;
    }>(
      `
      select r.id, r.title, r.trade, r.service_area, r.start_date::text, r.headcount, r.pay_range,
             r.urgency, r.status, r.notes,
             (select count(*) from public.labor_staffing_matches m where m.request_id = r.id)::text as match_count
      from public.labor_staffing_requests r
      where r.tenant_id = $1 and r.status <> 'cancelled'
      order by
        case r.urgency when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
        r.created_at desc
      limit 20
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      trade: string;
      service_area: string | null;
      availability_label: string | null;
      rate_label: string | null;
      source: string;
      status: string;
      consent_to_contact: boolean;
      metadata_json: Record<string, unknown> | null;
    }>(
      `
      select id, name, trade, service_area, availability_label, rate_label, source, status, consent_to_contact, metadata_json
      from public.labor_worker_availability
      where tenant_id = $1 and status <> 'archived'
      order by
        case status when 'available' then 0 when 'needs_review' then 1 when 'contacted' then 2 else 3 end,
        updated_at desc
      limit 24
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      request_title: string;
      worker_name: string;
      trade: string;
      match_score: number;
      match_reason: string | null;
      status: string;
      source: string;
    }>(
      `
      select m.id, r.title as request_title, w.name as worker_name, w.trade, m.match_score, m.match_reason, m.status, w.source
      from public.labor_staffing_matches m
      join public.labor_staffing_requests r on r.id = m.request_id
      join public.labor_worker_availability w on w.id = m.worker_availability_id
      where m.tenant_id = $1
      order by
        case m.status when 'suggested' then 0 when 'owner_approved_contact' then 1 when 'contacted' then 2 else 3 end,
        m.match_score desc,
        m.created_at desc
      limit 20
      `,
      [tenantId]
    ),
    queryPostgres<{ public_key: string }>(
      `
      select public_key
      from public.forms
      where tenant_id = $1 and active = true and public_key is not null
      order by created_at desc
      limit 1
      `,
      [tenantId]
    ),
    getServiceGate(tenantId, "labor_staffing_requests"),
    getServiceGate(tenantId, "labor_worker_intake"),
    getServiceGate(tenantId, "labor_match_suggestions")
  ]);

  const metrics = metricsResult?.rows[0];
  const openRequests = n(metrics?.open_requests);
  const workersAvailable = n(metrics?.workers_available);
  const approvalNeeded = n(metrics?.approval_needed);

  return {
    metrics: {
      openRequests,
      workersAvailable,
      approvalNeeded,
      placedMatches: n(metrics?.placed_matches)
    },
    requests: (requestsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      trade: row.trade,
      serviceArea: row.service_area ?? "Area not set",
      startDate: dateLabel(row.start_date),
      headcount: row.headcount,
      payRange: row.pay_range ?? "Pay not set",
      urgency: row.urgency,
      status: row.status,
      notes: row.notes ?? "No notes",
      matchCount: n(row.match_count)
    })),
    workers: (workersResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      trade: row.trade,
      serviceArea: row.service_area ?? "Area not set",
      availability: row.availability_label ?? "Availability not set",
      rate: row.rate_label ?? "Rate not set",
      source: row.source,
      status: row.status,
      consent: row.consent_to_contact ? "contact allowed" : "needs consent",
      sourceDetail: sourceDetail(row.metadata_json)
    })),
    matches: (matchesResult?.rows ?? []).map((row) => ({
      id: row.id,
      requestTitle: row.request_title,
      workerName: row.worker_name,
      trade: row.trade,
      score: row.match_score,
      reason: row.match_reason ?? "Matched by trade, area, availability, and request urgency.",
      status: row.status,
      source: row.source
    })),
    publicWorkerIntakeUrl: publicFormResult?.rows[0]?.public_key
      ? `/workers/${publicFormResult.rows[0].public_key}`
      : null,
    gates: {
      requests: requestGate,
      workerIntake: workerIntakeGate,
      matchSuggestions: matchGate
    },
    aiSuggestions: [
      {
        title: openRequests > 0 && workersAvailable === 0 ? "No workers available for open requests" : "Labor bench is ready",
        detail:
          openRequests > 0 && workersAvailable === 0
            ? "Add worker availability, import MarketplacePro labor, or mark this request as manual staffing needed."
            : "Ferocity can compare open requests with available workers and prepare matches for approval.",
        priority: openRequests > 0 && workersAvailable === 0 ? "high" : "normal",
        href: "/app/labor-bench"
      },
      {
        title: approvalNeeded > 0 ? `${approvalNeeded} match suggestion(s) need approval` : "No match approvals waiting",
        detail: "Ferocity does not contact or place workers until the owner approves the match.",
        priority: approvalNeeded > 0 ? "high" : "low",
        href: "/app/labor-bench"
      }
    ]
  };
}

function textValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceDetail(record: Record<string, unknown> | null) {
  const values = [
    textValue(record, "utmSource") ? `source ${textValue(record, "utmSource")}` : null,
    textValue(record, "utmCampaign") ? `campaign ${textValue(record, "utmCampaign")}` : null,
    textValue(record, "pageUrl") ? "website form" : null,
    textValue(record, "referrer") ? "has referrer" : null,
    textValue(record, "brandSlug") ? `brand ${textValue(record, "brandSlug")}` : null
  ].filter(Boolean);

  return values.length ? values.join(" / ") : "No tracking detail";
}
