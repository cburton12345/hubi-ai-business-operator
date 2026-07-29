import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { evaluateVisitCompletion } from "@/lib/field-ops/evaluate-visit-completion";
import { evaluateVisitSchedule } from "@/lib/scheduling/evaluate-visit";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const mutationSchema = z.object({
  clientMutationId: z.string().min(8).max(180),
  mutationType: z.enum(["visit_status", "field_note"]),
  visitId: z.string().uuid(),
  baseRecordVersion: z.string().max(180).optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

const batchSchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(100)
});

const allowedVisitStatuses = new Set([
  "dispatched",
  "en_route",
  "arrived",
  "in_progress",
  "paused",
  "completed",
  "no_show"
]);

async function authorizeFieldAccess(tenantId: string, visitId: string, userId: string | null, admin: boolean) {
  const result = await queryPostgres<{ id: string; updated_at: string; service_job_id: string | null }>(
    `
    select v.id, v.updated_at, v.service_job_id
    from public.service_visits v
    where v.tenant_id = $1 and v.id = $2
      and (
        $4::boolean
        or exists (
          select 1
          from public.service_visit_assignments va
          join public.operations_workers w
            on w.id = va.worker_id and w.tenant_id = va.tenant_id
          where va.tenant_id = v.tenant_id and va.visit_id = v.id
            and va.status <> 'removed' and w.user_id = $3
        )
        or exists (
          select 1 from public.tenant_users tu
          where tu.tenant_id = v.tenant_id and tu.user_id = $3
            and tu.role in ('owner','admin','operator')
        )
      )
    limit 1
    `,
    [tenantId, visitId, userId, admin]
  );
  return result?.rows[0] ?? null;
}

