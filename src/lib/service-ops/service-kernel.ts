import { queryPostgres } from "@/lib/db/postgres";

type ServiceJobKernelRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  customer_id: string;
  source_lead_id: string | null;
  estimate_id: string | null;
  work_order_id: string | null;
  title: string;
  status: "unscheduled" | "scheduled" | "in_progress" | "completed" | "canceled" | "lost";
  scheduled_start: string | null;
  scheduled_end: string | null;
  service_area: string | null;
  dispatcher_notes: string | null;
  completion_notes: string | null;
  ai_next_action: string | null;
  created_at: string;
  updated_at: string;
};

type KernelLink = {
  locationId: string;
  workOrderId: string;
  visitId: string;
};

function workOrderStatus(status: ServiceJobKernelRow["status"]) {
  if (status === "unscheduled") return "ready_to_schedule";
  if (status === "scheduled") return "scheduled";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "canceled") return "canceled";
  return "lost";
}

function visitStatus(status: ServiceJobKernelRow["status"]) {
  if (status === "unscheduled") return "unscheduled";
  if (status === "scheduled") return "scheduled";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  return "canceled";
}

function durationMinutes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export async function ensureServiceKernelForJob(params: {
  tenantId: string;
  jobId: string;
  eventSource?: "system" | "user" | "worker" | "customer" | "ai" | "provider";
}): Promise<KernelLink | null> {
  const jobResult = await queryPostgres<ServiceJobKernelRow>(
    `
    select id, tenant_id, brand_id, customer_id, source_lead_id, estimate_id,
           work_order_id, title, status, scheduled_start, scheduled_end,
           service_area, dispatcher_notes, completion_notes, ai_next_action,
           created_at, updated_at
    from public.service_jobs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [params.tenantId, params.jobId]
  );
  const job = jobResult?.rows[0];
  if (!job) return null;

  const locationResult = await queryPostgres<{ id: string }>(
    `
    insert into public.customer_locations (
      tenant_id, brand_id, customer_id, name, location_type, address_line1,
      address_line2, city, state, postal_code, is_primary, metadata_json
    )
    select c.tenant_id, coalesce(c.brand_id, $3::uuid), c.id, 'Primary location',
           'service_and_billing', c.address_line1, c.address_line2, c.city,
           c.state, c.postal_code, true, '{"createdBy":"service_kernel"}'::jsonb
    from public.customers c
    where c.tenant_id = $1 and c.id = $2
    on conflict (tenant_id, customer_id) where is_primary and active
    do update set
      brand_id = coalesce(public.customer_locations.brand_id, excluded.brand_id),
      updated_at = now()
    returning id
    `,
    [params.tenantId, job.customer_id, job.brand_id]
  );
  const locationId = locationResult?.rows[0]?.id;
  if (!locationId) return null;

  const priorWorkOrderResult = await queryPostgres<{ id: string; status: string }>(
    `
    select id, status
    from public.service_work_orders
    where tenant_id = $1 and external_key = $2
    limit 1
    `,
    [params.tenantId, `legacy-job:${job.id}`]
  );
  const priorWorkOrder = priorWorkOrderResult?.rows[0];

  const nextWorkOrderStatus = workOrderStatus(job.status);
  const workOrderResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_work_orders (
      tenant_id, brand_id, customer_id, location_id, source_lead_id, estimate_id,
      service_job_id, external_key, work_order_number, title, description,
      status, requested_start, requested_end, completed_at, canceled_at,
      cancellation_reason, internal_notes, ai_next_action, metadata_json,
      created_at, updated_at
    )
    values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
      '{"source":"service_job"}'::jsonb,$20,$21
    )
    on conflict (tenant_id, external_key) where external_key is not null
    do update set
      brand_id = excluded.brand_id,
      customer_id = excluded.customer_id,
      location_id = excluded.location_id,
      source_lead_id = excluded.source_lead_id,
      estimate_id = excluded.estimate_id,
      service_job_id = excluded.service_job_id,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      requested_start = excluded.requested_start,
      requested_end = excluded.requested_end,
      completed_at = excluded.completed_at,
      canceled_at = excluded.canceled_at,
      cancellation_reason = excluded.cancellation_reason,
      internal_notes = excluded.internal_notes,
      ai_next_action = excluded.ai_next_action,
      updated_at = excluded.updated_at
    returning id
    `,
    [
      params.tenantId,
      job.brand_id,
      job.customer_id,
      locationId,
      job.source_lead_id,
      job.estimate_id,
      job.id,
      `legacy-job:${job.id}`,
      `WO-${job.id.replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      job.title,
      job.completion_notes ?? job.dispatcher_notes,
      nextWorkOrderStatus,
      job.scheduled_start,
      job.scheduled_end,
      job.status === "completed" ? job.updated_at : null,
      job.status === "canceled" || job.status === "lost" ? job.updated_at : null,
      job.status === "lost" ? "Work was marked lost." : null,
      job.dispatcher_notes,
      job.ai_next_action,
      job.created_at,
      job.updated_at
    ]
  );
  const workOrderId = workOrderResult?.rows[0]?.id;
  if (!workOrderId) return null;

  await queryPostgres(
    `
    update public.service_jobs
    set location_id = $3, work_order_id = $4
    where tenant_id = $1 and id = $2
      and (location_id is distinct from $3 or work_order_id is distinct from $4)
    `,
    [params.tenantId, job.id, locationId, workOrderId]
  );

  const priorVisitResult = await queryPostgres<{ id: string; status: string }>(
    `
    select id, status
    from public.service_visits
    where tenant_id = $1 and external_key = $2
    limit 1
    `,
    [params.tenantId, `legacy-job-visit:${job.id}`]
  );
  const priorVisit = priorVisitResult?.rows[0];
  const nextVisitStatus = visitStatus(job.status);

  const visitResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_visits (
      tenant_id, brand_id, work_order_id, customer_id, location_id,
      service_job_id, external_key, visit_number, title, status,
      scheduled_start, scheduled_end, expected_duration_minutes,
      actual_started_at, actual_completed_at, dispatch_notes,
      completion_summary, metadata_json, created_at, updated_at
    )
    values (
      $1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      '{"source":"service_job"}'::jsonb,$17,$18
    )
    on conflict (tenant_id, external_key) where external_key is not null
    do update set
      brand_id = excluded.brand_id,
      work_order_id = excluded.work_order_id,
      customer_id = excluded.customer_id,
      location_id = excluded.location_id,
      service_job_id = excluded.service_job_id,
      title = excluded.title,
      status = excluded.status,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      expected_duration_minutes = excluded.expected_duration_minutes,
      actual_started_at = coalesce(public.service_visits.actual_started_at, excluded.actual_started_at),
      actual_completed_at = coalesce(public.service_visits.actual_completed_at, excluded.actual_completed_at),
      dispatch_notes = excluded.dispatch_notes,
      completion_summary = excluded.completion_summary,
      updated_at = excluded.updated_at
    returning id
    `,
    [
      params.tenantId,
      job.brand_id,
      workOrderId,
      job.customer_id,
      locationId,
      job.id,
      `legacy-job-visit:${job.id}`,
      job.title,
      nextVisitStatus,
      job.scheduled_start,
      job.scheduled_end,
      durationMinutes(job.scheduled_start, job.scheduled_end),
      job.status === "in_progress" ? job.updated_at : null,
      job.status === "completed" ? job.updated_at : null,
      job.dispatcher_notes,
      job.completion_notes,
      job.created_at,
      job.updated_at
    ]
  );
  const visitId = visitResult?.rows[0]?.id;
  if (!visitId) return null;

  const changed =
    !priorWorkOrder ||
    !priorVisit ||
    priorWorkOrder.status !== nextWorkOrderStatus ||
    priorVisit.status !== nextVisitStatus;

  if (changed) {
    await queryPostgres(
      `
      insert into public.service_operating_events (
        tenant_id, brand_id, customer_id, location_id, work_order_id, visit_id,
        event_type, source_type, source_id, title, detail,
        previous_state_json, next_state_json, metadata_json
      )
      values ($1,$2,$3,$4,$5,$6,'job_kernel_synchronized',$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)
      `,
      [
        params.tenantId,
        job.brand_id,
        job.customer_id,
        locationId,
        workOrderId,
        visitId,
        params.eventSource ?? "system",
        job.id,
        priorWorkOrder || priorVisit ? "Service status synchronized" : "Service work order created",
        priorWorkOrder || priorVisit
          ? "The existing job, work order, and visit now share the same operational status."
          : "Ferocity connected the job to its canonical location, work order, and first visit.",
        JSON.stringify({
          workOrderStatus: priorWorkOrder?.status ?? null,
          visitStatus: priorVisit?.status ?? null
        }),
        JSON.stringify({
          jobStatus: job.status,
          workOrderStatus: nextWorkOrderStatus,
          visitStatus: nextVisitStatus
        }),
        JSON.stringify({ serviceJobId: job.id })
      ]
    );
  }

  return { locationId, workOrderId, visitId };
}
