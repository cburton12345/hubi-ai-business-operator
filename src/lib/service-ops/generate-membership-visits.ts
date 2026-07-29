import { queryPostgres } from "@/lib/db/postgres";

type GeneratedVisit = {
  recurring_plan_id: string;
  work_order_id: string;
  visit_id: string;
  scheduled_for: Date;
};

/**
 * Converts due recurring service promises into canonical unscheduled visits.
 * The plan/date external key makes repeated automation runs idempotent.
 */
export async function generateDueMembershipVisits(tenantId: string, customerId?: string) {
  const result = await queryPostgres<GeneratedVisit>(
    `
    with due as (
      select p.*, coalesce(
        p.location_id,
        (select l.id from public.customer_locations l
          where l.tenant_id = p.tenant_id and l.customer_id = p.customer_id and l.active = true
          order by l.is_primary desc, l.created_at limit 1)
      ) as resolved_location_id
      from public.recurring_service_plans p
      where p.tenant_id = $1
        and ($2::uuid is null or p.customer_id = $2)
        and p.status = 'active'
        and p.next_service_date is not null
        and p.next_service_date <= current_date + 45
        and not exists (
          select 1 from public.service_visits v
          where v.tenant_id = p.tenant_id
            and v.recurring_plan_id = p.id
            and v.status not in ('completed', 'canceled', 'no_show')
        )
      order by p.next_service_date
      limit 200
    ),
    work_orders as (
      insert into public.service_work_orders (
        tenant_id, brand_id, customer_id, location_id, recurring_plan_id,
        external_key, title, service_type, description, status, requested_start,
        customer_summary, ai_next_action, metadata_json
      )
      select
        d.tenant_id, d.brand_id, d.customer_id, d.resolved_location_id, d.id,
        'recurring:' || d.id::text || ':' || d.next_service_date::text,
        d.title, d.service_type, d.internal_notes, 'ready_to_schedule',
        d.next_service_date::timestamptz,
        'Planned service included in the customer recurring service agreement.',
        'Schedule this promised recurring visit before its due date.',
        jsonb_build_object('generated_by', 'membership_engine', 'due_date', d.next_service_date)
      from due d
      on conflict (tenant_id, external_key) where external_key is not null
      do update set updated_at = public.service_work_orders.updated_at
      returning id, tenant_id, customer_id, location_id, recurring_plan_id, brand_id, title, service_type, requested_start
    ),
    visits as (
      insert into public.service_visits (
        tenant_id, brand_id, work_order_id, customer_id, location_id, recurring_plan_id,
        external_key, title, service_type, status, priority, arrival_window_start,
        customer_notes, metadata_json
      )
      select
        w.tenant_id, w.brand_id, w.id, w.customer_id, w.location_id, w.recurring_plan_id,
        'recurring-visit:' || w.recurring_plan_id::text || ':' || w.requested_start::date::text,
        w.title, w.service_type, 'unscheduled', 'normal', w.requested_start,
        'Recurring service visit; office must confirm the final appointment window.',
        jsonb_build_object('generated_by', 'membership_engine')
      from work_orders w
      on conflict (tenant_id, external_key) where external_key is not null
      do update set updated_at = public.service_visits.updated_at
      returning id, tenant_id, customer_id, recurring_plan_id, work_order_id, arrival_window_start
    ),
    advanced as (
      update public.recurring_service_plans p
      set last_visit_generated_at = now(),
        next_service_date = case p.frequency
          when 'weekly' then p.next_service_date + 7
          when 'monthly' then (p.next_service_date + interval '1 month')::date
          when 'quarterly' then (p.next_service_date + interval '3 months')::date
          when 'annual' then (p.next_service_date + interval '1 year')::date
          else null
        end,
        visits_remaining = case
          when p.visits_remaining is null then null
          else greatest(p.visits_remaining - 1, 0)
        end,
        ai_next_action = 'Recurring visit created. Confirm the appointment window and assign an eligible worker.',
        updated_at = now()
      from visits v
      where p.tenant_id = v.tenant_id and p.id = v.recurring_plan_id
    ),
    events as (
      insert into public.service_operating_events (
        tenant_id, customer_id, work_order_id, visit_id, event_type, source_type, title, metadata_json
      )
      select v.tenant_id, v.customer_id, v.work_order_id, v.id,
        'recurring_visit_generated', 'system',
        'Ferocity created an unscheduled visit from a due recurring service plan.',
        jsonb_build_object('recurring_plan_id', v.recurring_plan_id)
      from visits v
    )
    select recurring_plan_id, work_order_id, id as visit_id, arrival_window_start as scheduled_for
    from visits
    `,
    [tenantId, customerId ?? null]
  );
  return result?.rows ?? [];
}
