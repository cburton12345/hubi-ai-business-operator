import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type VisitRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  field_instructions: string | null;
  dispatch_notes: string | null;
  customer_notes: string | null;
  completion_summary: string | null;
  completion_readiness_status: string;
  completion_readiness_json: Record<string, unknown> | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  location_name: string | null;
  address: string | null;
  access_instructions: string | null;
  parking_instructions: string | null;
  gate_code: string | null;
  work_order_number: string | null;
  work_order_description: string | null;
  estimate_id: string | null;
  service_job_id: string | null;
};

type FormRow = {
  assignment_id: string;
  template_id: string;
  name: string;
  description: string | null;
  form_type: string;
  version: number;
  schema_json: { fields?: Array<Record<string, unknown>> } | null;
  assignment_status: string;
  required_for_completion: boolean;
  latest_submission_id: string | null;
  latest_submission_status: string | null;
  latest_response_json: Record<string, unknown> | null;
  validation_errors_json: unknown;
};

export async function getFieldVisit(visitId: string) {
  const tenantId = await getCurrentWorkspaceId();
  const [visitResult, formsResult, assetsResult, eventsResult, mediaResult] = await Promise.all([
    queryPostgres<VisitRow>(
      `
      select
        v.id, v.title, v.status, v.priority, v.scheduled_start, v.scheduled_end,
        v.arrival_window_start, v.arrival_window_end, v.field_instructions,
        v.dispatch_notes, v.customer_notes, v.completion_summary,
        v.completion_readiness_status, v.completion_readiness_json,
        c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
        l.name as location_name,
        nullif(concat_ws(', ', l.address_line1, l.address_line2, l.city, l.state, l.postal_code), '') as address,
        l.access_instructions, l.parking_instructions, l.gate_code,
        wo.work_order_number, wo.description as work_order_description,
        wo.estimate_id, v.service_job_id
      from public.service_visits v
      join public.customers c on c.id = v.customer_id and c.tenant_id = v.tenant_id
      join public.service_work_orders wo on wo.id = v.work_order_id and wo.tenant_id = v.tenant_id
      left join public.customer_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
      where v.tenant_id = $1 and v.id = $2
      limit 1
      `,
      [tenantId, visitId]
    ),
    queryPostgres<FormRow>(
      `
      select
        a.id as assignment_id, t.id as template_id, t.name, t.description,
        t.form_type, t.version, t.schema_json, a.status as assignment_status,
        a.required_for_completion,
        latest.id as latest_submission_id,
        latest.status as latest_submission_status,
        latest.response_json as latest_response_json,
        latest.validation_errors_json
      from public.field_form_assignments a
      join public.field_form_templates t
        on t.id = a.template_id and t.tenant_id = a.tenant_id
      left join lateral (
        select s.id, s.status, s.response_json, s.validation_errors_json
        from public.field_form_submissions s
        where s.tenant_id = a.tenant_id and s.assignment_id = a.id
          and s.status <> 'superseded'
        order by s.created_at desc
        limit 1
      ) latest on true
      where a.tenant_id = $1 and a.visit_id = $2
        and a.status <> 'waived'
      order by a.required_for_completion desc, a.assigned_at
      `,
      [tenantId, visitId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      asset_type: string;
      manufacturer: string | null;
      model: string | null;
      serial_number: string | null;
      condition: string;
      warranty_expires_at: string | null;
      last_service_at: string | null;
    }>(
      `
      select id, name, asset_type, manufacturer, model, serial_number,
             condition, warranty_expires_at::text, last_service_at::text
      from public.customer_assets a
      where a.tenant_id = $1
        and a.location_id = (
          select location_id from public.service_visits
          where tenant_id = $1 and id = $2
        )
        and a.status = 'active'
      order by a.name
      `,
      [tenantId, visitId]
    ),
    queryPostgres<{
      id: string;
      event_type: string;
      title: string;
      detail: string | null;
      source_type: string;
      occurred_at: string;
    }>(
      `
      select id, event_type, title, detail, source_type, occurred_at
      from public.service_operating_events
      where tenant_id = $1 and visit_id = $2
      order by occurred_at desc
      limit 30
      `,
      [tenantId, visitId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      media_type: string;
      file_url: string | null;
      ai_summary: string | null;
      status: string;
      created_at: string;
    }>(
      `
      select m.id, m.title, m.media_type, m.file_url, m.ai_summary, m.status, m.created_at
      from public.operations_field_media m
      where m.tenant_id = $1
        and m.service_job_id = (
          select service_job_id from public.service_visits
          where tenant_id = $1 and id = $2
        )
      order by m.created_at desc
      limit 30
      `,
      [tenantId, visitId]
    )
  ]);

  const visit = visitResult?.rows[0];
  if (!visit) return null;

  return {
    tenantId,
    visit: {
      id: visit.id,
      title: visit.title,
      status: visit.status,
      priority: visit.priority,
      scheduledStart: visit.scheduled_start,
      scheduledEnd: visit.scheduled_end,
      arrivalWindowStart: visit.arrival_window_start,
      arrivalWindowEnd: visit.arrival_window_end,
      fieldInstructions: visit.field_instructions,
      dispatchNotes: visit.dispatch_notes,
      customerNotes: visit.customer_notes,
      completionSummary: visit.completion_summary,
      completionReadinessStatus: visit.completion_readiness_status,
      completionReadiness: visit.completion_readiness_json ?? {},
      customerName: visit.customer_name,
      customerPhone: visit.customer_phone,
      customerEmail: visit.customer_email,
      locationName: visit.location_name,
      address: visit.address,
      accessInstructions: visit.access_instructions,
      parkingInstructions: visit.parking_instructions,
      gateCode: visit.gate_code,
      workOrderNumber: visit.work_order_number,
      workOrderDescription: visit.work_order_description,
      estimateId: visit.estimate_id,
      serviceJobId: visit.service_job_id
    },
    forms: (formsResult?.rows ?? []).map((row) => ({
      assignmentId: row.assignment_id,
      templateId: row.template_id,
      name: row.name,
      description: row.description,
      formType: row.form_type,
      version: row.version,
      fields: Array.isArray(row.schema_json?.fields) ? row.schema_json.fields : [],
      status: row.assignment_status,
      requiredForCompletion: row.required_for_completion,
      latestSubmissionId: row.latest_submission_id,
      latestSubmissionStatus: row.latest_submission_status,
      latestResponses: row.latest_response_json ?? {},
      validationErrors: row.validation_errors_json
    })),
    assets: assetsResult?.rows ?? [],
    events: eventsResult?.rows ?? [],
    media: mediaResult?.rows ?? []
  };
}
