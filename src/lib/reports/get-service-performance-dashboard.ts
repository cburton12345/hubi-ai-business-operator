import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export async function getServicePerformanceDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const [summaryResult, workerResult, serviceTypeResult] = await Promise.all([
    queryPostgres<{
      visits_30d: string;
      completed_30d: string;
      no_show_30d: string;
      canceled_30d: string;
      on_time_30d: string;
      measured_arrivals_30d: string;
      scheduled_minutes_7d: string;
      active_workers: string;
      weekly_capacity_minutes: string;
      active_memberships: string;
      membership_visits_due: string;
      warranties_expiring: string;
      open_callbacks: string;
      open_inbox: string;
      average_pricebook_margin_bps: string;
    }>(
      `
      select
        (select count(*) from public.service_visits where tenant_id = $1 and scheduled_start >= now() - interval '30 days' and scheduled_start < now())::text as visits_30d,
        (select count(*) from public.service_visits where tenant_id = $1 and status = 'completed' and actual_completed_at >= now() - interval '30 days')::text as completed_30d,
        (select count(*) from public.service_visits where tenant_id = $1 and status = 'no_show' and updated_at >= now() - interval '30 days')::text as no_show_30d,
        (select count(*) from public.service_visits where tenant_id = $1 and status = 'canceled' and updated_at >= now() - interval '30 days')::text as canceled_30d,
        (select count(*) from public.service_visits where tenant_id = $1 and actual_arrived_at is not null and arrival_window_end is not null and actual_arrived_at <= arrival_window_end and actual_arrived_at >= now() - interval '30 days')::text as on_time_30d,
        (select count(*) from public.service_visits where tenant_id = $1 and actual_arrived_at is not null and arrival_window_end is not null and actual_arrived_at >= now() - interval '30 days')::text as measured_arrivals_30d,
        (select coalesce(sum(expected_duration_minutes), 0) from public.service_visits where tenant_id = $1 and scheduled_start >= now() and scheduled_start < now() + interval '7 days' and status not in ('canceled','no_show','completed'))::text as scheduled_minutes_7d,
        (select count(*) from public.operations_workers where tenant_id = $1 and availability_status <> 'inactive')::text as active_workers,
        (select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0) from public.operations_worker_availability where tenant_id = $1 and active and (effective_from is null or effective_from <= current_date + 7) and (effective_until is null or effective_until >= current_date))::text as weekly_capacity_minutes,
        (select count(*) from public.recurring_service_plans where tenant_id = $1 and status = 'active')::text as active_memberships,
        (select count(*) from public.recurring_service_plans where tenant_id = $1 and status = 'active' and next_service_date <= current_date + 30)::text as membership_visits_due,
        (select count(*) from public.customer_assets where tenant_id = $1 and status = 'active' and warranty_expires_at between current_date and current_date + 90)::text as warranties_expiring,
        (select count(*) from public.operator_schedule_events where tenant_id = $1 and event_type = 'callback' and status = 'scheduled')::text as open_callbacks,
        (select count(*) from public.messaging_conversations where tenant_id = $1 and status in ('open','waiting_on_team','human_handoff'))::text as open_inbox,
        (select coalesce(avg(case when price_cents > 0 then ((price_cents - cost_cents)::numeric / price_cents) * 10000 else null end), 0) from public.pricebook_items where tenant_id = $1 and active)::text as average_pricebook_margin_bps
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      assigned: string;
      completed: string;
      on_time: string;
      measured: string;
      average_minutes: string;
    }>(
      `
      select w.id, w.name,
        count(distinct v.id)::text as assigned,
        count(distinct v.id) filter (where v.status = 'completed')::text as completed,
        count(distinct v.id) filter (
          where v.actual_arrived_at is not null and v.arrival_window_end is not null
            and v.actual_arrived_at <= v.arrival_window_end
        )::text as on_time,
        count(distinct v.id) filter (
          where v.actual_arrived_at is not null and v.arrival_window_end is not null
        )::text as measured,
        coalesce(avg(extract(epoch from (v.actual_completed_at - v.actual_started_at)) / 60)
          filter (where v.actual_started_at is not null and v.actual_completed_at is not null), 0)::text as average_minutes
      from public.operations_workers w
      left join public.service_visit_assignments a
        on a.worker_id = w.id and a.tenant_id = w.tenant_id and a.status <> 'removed'
      left join public.service_visits v
        on v.id = a.visit_id and v.tenant_id = a.tenant_id
        and coalesce(v.scheduled_start, v.created_at) >= now() - interval '30 days'
      where w.tenant_id = $1 and w.availability_status <> 'inactive'
      group by w.id
      having count(distinct v.id) > 0
      order by count(distinct v.id) filter (where v.status = 'completed') desc, w.name
      limit 20
      `,
      [tenantId]
    ),
    queryPostgres<{
      label: string;
      visits: string;
      completed: string;
      average_duration_minutes: string;
    }>(
      `
      select coalesce(st.name, nullif(v.service_type, ''), 'Uncategorized') as label,
        count(*)::text as visits,
        count(*) filter (where v.status = 'completed')::text as completed,
        coalesce(avg(extract(epoch from (v.actual_completed_at - v.actual_started_at)) / 60)
          filter (where v.actual_started_at is not null and v.actual_completed_at is not null), 0)::text as average_duration_minutes
      from public.service_visits v
      left join public.service_types st on st.id = v.service_type_id and st.tenant_id = v.tenant_id
      where v.tenant_id = $1 and coalesce(v.scheduled_start, v.created_at) >= now() - interval '90 days'
      group by coalesce(st.name, nullif(v.service_type, ''), 'Uncategorized')
      order by count(*) desc
      limit 12
      `,
      [tenantId]
    )
  ]);

  const summary = summaryResult?.rows[0];
  const measured = number(summary?.measured_arrivals_30d);
  const scheduledMinutes = number(summary?.scheduled_minutes_7d);
  const recordedCapacityMinutes = number(summary?.weekly_capacity_minutes);
  const weeklyCapacityMinutes = recordedCapacityMinutes > 0
    ? recordedCapacityMinutes
    : number(summary?.active_workers) * 40 * 60;

  return {
    metrics: {
      visits30d: number(summary?.visits_30d),
      completionRate: number(summary?.visits_30d) > 0
        ? Math.round((number(summary?.completed_30d) / number(summary?.visits_30d)) * 100)
        : 0,
      onTimeRate: measured > 0 ? Math.round((number(summary?.on_time_30d) / measured) * 100) : 0,
      noShows: number(summary?.no_show_30d),
      cancellations: number(summary?.canceled_30d),
      capacityBooked: weeklyCapacityMinutes > 0 ? Math.min(100, Math.round((scheduledMinutes / weeklyCapacityMinutes) * 100)) : 0,
      activeMemberships: number(summary?.active_memberships),
      membershipVisitsDue: number(summary?.membership_visits_due),
      warrantiesExpiring: number(summary?.warranties_expiring),
      openCallbacks: number(summary?.open_callbacks),
      openInbox: number(summary?.open_inbox),
      averagePricebookMargin: Math.round(number(summary?.average_pricebook_margin_bps) / 100)
    },
    workers: (workerResult?.rows ?? []).map((row) => {
      const workerMeasured = number(row.measured);
      return {
        id: row.id,
        name: row.name,
        assigned: number(row.assigned),
        completed: number(row.completed),
        onTimeRate: workerMeasured > 0 ? Math.round((number(row.on_time) / workerMeasured) * 100) : null,
        averageMinutes: Math.round(number(row.average_minutes))
      };
    }),
    serviceTypes: (serviceTypeResult?.rows ?? []).map((row) => ({
      label: row.label,
      visits: number(row.visits),
      completed: number(row.completed),
      averageDurationMinutes: Math.round(number(row.average_duration_minutes))
    }))
  };
}
