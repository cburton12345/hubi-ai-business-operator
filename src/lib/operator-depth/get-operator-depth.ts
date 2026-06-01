import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OperatorDepthRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  meta: string;
  href?: string;
};

export type OperatorDepthDashboard = {
  metrics: {
    serviceAreas: number;
    crewBench: number;
    sourceScores: number;
    connectorRuns: number;
    credentialAlerts: number;
    exportQueue: number;
    documentReviews: number;
    supportIssues: number;
    endpointEvents: number;
  };
  serviceAreas: OperatorDepthRow[];
  crewBench: OperatorDepthRow[];
  sourceScores: OperatorDepthRow[];
  connectorRuns: OperatorDepthRow[];
  credentialAlerts: OperatorDepthRow[];
  dailyDigests: OperatorDepthRow[];
  exportQueue: OperatorDepthRow[];
  documentReviews: OperatorDepthRow[];
  supportIssues: OperatorDepthRow[];
  endpointEvents: OperatorDepthRow[];
};

function numberFrom(value: string | undefined) {
  return Number(value ?? 0);
}

function row(id: string, title: string, detail: string | null, status: string, meta: string, href?: string): OperatorDepthRow {
  return { id, title, detail, status, meta, href };
}

export async function getOperatorDepthDashboard(): Promise<OperatorDepthDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [
    metricResult,
    serviceAreaResult,
    crewResult,
    sourceResult,
    connectorResult,
    credentialResult,
    digestResult,
    exportResult,
    documentResult,
    supportResult,
    endpointResult
  ] = await Promise.all([
    queryPostgres<{
      service_areas: string;
      crew_bench: string;
      source_scores: string;
      connector_runs: string;
      credential_alerts: string;
      export_queue: string;
      document_reviews: string;
      support_issues: string;
      endpoint_events: string;
    }>(
      `
      select
        (select count(*) from public.service_area_targets where tenant_id = $1 and status <> 'archived')::text as service_areas,
        (select count(*) from public.provider_crew_bench where tenant_id = $1 and relationship_status <> 'blocked')::text as crew_bench,
        (select count(*) from public.lead_source_scores where tenant_id = $1)::text as source_scores,
        (select count(*) from public.connector_run_history where tenant_id = $1 and started_at >= now() - interval '14 days')::text as connector_runs,
        (select count(*) from public.credential_rotation_alerts where tenant_id = $1 and status in ('watching','due_soon','expired'))::text as credential_alerts,
        (select count(*) from public.review_first_export_queue where tenant_id = $1 and status in ('draft','needs_review','blocked'))::text as export_queue,
        (select count(*) from public.document_review_items where tenant_id = $1 and status in ('needs_review','reviewing','needs_changes'))::text as document_reviews,
        (select count(*) from public.support_issue_queue where tenant_id = $1 and status in ('open','reviewing'))::text as support_issues,
        (select count(*) from public.public_endpoint_events where tenant_id = $1 and created_at >= now() - interval '7 days')::text as endpoint_events
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      radius_miles: number;
      priority: number;
      status: string;
      notes: string | null;
    }>(
      `
      select id, name, city, state, radius_miles, priority, status, notes
      from public.service_area_targets
      where tenant_id = $1 and status <> 'archived'
      order by priority desc, name
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      display_name: string;
      company_name: string | null;
      provider_type: string;
      availability_status: string;
      relationship_status: string;
      city: string | null;
      state: string | null;
    }>(
      `
      select id, display_name, company_name, provider_type, availability_status, relationship_status, city, state
      from public.provider_crew_bench
      where tenant_id = $1
      order by updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      source_name: string;
      source_family: string | null;
      lead_count: number;
      won_count: number;
      revenue_cents: number;
      fit_score: number;
      urgency_score: number;
      recommendation: string | null;
    }>(
      `
      select id, source_name, source_family, lead_count, won_count, revenue_cents, fit_score, urgency_score, recommendation
      from public.lead_source_scores
      where tenant_id = $1
      order by fit_score desc, urgency_score desc, updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      run_type: string;
      status: string;
      records_found: number;
      failures: number;
      started_at: Date;
      error_message: string | null;
    }>(
      `
      select id, provider_key, run_type, status, records_found, failures, started_at, error_message
      from public.connector_run_history
      where tenant_id = $1
      order by started_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      credential_label: string | null;
      status: string;
      severity: string;
      notes: string | null;
    }>(
      `
      select id, provider_key, credential_label, status, severity, notes
      from public.credential_rotation_alerts
      where tenant_id = $1
      order by severity desc, updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      digest_date: Date;
      status: string;
      urgent_leads: number;
      stale_estimates: number;
      overdue_invoices: number;
      review_opportunities: number;
      seo_refreshes: number;
      provider_issues: number;
      summary: string | null;
    }>(
      `
      select id, digest_date, status, urgent_leads, stale_estimates, overdue_invoices, review_opportunities, seo_refreshes, provider_issues, summary
      from public.operator_daily_digests
      where tenant_id = $1
      order by digest_date desc
      limit 7
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      export_type: string;
      title: string;
      target_label: string | null;
      status: string;
      risk_level: string;
    }>(
      `
      select id, export_type, title, target_label, status, risk_level
      from public.review_first_export_queue
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      related_type: string;
      title: string;
      status: string;
      risk_level: string;
      summary: string | null;
    }>(
      `
      select id, related_type, title, status, risk_level, summary
      from public.document_review_items
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      source: string;
      issue_type: string;
      status: string;
      severity: string;
      subject: string | null;
      message: string;
    }>(
      `
      select id, source, issue_type, status, severity, subject, message
      from public.support_issue_queue
      where tenant_id = $1 or tenant_id is null
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      endpoint_key: string;
      event_type: string;
      provider_key: string | null;
      status_code: number | null;
      created_at: Date;
    }>(
      `
      select id, endpoint_key, event_type, provider_key, status_code, created_at
      from public.public_endpoint_events
      where tenant_id = $1 or tenant_id is null
      order by created_at desc
      limit 10
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricResult?.rows[0];

  return {
    metrics: {
      serviceAreas: numberFrom(metrics?.service_areas),
      crewBench: numberFrom(metrics?.crew_bench),
      sourceScores: numberFrom(metrics?.source_scores),
      connectorRuns: numberFrom(metrics?.connector_runs),
      credentialAlerts: numberFrom(metrics?.credential_alerts),
      exportQueue: numberFrom(metrics?.export_queue),
      documentReviews: numberFrom(metrics?.document_reviews),
      supportIssues: numberFrom(metrics?.support_issues),
      endpointEvents: numberFrom(metrics?.endpoint_events)
    },
    serviceAreas: (serviceAreaResult?.rows ?? []).map((item) =>
      row(item.id, item.name, item.notes, item.status, `${item.city ?? "Any city"}, ${item.state ?? "any state"} / ${item.radius_miles} miles / priority ${item.priority}`)
    ),
    crewBench: (crewResult?.rows ?? []).map((item) =>
      row(item.id, item.display_name, item.company_name, item.relationship_status, `${item.provider_type} / ${item.availability_status} / ${item.city ?? "No city"} ${item.state ?? ""}`)
    ),
    sourceScores: (sourceResult?.rows ?? []).map((item) =>
      row(item.id, item.source_name, item.recommendation, `${item.fit_score}/100`, `${item.source_family ?? "source"} / ${item.lead_count} leads / ${item.won_count} won / urgency ${item.urgency_score}`)
    ),
    connectorRuns: (connectorResult?.rows ?? []).map((item) =>
      row(item.id, item.provider_key, item.error_message, item.status, `${item.run_type} / ${item.records_found} found / ${item.failures} failures`)
    ),
    credentialAlerts: (credentialResult?.rows ?? []).map((item) =>
      row(item.id, item.provider_key, item.notes, item.status, `${item.credential_label ?? "credential"} / ${item.severity}`)
    ),
    dailyDigests: (digestResult?.rows ?? []).map((item) =>
      row(item.id, new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.digest_date)), item.summary, item.status, `${item.urgent_leads} urgent leads / ${item.stale_estimates} estimates / ${item.overdue_invoices} invoices / ${item.provider_issues} provider issues`)
    ),
    exportQueue: (exportResult?.rows ?? []).map((item) =>
      row(item.id, item.title, item.target_label, item.status, `${item.export_type} / ${item.risk_level}`)
    ),
    documentReviews: (documentResult?.rows ?? []).map((item) =>
      row(item.id, item.title, item.summary, item.status, `${item.related_type} / ${item.risk_level}`)
    ),
    supportIssues: (supportResult?.rows ?? []).map((item) =>
      row(item.id, item.subject ?? item.issue_type, item.message, item.status, `${item.source} / ${item.severity}`)
    ),
    endpointEvents: (endpointResult?.rows ?? []).map((item) =>
      row(item.id, item.endpoint_key, item.provider_key, item.event_type, `HTTP ${item.status_code ?? "n/a"}`)
    )
  };
}