export async function GET() {
  const [session, admin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!session && !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await getCurrentWorkspaceId();

  const snapshotResult = await queryPostgres<{
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    updated_at: string;
    customer_name: string;
    customer_phone: string | null;
    address: string | null;
    scope: string | null;
    access_instructions: string | null;
    dispatch_notes: string | null;
    form_assignments: unknown;
  }>(
    `
    select
      v.id, v.title, v.status, v.priority, v.scheduled_start, v.scheduled_end,
      v.updated_at, c.name as customer_name, c.phone as customer_phone,
      nullif(concat_ws(', ', l.address_line1, l.address_line2, l.city, l.state, l.postal_code), '') as address,
      coalesce(wo.description, v.field_instructions) as scope,
      l.access_instructions, v.dispatch_notes,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'assignmentId', fa.id,
          'name', ft.name,
          'version', ft.version,
          'requiredForCompletion', fa.required_for_completion,
          'status', fa.status,
          'schema', ft.schema_json
        ) order by fa.required_for_completion desc, fa.assigned_at)
        from public.field_form_assignments fa
        join public.field_form_templates ft
          on ft.id = fa.template_id and ft.tenant_id = fa.tenant_id
        where fa.tenant_id = v.tenant_id and fa.visit_id = v.id
          and fa.status <> 'waived'
      ), '[]'::jsonb) as form_assignments
    from public.service_visits v
    join public.customers c on c.id = v.customer_id and c.tenant_id = v.tenant_id
    join public.service_work_orders wo on wo.id = v.work_order_id and wo.tenant_id = v.tenant_id
    left join public.customer_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
    where v.tenant_id = $1
      and v.status not in ('completed','canceled','no_show')
      and (v.scheduled_start is null or v.scheduled_start < now() + interval '14 days')
      and (
        $3::boolean
        or exists (
          select 1
          from public.service_visit_assignments va
          join public.operations_workers w
            on w.id = va.worker_id and w.tenant_id = va.tenant_id
          where va.tenant_id = v.tenant_id and va.visit_id = v.id
            and va.status <> 'removed' and w.user_id = $2
        )
        or exists (
          select 1 from public.tenant_users tu
          where tu.tenant_id = v.tenant_id and tu.user_id = $2
            and tu.role in ('owner','admin','operator')
        )
      )
    order by v.scheduled_start nulls last, v.priority desc
    limit 100
    `,
    [tenantId, session?.userId ?? null, admin]
  );

  return NextResponse.json({
    version: new Date().toISOString(),
    tenantId,
    userId: session?.userId ?? "admin",
    visits: snapshotResult?.rows ?? []
  });
}

export async function POST(request: Request) {
  const [session, admin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!session && !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mutation batch" }, { status: 400 });
  const tenantId = await getCurrentWorkspaceId();
  const results: Array<Record<string, unknown>> = [];

  for (const mutation of parsed.data.mutations) {
    const authorized = await authorizeFieldAccess(tenantId, mutation.visitId, session?.userId ?? null, admin);
    if (!authorized) {
      results.push({ clientMutationId: mutation.clientMutationId, status: "rejected", reason: "Visit access denied" });
      continue;
    }

    const existingResult = await queryPostgres<{ status: string; server_record_version: string | null }>(
      `
      select status, server_record_version
      from public.field_offline_mutations
      where tenant_id = $1 and client_mutation_id = $2
      limit 1
      `,
      [tenantId, mutation.clientMutationId]
    );
    const existing = existingResult?.rows[0];
    if (existing?.status === "applied") {
      results.push({ clientMutationId: mutation.clientMutationId, status: "applied", replayed: true, version: existing.server_record_version });
      continue;
    }

    const baseConflict =
      mutation.baseRecordVersion &&
      new Date(authorized.updated_at).getTime() > new Date(mutation.baseRecordVersion).getTime();

    await queryPostgres(
      `
      insert into public.field_offline_mutations (
        tenant_id, visit_id, client_mutation_id, mutation_type, payload_json,
        status, base_record_version, conflict_json, metadata_json
      )
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb)
      on conflict (tenant_id, client_mutation_id)
      do update set
        status = excluded.status,
        conflict_json = excluded.conflict_json,
        updated_at = now()
      `,
      [
        tenantId,
        mutation.visitId,
        mutation.clientMutationId,
        mutation.mutationType,
        JSON.stringify(mutation.payload),
        baseConflict ? "conflict" : "processing",
        mutation.baseRecordVersion ?? null,
        JSON.stringify(baseConflict ? { serverVersion: authorized.updated_at, reason: "Visit changed after offline snapshot" } : {}),
        JSON.stringify({ userId: session?.userId ?? "admin" })
      ]
    );

    if (baseConflict) {
      results.push({ clientMutationId: mutation.clientMutationId, status: "conflict", serverVersion: authorized.updated_at });
      continue;
    }

    try {
      if (mutation.mutationType === "field_note") {
        const note = typeof mutation.payload.note === "string" ? mutation.payload.note.trim().slice(0, 4000) : "";
        if (!note) throw new Error("Field note is empty.");
        await queryPostgres(
          `
          insert into public.service_operating_events (
            tenant_id, customer_id, location_id, work_order_id, visit_id,
            event_type, source_type, source_id, title, detail, metadata_json
          )
          select v.tenant_id, v.customer_id, v.location_id, v.work_order_id, v.id,
                 'field_note', 'worker', $3, 'Offline field note', $4,
                 '{"source":"offline_sync"}'::jsonb
          from public.service_visits v
          where v.tenant_id = $1 and v.id = $2
          `,
          [tenantId, mutation.visitId, mutation.clientMutationId, note]
        );
      } else {
        const status = typeof mutation.payload.status === "string" ? mutation.payload.status : "";
        if (!allowedVisitStatuses.has(status)) throw new Error("Unsupported visit status.");
        if (["dispatched", "en_route", "arrived", "in_progress"].includes(status)) {
          const conflicts = await evaluateVisitSchedule({ tenantId, visitId: mutation.visitId });
          if (conflicts.some((conflict) => conflict.severity === "blocking")) {
            throw new Error("Blocking schedule conflict prevents this field transition.");
          }
        }
        if (status === "completed") {
          const completion = await evaluateVisitCompletion({ tenantId, visitId: mutation.visitId });
          if (!completion.ready) throw new Error("Required completion evidence is missing.");
        }
        await queryPostgres(
          `
          update public.service_visits
          set status = $3,
              actual_departed_at = case when $3 = 'en_route' then coalesce(actual_departed_at, now()) else actual_departed_at end,
              actual_arrived_at = case when $3 = 'arrived' then coalesce(actual_arrived_at, now()) else actual_arrived_at end,
              actual_started_at = case when $3 = 'in_progress' then coalesce(actual_started_at, now()) else actual_started_at end,
              actual_completed_at = case when $3 = 'completed' then coalesce(actual_completed_at, now()) else actual_completed_at end,
              updated_at = now()
          where tenant_id = $1 and id = $2
          `,
          [tenantId, mutation.visitId, status]
        );
        await queryPostgres(
          `
          with visit as (
            select tenant_id, work_order_id, service_job_id, customer_id, location_id, id
            from public.service_visits
            where tenant_id = $1 and id = $2
          ),
          work_order_update as (
            update public.service_work_orders w
            set status = case
                  when $3 in ('dispatched','en_route','arrived','in_progress','paused') then 'in_progress'
                  when $3 = 'completed' then 'completed'
                  when $3 = 'no_show' then 'on_hold'
                  else w.status
                end,
                completed_at = case when $3 = 'completed' then coalesce(w.completed_at, now()) else w.completed_at end,
                updated_at = now()
            from visit v
            where w.tenant_id = v.tenant_id and w.id = v.work_order_id
          ),
          job_update as (
            update public.service_jobs j
            set status = case
                  when $3 in ('dispatched','en_route','arrived') then 'scheduled'
                  when $3 in ('in_progress','paused') then 'in_progress'
                  when $3 = 'completed' then 'completed'
                  else j.status
                end,
                updated_at = now()
            from visit v
            where j.tenant_id = v.tenant_id and j.id = v.service_job_id
          )
          insert into public.service_operating_events (
            tenant_id, customer_id, location_id, work_order_id, visit_id,
            event_type, source_type, source_id, title, next_state_json, metadata_json
          )
          select v.tenant_id, v.customer_id, v.location_id, v.work_order_id, v.id,
            'visit_status_changed', 'worker', $4,
            'Field visit status changed offline.',
            jsonb_build_object('status', $3),
            '{"source":"offline_sync"}'::jsonb
          from visit v
          `,
          [tenantId, mutation.visitId, status, mutation.clientMutationId]
        );
      }

      const versionResult = await queryPostgres<{ updated_at: string }>(
        `select updated_at from public.service_visits where tenant_id = $1 and id = $2`,
        [tenantId, mutation.visitId]
      );
      const serverVersion = versionResult?.rows[0]?.updated_at ?? new Date().toISOString();
      await queryPostgres(
        `
        update public.field_offline_mutations
        set status = 'applied', server_record_version = $3, applied_at = now(), updated_at = now()
        where tenant_id = $1 and client_mutation_id = $2
        `,
        [tenantId, mutation.clientMutationId, serverVersion]
      );
      results.push({ clientMutationId: mutation.clientMutationId, status: "applied", version: serverVersion });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Offline mutation failed.";
      await queryPostgres(
        `
        update public.field_offline_mutations
        set status = 'failed', error_message = $3, updated_at = now()
        where tenant_id = $1 and client_mutation_id = $2
        `,
        [tenantId, mutation.clientMutationId, message]
      );
      results.push({ clientMutationId: mutation.clientMutationId, status: "failed", reason: message });
    }
  }

  return NextResponse.json({ results });
}
