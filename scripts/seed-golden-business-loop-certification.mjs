import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

const tenantSlug = process.env.TENANT_SLUG ?? "ferocity-qa-demo";
if (process.env.CONFIRM_GOLDEN_LOOP_CERTIFICATION !== "YES") {
  throw new Error("Set CONFIRM_GOLDEN_LOOP_CERTIFICATION=YES to create only labeled QA certification evidence.");
}
if (tenantSlug !== "ferocity-qa-demo") {
  throw new Error("Golden-loop fixture creation is restricted to the isolated Ferocity QA Demo workspace.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});
const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];

await client.connect();
try {
  await client.query("begin");
  const workspace = await one(
    `select t.id as tenant_id, b.id as brand_id
       from public.tenants t
       join public.brands b on b.tenant_id=t.id and b.status='active'
      where t.slug=$1 limit 1`,
    [tenantSlug]
  );
  if (!workspace) throw new Error("Ferocity QA Demo workspace or active brand was not found.");

  let lead = await one(
    `select id from public.leads
      where tenant_id=$1 and metadata_json->>'certificationKey'='golden-business-loop-v1'
      order by created_at desc limit 1`,
    [workspace.tenant_id]
  );
  if (!lead) {
    lead = await one(
      `insert into public.leads (
         tenant_id, brand_id, source, source_detail, name, email, phone, message, lead_type,
         status, qualification_status, priority, lead_score, consent_to_contact, metadata_json
       ) values (
         $1,$2,'website_form','qa_golden_loop','Golden Loop QA Customer','golden-loop@example.com',
         '555-0199','QA-only roof repair request used to certify internal handoffs.','quote',
         'qualified','qualified','high',92,false,
         '{"certificationKey":"golden-business-loop-v1","qaOnly":true,"noLiveContact":true}'::jsonb
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id]
    );
  }

  let customer = await one(
    `select id from public.customers where tenant_id=$1 and source_lead_id=$2 limit 1`,
    [workspace.tenant_id, lead.id]
  );
  if (!customer) {
    customer = await one(
      `insert into public.customers (
         tenant_id,brand_id,source_lead_id,name,email,phone,city,state,notes,ai_summary
       ) values (
         $1,$2,$3,'Golden Loop QA Customer','golden-loop@example.com','555-0199','Demo City','WI',
         'QA-only certification record. Never contact.','Synthetic customer used only to certify Ferocity internal handoffs.'
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id, lead.id]
    );
  }

  let estimate = await one(
    `select id from public.service_estimates where tenant_id=$1 and source_lead_id=$2 limit 1`,
    [workspace.tenant_id, lead.id]
  );
  if (!estimate) {
    estimate = await one(
      `insert into public.service_estimates (
         tenant_id,brand_id,customer_id,source_lead_id,title,status,subtotal_cents,total_cents,
         customer_summary,internal_notes
       ) values (
         $1,$2,$3,$4,'Golden Loop QA Roof Repair','approved',250000,250000,
         'QA-only approved estimate.','Certification fixture; no real offer or customer.'
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id, customer.id, lead.id]
    );
  } else {
    await client.query("update public.service_estimates set status='approved', updated_at=now() where id=$1", [estimate.id]);
  }

  let job = await one(
    `select id from public.service_jobs where tenant_id=$1 and source_lead_id=$2 limit 1`,
    [workspace.tenant_id, lead.id]
  );
  if (!job) {
    job = await one(
      `insert into public.service_jobs (
         tenant_id,brand_id,customer_id,source_lead_id,estimate_id,title,status,scheduled_start,scheduled_end,
         service_area,dispatcher_notes,completion_notes
       ) values (
         $1,$2,$3,$4,$5,'Golden Loop QA Completed Roof Repair','completed',now()-interval '2 days',
         now()-interval '1 day','Demo City','QA schedule proof; no dispatch occurred.',
         'QA completion proof; no real work occurred.'
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id, customer.id, lead.id, estimate.id]
    );
  } else {
    await client.query(
      "update public.service_jobs set estimate_id=$2,status='completed',scheduled_start=coalesce(scheduled_start,now()-interval '2 days'),updated_at=now() where id=$1",
      [job.id, estimate.id]
    );
  }

  let invoice = await one(
    `select id from public.service_invoices where tenant_id=$1 and job_id=$2 limit 1`,
    [workspace.tenant_id, job.id]
  );
  if (!invoice) {
    invoice = await one(
      `insert into public.service_invoices (
         tenant_id,brand_id,customer_id,job_id,estimate_id,title,status,subtotal_cents,total_cents,
         amount_paid_cents,internal_notes
       ) values (
         $1,$2,$3,$4,$5,'Golden Loop QA Invoice','paid',250000,250000,250000,
         'QA-only paid invoice; no real charge.'
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id, customer.id, job.id, estimate.id]
    );
  } else {
    await client.query("update public.service_invoices set status='paid',amount_paid_cents=total_cents,updated_at=now() where id=$1", [invoice.id]);
  }

  let payment = await one(
    `select id from public.service_invoice_payments
      where tenant_id=$1 and invoice_id=$2 and metadata_json->>'certificationKey'='golden-business-loop-v1'
      limit 1`,
    [workspace.tenant_id, invoice.id]
  );
  if (!payment) {
    payment = await one(
      `insert into public.service_invoice_payments (
         tenant_id,brand_id,customer_id,invoice_id,provider,status,amount_cents,net_cents,currency,paid_at,metadata_json
       ) values (
         $1,$2,$3,$4,'manual','manual',250000,250000,'usd',now(),
         '{"certificationKey":"golden-business-loop-v1","qaOnly":true,"noRealCharge":true}'::jsonb
       ) returning id`,
      [workspace.tenant_id, workspace.brand_id, customer.id, invoice.id]
    );
  }

  if (!(await one(`select id from public.review_request_workflows where tenant_id=$1 and job_id=$2 limit 1`, [workspace.tenant_id, job.id]))) {
    await client.query(
      `insert into public.review_request_workflows (
         tenant_id,brand_id,customer_id,lead_id,job_id,trigger_event,channel,status,ai_response_draft,metadata_json
       ) values ($1,$2,$3,$4,$5,'invoice_paid','manual','draft',
         'QA-only review request draft. Nothing was sent.',
         '{"certificationKey":"golden-business-loop-v1","qaOnly":true,"liveSend":false}'::jsonb)`,
      [workspace.tenant_id, workspace.brand_id, customer.id, lead.id, job.id]
    );
  }

  if (!(await one(`select id from public.ugc_submissions where tenant_id=$1 and job_id=$2 and metadata_json->>'certificationKey'='golden-business-loop-v1' limit 1`, [workspace.tenant_id, job.id]))) {
    await client.query(
      `insert into public.ugc_submissions (
         tenant_id,brand_id,customer_id,job_id,source,status,title,customer_name,service_type,city,state,
         rating,story_text,result_summary,permission_marketing,permission_use_name,permission_use_location,
         permission_contact_followup,reviewed_at,metadata_json
       ) values (
         $1,$2,$3,$4,'manual','approved','Golden Loop QA proof','Golden Loop QA Customer','Roof repair',
         'Demo City','WI',5,'Synthetic QA proof used to test approved-content preparation.',
         'Internal handoffs completed without publishing.',true,false,false,false,now(),
         '{"certificationKey":"golden-business-loop-v1","qaOnly":true,"syntheticProof":true}'::jsonb
       )`,
      [workspace.tenant_id, workspace.brand_id, customer.id, job.id]
    );
  }

  const run = await one(
    `insert into public.business_loop_runs (
       tenant_id,brand_id,lead_id,customer_id,estimate_id,job_id,invoice_id,mode,status,idempotency_key,metadata_json
     ) values (
       $1,$2,$3,$4,$5,$6,$7,'certification','active','certification:v1:lead:'||($3::uuid)::text,
       '{"createdBy":"qa_golden_loop_certification","liveProviderActionsTriggered":false}'::jsonb
     ) on conflict (tenant_id,idempotency_key) do update set
       brand_id=excluded.brand_id,customer_id=excluded.customer_id,estimate_id=excluded.estimate_id,
       job_id=excluded.job_id,invoice_id=excluded.invoice_id,status='active',updated_at=now()
     returning id`,
    [workspace.tenant_id, workspace.brand_id, lead.id, customer.id, estimate.id, job.id, invoice.id]
  );

  await client.query("commit");
  console.log(JSON.stringify({ tenantId: workspace.tenant_id, runId: run.id, leadId: lead.id, liveProviderActionsTriggered: false }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
