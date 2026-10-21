import "server-only";

import { createHash } from "node:crypto";
import type pg from "pg";
import { withPostgresTransactionResult } from "@/lib/db/postgres";

export type ChangeOrderDecision = "approved" | "rejected";

export type ChangeOrderTransitionResult = {
  status: "sent" | "approved" | "rejected" | "already_decided" | "not_found" | "not_ready";
  changeOrderId: string | null;
  estimateId: string | null;
  jobId: string | null;
  invoiceId: string | null;
};

type LockedChangeOrder = {
  id: string;
  tenant_id: string;
  estimate_id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  estimated_cost_cents: number;
  schedule_impact_minutes: number;
  status: string;
  applied_at: Date | null;
};

async function lockChangeOrder(
  client: pg.PoolClient,
  tenantId: string,
  changeOrderId: string
) {
  const result = await client.query<LockedChangeOrder>(
    `select id, tenant_id, estimate_id, title, description, amount_cents,
            estimated_cost_cents, schedule_impact_minutes, status, applied_at
       from public.estimate_change_orders
      where tenant_id=$1 and id=$2
      limit 1
      for update`,
    [tenantId, changeOrderId]
  );
  return result.rows[0] ?? null;
}

export async function sendChangeOrderForCustomer(input: {
  tenantId: string;
  changeOrderId: string;
}): Promise<ChangeOrderTransitionResult> {
  const transaction = await withPostgresTransactionResult<ChangeOrderTransitionResult>(async (client) => {
    const change = await lockChangeOrder(client, input.tenantId, input.changeOrderId);
    if (!change) return { status: "not_found", changeOrderId: null, estimateId: null, jobId: null, invoiceId: null };
    if (change.status === "approved" || change.status === "rejected" || change.status === "cancelled") {
      return { status: "not_ready", changeOrderId: change.id, estimateId: change.estimate_id, jobId: null, invoiceId: null };
    }

    const share = await client.query<{ id: string }>(
      `select id
         from public.estimate_share_links
        where tenant_id=$1 and estimate_id=$2
          and status='accepted'
          and (expires_at is null or expires_at > now())
        order by created_at desc
        limit 1`,
      [input.tenantId, change.estimate_id]
    );
    if (!share.rows[0]) {
      return { status: "not_ready", changeOrderId: change.id, estimateId: change.estimate_id, jobId: null, invoiceId: null };
    }

    await client.query(
      `update public.estimate_change_orders
          set status='sent_manually', sent_at=coalesce(sent_at, now()), updated_at=now()
        where tenant_id=$1 and id=$2`,
      [input.tenantId, change.id]
    );
    return { status: "sent", changeOrderId: change.id, estimateId: change.estimate_id, jobId: null, invoiceId: null };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not make the change order available safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export async function decideChangeOrder(input: {
  publicToken: string;
  changeOrderId: string;
  decision: ChangeOrderDecision;
  decidedByName: string;
  decidedByEmail: string | null;
  decisionNote: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<ChangeOrderTransitionResult> {
  const transaction = await withPostgresTransactionResult<ChangeOrderTransitionResult>(async (client) => {
    const shareResult = await client.query<{ tenant_id: string; estimate_id: string; customer_id: string; brand_id: string | null }>(
      `select s.tenant_id, s.estimate_id, s.customer_id, e.brand_id
         from public.estimate_share_links s
         join public.service_estimates e on e.tenant_id=s.tenant_id and e.id=s.estimate_id
        where s.public_token=$1
          and s.status in ('ready','sent','viewed','accepted')
          and (s.expires_at is null or s.expires_at > now())
        limit 1
        for update of s`,
      [input.publicToken]
    );
    const share = shareResult.rows[0];
    if (!share) return { status: "not_found", changeOrderId: null, estimateId: null, jobId: null, invoiceId: null };

    const change = await lockChangeOrder(client, share.tenant_id, input.changeOrderId);
    if (!change || change.estimate_id !== share.estimate_id) {
      return { status: "not_found", changeOrderId: null, estimateId: share.estimate_id, jobId: null, invoiceId: null };
    }
    if (change.status === "approved" || change.status === "rejected") {
      return {
        status: "already_decided",
        changeOrderId: change.id,
        estimateId: change.estimate_id,
        jobId: null,
        invoiceId: null
      };
    }
    if (change.status !== "sent_manually") {
      return { status: "not_ready", changeOrderId: change.id, estimateId: change.estimate_id, jobId: null, invoiceId: null };
    }

    const decidedAt = new Date().toISOString();
    const decisionDocument = {
      changeOrderId: change.id,
      estimateId: change.estimate_id,
      title: change.title,
      description: change.description,
      amountCents: change.amount_cents,
      estimatedCostCents: change.estimated_cost_cents,
      scheduleImpactMinutes: change.schedule_impact_minutes,
      decision: input.decision,
      decidedByName: input.decidedByName,
      decidedByEmail: input.decidedByEmail,
      decisionNote: input.decisionNote,
      decidedAt
    };
    const documentSha256 = createHash("sha256").update(JSON.stringify(decisionDocument)).digest("hex");

    let jobId: string | null = null;
    let invoiceId: string | null = null;
    let invoiceLineItemId: string | null = null;

    if (input.decision === "approved") {
      const jobResult = await client.query<{ id: string }>(
        `select id from public.service_jobs
          where tenant_id=$1 and estimate_id=$2 and status not in ('canceled','lost')
          order by created_at desc limit 1 for update`,
        [share.tenant_id, share.estimate_id]
      );
      jobId = jobResult.rows[0]?.id ?? null;

      if (jobId && change.schedule_impact_minutes > 0) {
        await client.query(
          `update public.service_jobs
              set scheduled_end=case when scheduled_end is null then null else scheduled_end + ($3::int * interval '1 minute') end,
                  dispatcher_notes=concat_ws(E'\n', nullif(dispatcher_notes,''), $4),
                  updated_at=now()
            where tenant_id=$1 and id=$2`,
          [share.tenant_id, jobId, change.schedule_impact_minutes, `Approved change order: ${change.title} (+${change.schedule_impact_minutes} minutes).`]
        );
        await client.query(
          `update public.service_work_orders
              set requested_end=case when requested_end is null then null else requested_end + ($3::int * interval '1 minute') end,
                  promised_by=case when promised_by is null then null else promised_by + ($3::int * interval '1 minute') end,
                  metadata_json=metadata_json || jsonb_build_object('lastApprovedChangeOrderId',$4::text),
                  updated_at=now()
            where tenant_id=$1 and service_job_id=$2 and status not in ('completed','canceled','lost')`,
          [share.tenant_id, jobId, change.schedule_impact_minutes, change.id]
        );
        await client.query(
          `with target as (
             select id from public.service_visits
              where tenant_id=$1 and service_job_id=$2
                and status not in ('completed','canceled','no_show')
              order by coalesce(scheduled_start, arrival_window_start, created_at) desc
              limit 1
           )
           update public.service_visits v
              set scheduled_end=case when v.scheduled_end is null then null else v.scheduled_end + ($3::int * interval '1 minute') end,
                  arrival_window_end=case when v.arrival_window_end is null then null else v.arrival_window_end + ($3::int * interval '1 minute') end,
                  updated_at=now()
             from target where v.id=target.id`,
          [share.tenant_id, jobId, change.schedule_impact_minutes]
        );
      }

      const invoiceResult = await client.query<{ id: string }>(
        `select id from public.service_invoices
          where tenant_id=$1
            and (job_id=$2 or ($2::uuid is null and estimate_id=$3))
            and status='draft'
          order by created_at desc limit 1 for update`,
        [share.tenant_id, jobId, share.estimate_id]
      );
      invoiceId = invoiceResult.rows[0]?.id ?? null;
      if (invoiceId && change.amount_cents > 0) {
        const lineResult = await client.query<{ id: string }>(
          `insert into public.invoice_line_items (
             tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents, position
           )
           select $1,$2,$3,$4,1,$5,$5,coalesce(max(position),-1)+1
             from public.invoice_line_items where tenant_id=$1 and invoice_id=$2
           returning id`,
          [share.tenant_id, invoiceId, `Change order: ${change.title}`, change.description, change.amount_cents]
        );
        invoiceLineItemId = lineResult.rows[0]?.id ?? null;
        if (!invoiceLineItemId) throw new Error("The approved change could not be added to the draft invoice.");
        await client.query(
          `update public.service_invoices i
              set subtotal_cents=t.subtotal,
                  total_cents=greatest(0,t.subtotal-i.discount_cents+i.tax_cents),
                  updated_at=now()
             from (
               select coalesce(sum(total_cents),0)::int subtotal
                 from public.invoice_line_items where tenant_id=$1 and invoice_id=$2
             ) t
            where i.tenant_id=$1 and i.id=$2`,
          [share.tenant_id, invoiceId]
        );
      }
    }

    await client.query(
      `update public.estimate_change_orders
          set status=$3, decided_at=$4, decided_by_name=$5, decided_by_email=$6,
              decision_note=$7, decision_ip=$8, decision_user_agent=$9,
              decision_document_sha256=$10,
              applied_at=case when $3='approved' then $4 else applied_at end,
              invoice_line_item_id=$11,
              metadata_json=metadata_json || $12::jsonb,
              updated_at=now()
        where tenant_id=$1 and id=$2`,
      [
        share.tenant_id,
        change.id,
        input.decision,
        decidedAt,
        input.decidedByName,
        input.decidedByEmail,
        input.decisionNote,
        input.ipAddress,
        input.userAgent,
        documentSha256,
        invoiceLineItemId,
        JSON.stringify({
          decisionSource: "public_estimate_page",
          signatureMethod: "typed_name",
          electronicSignatureConsent: true,
          decisionDocument,
          jobId,
          invoiceId,
          forecastCostOnly: change.estimated_cost_cents > 0
        })
      ]
    );

    const workOrder = jobId
      ? await client.query<{ id: string }>(
          `select id from public.service_work_orders where tenant_id=$1 and service_job_id=$2 order by created_at desc limit 1`,
          [share.tenant_id, jobId]
        )
      : null;
    await client.query(
      `insert into public.service_operating_events (
         tenant_id, brand_id, customer_id, work_order_id, event_type, source_type, source_id,
         title, detail, next_state_json, metadata_json
       ) values ($1,$2,$3,$4,'change_order_decision','customer',$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        share.tenant_id,
        share.brand_id,
        share.customer_id,
        workOrder?.rows[0]?.id ?? null,
        change.id,
        `Change order ${input.decision}`,
        `${change.title} was ${input.decision} by ${input.decidedByName}.`,
        JSON.stringify({ status: input.decision, amountCents: change.amount_cents, scheduleImpactMinutes: change.schedule_impact_minutes }),
        JSON.stringify({ changeOrderId: change.id, estimateId: change.estimate_id, jobId, invoiceId, documentSha256 })
      ]
    );

    if (input.decision === "approved" && change.amount_cents > 0 && !invoiceId) {
      await client.query(
        `insert into public.owner_reminders (
           tenant_id, title, body, reminder_type, priority, status, remind_at, next_due_at, action_url, metadata_json
         ) values ($1,$2,$3,'follow_up','high','active',now(),now(),$4,$5::jsonb)`,
        [
          share.tenant_id,
          `Invoice approved change: ${change.title}`,
          "The customer approved this change, but no editable draft invoice exists. Create a separate invoice or review the billing path; issued invoices were not changed.",
          jobId ? `/app/service/jobs/${jobId}` : `/app/service/estimates/${change.estimate_id}`,
          JSON.stringify({ changeOrderId: change.id, estimateId: change.estimate_id, jobId, amountCents: change.amount_cents })
        ]
      );
    }

    return {
      status: input.decision,
      changeOrderId: change.id,
      estimateId: change.estimate_id,
      jobId,
      invoiceId
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not record the change-order decision safely.", { cause: transaction.error });
  }
  return transaction.value;
}
