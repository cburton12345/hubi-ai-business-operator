import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type VisitRow = {
  id: string;
  work_order_id: string;
  service_job_id: string | null;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  expected_duration_minutes: number | null;
  customer_confirmation_status: string;
  customer_name: string;
  location_name: string | null;
  address: string | null;
  assigned_workers: string | null;
  assigned_count: string;
  required_crew_size: number;
  open_conflicts: string;
  blocking_conflicts: string;
  customer_token: string | null;
};

type WorkerRow = {
  id: string;
  name: string;
  role_type: string;
  trade: string | null;
  availability_status: string;
  skills: string | null;
  certifications: string | null;
};

type ServiceTypeRow = {
  id: string;
  name: string;
  default_duration_minutes: number;
  required_crew_size: number;
};

type CalendarFeedRow = {
  id: string;
  label: string;
  status: string;
  last_used_at: string | null;
  created_at: string;
};

export async function getScheduleDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const appUrl = env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
  const [visitsResult, workersResult, serviceTypesResult, calendarFeedsResult] = await Promise.all([
    queryPostgres<VisitRow>(
      `
      select
        v.id, v.work_order_id, v.service_job_id, v.title, v.status, v.priority,
        v.scheduled_start, v.scheduled_end, v.expected_duration_minutes,
        v.customer_confirmation_status, c.name as customer_name,
        l.name as location_name,
        nullif(concat_ws(', ', l.address_line1, l.city, l.state, l.postal_code), '') as address,
        string_agg(distinct w.name, ', ' order by w.name) filter (where w.id is not null) as assigned_workers,
        count(distinct va.worker_id) filter (
          where va.worker_id is not null and va.status in ('proposed','assigned','acknowledged','dispatched')
        )::text as assigned_count,
        v.required_crew_size,
        count(distinct vc.id) filter (where vc.status in ('open','acknowledged'))::text as open_conflicts,
        count(distinct vc.id) filter (
          where vc.status in ('open','acknowledged') and vc.severity = 'blocking'
        )::text as blocking_conflicts,
        token.public_token as customer_token
      from public.service_visits v
      join public.customers c on c.id = v.customer_id and c.tenant_id = v.tenant_id
      left join public.customer_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
      left join public.service_visit_assignments va on va.visit_id = v.id and va.tenant_id = v.tenant_id
      left join public.operations_workers w on w.id = va.worker_id and w.tenant_id = v.tenant_id
      left join public.service_visit_conflicts vc on vc.visit_id = v.id and vc.tenant_id = v.tenant_id
      left join lateral (
        select t.public_token
        from public.service_visit_customer_tokens t
        where t.tenant_id = v.tenant_id and t.visit_id = v.id and t.status = 'active'
          and (t.expires_at is null or t.expires_at > now())
        order by t.created_at desc
        limit 1
      ) token on true
      where v.tenant_id = $1
        and (
          v.status = 'unscheduled'
          or v.scheduled_start between now() - interval '1 day' and now() + interval '45 days'
          or v.status in ('dispatched','en_route','arrived','in_progress','paused')
        )
        and v.status not in ('completed','canceled','no_show')
      group by v.id, c.name, l.name, l.address_line1, l.city, l.state, l.postal_code, token.public_token
      order by
        case when v.status = 'unscheduled' then 0 else 1 end,
        v.scheduled_start nulls first,
        case v.priority when 'emergency' then 0 when 'urgent' then 1 when 'high' then 2 else 3 end,
        v.created_at
      `,
      [tenantId]
    ),
    queryPostgres<WorkerRow>(
      `
      select
        w.id, w.name, w.role_type, w.trade, w.availability_status,
        string_agg(distinct s.skill_label, ', ' order by s.skill_label)
          filter (where s.verified and (s.expires_at is null or s.expires_at >= current_date)) as skills,
        string_agg(distinct c.certification_label, ', ' order by c.certification_label)
          filter (where c.verified and (c.expires_at is null or c.expires_at >= current_date)) as certifications
      from public.operations_workers w
      left join public.operations_worker_skills s
        on s.worker_id = w.id and s.tenant_id = w.tenant_id
      left join public.operations_worker_certifications c
        on c.worker_id = w.id and c.tenant_id = w.tenant_id
      where w.tenant_id = $1 and w.availability_status <> 'inactive'
      group by w.id
      order by
        case w.availability_status when 'available' then 0 when 'scheduled' then 1 else 2 end,
        w.name
      `,
      [tenantId]
    ),
    queryPostgres<ServiceTypeRow>(
      `
      select id, name, default_duration_minutes, required_crew_size
      from public.service_types
      where tenant_id = $1 and active
      order by name
      `,
      [tenantId]
    ),
    queryPostgres<CalendarFeedRow>(
      `
      select id, label, status, last_used_at, created_at
      from public.calendar_feed_tokens
      where tenant_id = $1
      order by created_at desc
      limit 12
      `,
      [tenantId]
    )
  ]);

  const visits = (visitsResult?.rows ?? []).map((row) => ({
    id: row.id,
    workOrderId: row.work_order_id,
    serviceJobId: row.service_job_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    expectedDurationMinutes: row.expected_duration_minutes,
    confirmationStatus: row.customer_confirmation_status,
    customerName: row.customer_name,
    locationName: row.location_name,
    address: row.address,
    assignedWorkers: row.assigned_workers,
    assignedCount: Number(row.assigned_count),
    requiredCrewSize: row.required_crew_size,
    openConflicts: Number(row.open_conflicts),
    blockingConflicts: Number(row.blocking_conflicts),
    customerVisitUrl: row.customer_token ? `${appUrl.replace(/\/$/, "")}/visit/${row.customer_token}` : null
  }));

  return {
    visits,
    unscheduled: visits.filter((visit) => visit.status === "unscheduled"),
    scheduled: visits.filter((visit) => visit.status !== "unscheduled"),
    workers: (workersResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      roleType: row.role_type,
      trade: row.trade,
      availabilityStatus: row.availability_status,
      skills: row.skills,
      certifications: row.certifications
    })),
    serviceTypes: (serviceTypesResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      defaultDurationMinutes: row.default_duration_minutes,
      requiredCrewSize: row.required_crew_size
    })),
    calendarFeeds: (calendarFeedsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at
    })),
    appUrl: appUrl.replace(/\/$/, ""),
    metrics: {
      unscheduled: visits.filter((visit) => visit.status === "unscheduled").length,
      scheduled: visits.filter((visit) => visit.status === "scheduled" || visit.status === "confirmed").length,
      active: visits.filter((visit) => ["dispatched", "en_route", "arrived", "in_progress", "paused"].includes(visit.status)).length,
      conflicts: visits.reduce((sum, visit) => sum + visit.openConflicts, 0),
      blocking: visits.reduce((sum, visit) => sum + visit.blockingConflicts, 0)
    }
  };
}
