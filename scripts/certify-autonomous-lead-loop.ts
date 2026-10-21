import type { QueryResultRow } from "pg";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function expectEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

async function main() {
  const [{ createPostgresPool }, { advanceIncomingLeadsForTenant }, { advanceRequestedAppointmentsForTenant }] = await Promise.all([
    import("../src/lib/db/postgres"),
    import("../src/lib/leads/advance-incoming-leads"),
    import("../src/lib/revenue-growth/advance-requested-appointments"),
  ]);
  const pool = createPostgresPool();
  if (!pool) throw new Error("DATABASE_URL is not configured.");
  const client = await pool.connect();
  const suffix = crypto.randomUUID().slice(0, 12);
  try {
    await client.query("begin");
    const tenant = await client.query<{ id: string }>(`
      insert into public.tenants (name,slug,status,plan_key)
      values ($1,$2,'active','operator') returning id
    `, [`Lead autonomy certification ${suffix}`, `lead-autonomy-${suffix}`]);
    const tenantId = tenant.rows[0].id;
    const brand = await client.query<{ id: string }>(`
      insert into public.brands (tenant_id,name,slug,business_model,industry,status)
      values ($1,'Lead Autonomy Test','lead-autonomy-test','local_service','home services','active') returning id
    `, [tenantId]);
    const brandId = brand.rows[0].id;
    await client.query(`
      insert into public.pipeline_stages (tenant_id,brand_id,stage_key,name,sort_order,default_probability,active)
      values ($1,$2,'new','New',1,20,true),($1,$2,'qualified','Qualified',2,60,true)
    `, [tenantId, brandId]);
    const firstLead = await client.query<{ id: string }>(`
      insert into public.leads (
        tenant_id,brand_id,source,source_detail,name,email,message,lead_type,status,
        qualification_status,priority,lead_score,consent_to_contact,created_at,updated_at
      ) values ($1,$2,'website','certification','Taylor Test',$3,'Need roof repair','quote','new',
        'qualified','high',92,true,now()-interval '2 days',now()-interval '2 days') returning id
    `, [tenantId, brandId, `lead-autonomy-${suffix}@example.invalid`]);
    await client.query(`
      insert into public.local_service_lead_details (tenant_id,brand_id,lead_id,service_interest,urgency)
      values ($1,$2,$3,'roof repair','urgent')
    `, [tenantId, brandId, firstLead.rows[0].id]);
    const duplicateLead = await client.query<{ id: string }>(`
      insert into public.leads (
        tenant_id,brand_id,source,source_detail,name,email,message,lead_type,status,
        qualification_status,priority,lead_score,consent_to_contact,created_at,updated_at
      ) values ($1,$2,'website','certification-duplicate','Taylor Test',$3,'Need roof repair','quote','new',
        'qualified','high',92,true,now()-interval '2 days' + interval '5 minutes',now()-interval '2 days' + interval '5 minutes') returning id
    `, [tenantId, brandId, `LEAD-AUTONOMY-${suffix}@EXAMPLE.INVALID`]);
    await client.query(`
      insert into public.leads (
        tenant_id,brand_id,source,source_detail,name,email,message,lead_type,status,
        qualification_status,priority,lead_score,consent_to_contact,created_at,updated_at
      ) values
        ($1,$2,'website','certification-returning','Taylor Test',$3,'Now I also need gutter repair','quote','new',
          'qualified','high',90,true,now(),now()),
        ($1,$2,'website','certification-incomplete','No Contact',null,'Please call me','general','new',
          'needs_review','normal',25,false,now(),now())
    `, [tenantId, brandId, `lead-autonomy-${suffix}@example.invalid`]);

    const query = async <T extends QueryResultRow>(text: string, values: unknown[] = []) => client.query<T>(text, values);
    const result = await advanceIncomingLeadsForTenant(tenantId, query);
    const counts = await client.query<{
      duplicate_leads: string; customers: string; opportunities: string; threads: string;
      initial_responses: string; owner_exceptions: string;
    }>(`
      select
        (select count(*) from public.leads where tenant_id=$1 and metadata_json ? 'duplicateOfLeadId')::text duplicate_leads,
        (select count(*) from public.customers where tenant_id=$1)::text customers,
        (select count(*) from public.opportunities where tenant_id=$1)::text opportunities,
        (select count(*) from public.communication_threads where tenant_id=$1)::text threads,
        (select count(*) from public.follow_up_workflows where tenant_id=$1 and workflow_type='new_lead_response')::text initial_responses,
        (select count(*) from public.owner_command_events where tenant_id=$1 and event_type='lead.incomplete_contact')::text owner_exceptions
    `, [tenantId]);
    const row = counts.rows[0];
    expectEqual("duplicate relationships", Number(row.duplicate_leads), 2);
    expectEqual("customers", Number(row.customers), 1);
    expectEqual("opportunities", Number(row.opportunities), 2);
    expectEqual("communication threads", Number(row.threads), 4);
    expectEqual("initial responses", Number(row.initial_responses), 2);
    expectEqual("owner exceptions", Number(row.owner_exceptions), 1);
    expectEqual("result initial responses", result.initialResponsesPrepared, 2);
    expectEqual("result incomplete escalations", result.incompleteLeadsEscalated, 1);

    await client.query(`
      insert into public.live_action_policies (
        tenant_id,action_key,provider_key,label,status,requires_consent,requires_human_approval,risk_level
      ) values ($1,'calendar_sync','calendar_provider','Certification scheduling policy','live',true,false,'medium')
    `, [tenantId]);
    const occupiedStart = new Date(Date.now() + 48 * 60 * 60_000);
    occupiedStart.setUTCMinutes(0, 0, 0);
    const occupiedEnd = new Date(occupiedStart.getTime() + 60 * 60_000);
    const freeStart = new Date(occupiedStart.getTime() + 24 * 60 * 60_000);
    const freeEnd = new Date(freeStart.getTime() + 60 * 60_000);
    await client.query(`
      insert into public.revenue_appointments (
        tenant_id,brand_id,lead_id,appointment_type,status,scheduled_start,scheduled_end,booking_source,metadata_json
      ) values
        ($1,$2,$3,'estimate','booked',$5,$6,'certification','{}'::jsonb),
        ($1,$2,$4,'estimate','requested',$5::timestamptz + interval '15 minutes',$6::timestamptz + interval '15 minutes','public_booking','{"requestedByCustomer":true}'::jsonb),
        ($1,$2,$3,'estimate','requested',$7,$8,'public_booking','{"requestedByCustomer":true}'::jsonb)
    `, [tenantId, brandId, firstLead.rows[0].id, duplicateLead.rows[0].id, occupiedStart.toISOString(), occupiedEnd.toISOString(), freeStart.toISOString(), freeEnd.toISOString()]);
    await client.query(`
      insert into public.owner_command_events (
        tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
        owner_attention,ai_handled,risk_type,confidence_score
      ) values
        ($1,'ferocity','Ferocity',$2,'appointment.requested','Appointment requested','Needs availability check','high','needs_owner',true,false,'customer',95),
        ($1,'ferocity','Ferocity',$3,'appointment.requested','Appointment requested','Needs availability check','high','needs_owner',true,false,'customer',95)
    `, [tenantId, `public-appointment:${firstLead.rows[0].id}`, `public-appointment:${duplicateLead.rows[0].id}`]);

    const appointmentResult = await advanceRequestedAppointmentsForTenant(tenantId, query);
    const appointmentCounts = await client.query<{ booked_by_ferocity: string; requested: string; conflict_events: string; owner_requests_resolved: string }>(`
      select
        (select count(*) from public.revenue_appointments where tenant_id=$1 and metadata_json->>'bookedBy'='incoming_lead_autonomy')::text booked_by_ferocity,
        (select count(*) from public.revenue_appointments where tenant_id=$1 and status='requested')::text requested,
        (select count(*) from public.owner_command_events where tenant_id=$1 and event_type='appointment.conflict')::text conflict_events,
        (select count(*) from public.owner_command_events where tenant_id=$1 and event_type='appointment.requested' and status='ai_handled')::text owner_requests_resolved
    `, [tenantId]);
    const appointmentRow = appointmentCounts.rows[0];
    expectEqual("autonomously booked requests", Number(appointmentRow.booked_by_ferocity), 1);
    expectEqual("conflicting requests left pending", Number(appointmentRow.requested), 1);
    expectEqual("conflicts escalated", Number(appointmentRow.conflict_events), 1);
    expectEqual("owner requests resolved", Number(appointmentRow.owner_requests_resolved), 1);
    expectEqual("appointment result booked", appointmentResult.booked, 1);
    expectEqual("appointment result conflicts", appointmentResult.conflictsEscalated, 1);
    console.log(JSON.stringify({ ok: true, rollback: true, leadResult: result, leadCounts: row, appointmentResult, appointmentCounts: appointmentRow }));
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Autonomous lead certification failed.");
  process.exitCode = 1;
});
