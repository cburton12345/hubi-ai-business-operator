import { queryPostgres } from "@/lib/db/postgres";

export type InvoiceReviewEvent = "invoice_sent" | "invoice_paid";

export function invoiceReviewSchedule(event: InvoiceReviewEvent, jobCompleted: boolean) {
  if (event === "invoice_paid") return { eligible: true, triggerEvent: "invoice_paid", delayHours: 2 } as const;
  if (jobCompleted) return { eligible: true, triggerEvent: "job_completed", delayHours: 24 } as const;
  return { eligible: false, triggerEvent: "customer_followup", delayHours: 0 } as const;
}

export async function ensureInvoiceReviewEnrollment(input: {
  tenantId: string;
  invoiceId: string;
  event: InvoiceReviewEvent;
}) {
  const invoiceResult = await queryPostgres<{
    tenant_id: string;
    brand_id: string | null;
    customer_id: string;
    job_id: string | null;
    lead_id: string | null;
    job_status: string | null;
  }>(
    `select i.tenant_id,i.brand_id,i.customer_id,i.job_id,j.source_lead_id as lead_id,j.status as job_status
     from public.service_invoices i
     left join public.service_jobs j on j.tenant_id=i.tenant_id and j.id=i.job_id
     where i.tenant_id=$1 and i.id=$2 and i.status <> 'void' limit 1`,
    [input.tenantId, input.invoiceId]
  );
  const invoice = invoiceResult?.rows[0];
  if (!invoice) return { created: false, reason: "invoice_not_found" } as const;
  const schedule = invoiceReviewSchedule(input.event, invoice.job_status === "completed");
  if (!schedule.eligible) return { created: false, reason: "work_not_complete" } as const;

  const result = await queryPostgres<{ id: string }>(
    `insert into public.review_request_workflows (
       tenant_id,brand_id,customer_id,lead_id,job_id,trigger_event,channel,status,scheduled_for,
       negative_interception_status,ai_response_draft,metadata_json
     )
     select $1,$3,$4,$5,$6,$7,'sms','scheduled',now()+make_interval(hours => $8::integer),
       'not_applicable',
       'Thanks again for choosing us. We would appreciate your honest feedback about your experience.',
       jsonb_build_object('source','invoice_lifecycle','invoiceId',$2::text,'invoiceEvent',$9::text,'liveCustomerSend',false)
     where not exists (
       select 1 from public.review_request_workflows r
       where r.tenant_id=$1
         and r.status not in ('suppressed','canceled')
         and ((r.job_id is not null and r.job_id=$6) or r.metadata_json->>'invoiceId'=$2::text)
     )
     returning id`,
    [input.tenantId, input.invoiceId, invoice.brand_id, invoice.customer_id, invoice.lead_id, invoice.job_id,
      schedule.triggerEvent, schedule.delayHours, input.event]
  );
  return result?.rows[0]
    ? { created: true, reason: "scheduled", workflowId: result.rows[0].id } as const
    : { created: false, reason: "already_enrolled" } as const;
}
