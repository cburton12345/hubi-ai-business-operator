"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { EARN_AGREEMENT_VERSION, rateForClassification, type EarnClassification } from "@/lib/billing/earn";
import { env } from "@/lib/env";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const enrollmentSchema = z.object({ accepted: z.literal("yes") });
const attributionSchema = z.object({
  opportunityId: z.string().uuid(),
  classification: z.enum(["CUSTOMER_ORIGINATED_FEROCITY_MANAGED", "FEROCITY_ORIGINATED", "NON_EARN", "NEEDS_REVIEW"]),
  reason: z.string().trim().min(20).max(1200),
  sourceChannel: z.string().trim().min(2).max(100),
  evidence: z.string().trim().max(3000)
});
const disputeSchema = z.object({
  attributionId: z.string().uuid().optional(),
  ledgerEntryId: z.string().uuid().optional(),
  disputeType: z.enum(["attribution", "eligible_amount", "payment_classification", "earn_calculation", "exclusion_adjustment"]),
  reason: z.string().trim().min(5).max(200),
  explanation: z.string().trim().min(20).max(3000),
  amountCents: z.coerce.number().int().nonnegative().max(2_000_000_000)
}).refine((value) => Boolean(value.attributionId || value.ledgerEntryId));
const correctionSchema = attributionSchema.extend({ attributionId: z.string().uuid() });
const refundSchema = z.object({
  paymentId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  amountCents: z.number().int().positive().max(2_000_000_000),
  reason: z.string().trim().min(5).max(1000)
});
const resolveDisputeSchema = z.object({
  disputeId: z.string().uuid(),
  status: z.enum(["APPROVED", "PARTIALLY_APPROVED", "DENIED", "RESOLVED"]),
  resolution: z.string().trim().min(20).max(3000),
  creditCents: z.number().int().nonnegative().max(2_000_000_000)
});

function actorId(value: string) {
  return value === "admin-token" ? null : value;
}

function refresh() {
  revalidatePath("/app/billing");
  revalidatePath("/app/billing/earn");
}

export async function enrollInEarnAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const parsed = enrollmentSchema.safeParse({ accepted: formData.get("accepted") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const currentResult = await queryPostgres<{
    external_subscription_ref: string | null;
    status: string;
    current_period_end: Date | null;
  }>(`select external_subscription_ref,status,current_period_end from public.billing_subscriptions where tenant_id=$1`, [tenantId]);
  const current = currentResult?.rows[0];
  const hasLiveFixedSubscription = Boolean(current?.external_subscription_ref && ["active", "trialing", "past_due"].includes(current.status));
  if (hasLiveFixedSubscription) {
    if (!env.STRIPE_SECRET_KEY) return;
    const body = new URLSearchParams({ cancel_at_period_end: "true" });
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(current!.external_subscription_ref!)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store"
    });
    if (!response.ok) return;
  }
  await queryPostgres(
    `with prior as (
       select plan_key,status,external_customer_ref,external_subscription_ref from public.billing_subscriptions where tenant_id=$1
     ), enrolled as (
       insert into public.earn_enrollments (tenant_id,status,agreement_version,effective_at,accepted_by_user_id,accepted_at,metadata_json)
       values ($1,$4,$2,$5::timestamptz,$3,now(),jsonb_build_object('explicitAcceptance',true,'priorPlan',(select plan_key from prior)))
       on conflict (tenant_id) do update set
         status=excluded.status,agreement_version=excluded.agreement_version,effective_at=excluded.effective_at,terminated_at=null,
         accepted_by_user_id=excluded.accepted_by_user_id,accepted_at=now(),updated_at=now(),
         metadata_json=public.earn_enrollments.metadata_json || excluded.metadata_json
       where public.earn_enrollments.status<>'active'
       returning tenant_id
     )
     insert into public.billing_subscriptions (tenant_id,plan_key,status,seats,metadata_json,updated_at)
     select tenant_id,'earn','manual',1,jsonb_build_object('earnAgreementVersion',$2,'earnEffectiveAt',$5::timestamptz),now() from enrolled
     where $4='active'
     on conflict (tenant_id) do update set plan_key='earn',status='manual',
       metadata_json=public.billing_subscriptions.metadata_json || excluded.metadata_json,updated_at=now()`,
    [tenantId, EARN_AGREEMENT_VERSION, actorId(actor.userId), hasLiveFixedSubscription ? "pending" : "active",
      (hasLiveFixedSubscription ? current?.current_period_end : new Date())?.toISOString() ?? new Date().toISOString()]
  );
  await queryPostgres(
    `insert into public.activity_logs (tenant_id,actor_type,user_id,action,target_type,metadata_json)
     values ($1,'user',$2,'ferocity_earn_enrolled','earn_enrollment',jsonb_build_object('agreementVersion',$3))`,
    [tenantId, actorId(actor.userId), EARN_AGREEMENT_VERSION]
  );
  refresh();
}

export async function establishEarnAttributionAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const parsed = attributionSchema.safeParse({
    opportunityId: formData.get("opportunityId"), classification: formData.get("classification"),
    reason: formData.get("reason"), sourceChannel: formData.get("sourceChannel"), evidence: formData.get("evidence")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const classification = parsed.data.classification as EarnClassification;
  const rateBps = rateForClassification(classification);
  await queryPostgres(
    `with enrollment as (
       select agreement_version from public.earn_enrollments where tenant_id=$1 and status='active' and effective_at is not null
     ), inserted as (
       insert into public.earn_attributions (
         tenant_id,customer_id,opportunity_id,job_id,classification,locked_rate_bps,attribution_reason,source_channel,
         established_by_type,established_by_user_id,evidence_json,agreement_version
       )
       select o.tenant_id,o.customer_id,o.id,j.id,$3,$4,$5,$6,'user',$7,
         jsonb_build_object('ownerEvidence',$8::text,'opportunitySource',o.source,'opportunityCreatedAt',o.created_at),e.agreement_version
       from public.opportunities o cross join enrollment e
       left join public.service_jobs j on j.tenant_id=o.tenant_id and (j.opportunity_id=o.id or (o.estimate_id is not null and j.estimate_id=o.estimate_id))
       where o.tenant_id=$1 and o.id=$2
       on conflict (tenant_id,opportunity_id) do nothing
       returning *
     )
     insert into public.earn_attribution_history (
       tenant_id,attribution_id,event_type,new_classification,new_rate_bps,reason,evidence_json,actor_type,actor_user_id
     ) select tenant_id,id,'established',classification,locked_rate_bps,attribution_reason,evidence_json,'user',$7 from inserted`,
    [tenantId, parsed.data.opportunityId, classification, rateBps, parsed.data.reason, parsed.data.sourceChannel, actorId(actor.userId), parsed.data.evidence]
  );
  // A newly resolved attribution may make a post-enrollment payment assessable. The database function is idempotent.
  await queryPostgres(
    `select public.accrue_earn_for_payment(p.id) from public.service_invoice_payments p
     join public.service_invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id
     left join public.service_jobs j on j.id=i.job_id
     where p.tenant_id=$1 and p.status in ('succeeded','manual')
       and coalesce(p.opportunity_id,i.opportunity_id,j.opportunity_id,public.resolve_earn_payment_opportunity(p.id))=$2`,
    [tenantId, parsed.data.opportunityId]
  );
  refresh();
}

export async function disputeEarnAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const parsed = disputeSchema.safeParse({
    attributionId: String(formData.get("attributionId") ?? "") || undefined,
    ledgerEntryId: String(formData.get("ledgerEntryId") ?? "") || undefined,
    disputeType: formData.get("disputeType"), reason: formData.get("reason"), explanation: formData.get("explanation"),
    amountCents: formData.get("amountCents") ?? 0
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `with inserted as (
       insert into public.earn_disputes (
         tenant_id,attribution_id,ledger_entry_id,dispute_type,reason,explanation,amount_cents,evidence_json,requested_by_user_id
       ) select $1,nullif($2,'')::uuid,nullif($3,'')::uuid,$4,$5,$6,$7,
         jsonb_build_object('submittedFrom','earn_dashboard'),$8
       where (nullif($2,'')::uuid is null or exists(select 1 from public.earn_attributions where tenant_id=$1 and id=nullif($2,'')::uuid))
         and (nullif($3,'')::uuid is null or exists(select 1 from public.earn_ledger_entries where tenant_id=$1 and id=nullif($3,'')::uuid))
       returning id,attribution_id,ledger_entry_id
     ), marked_attr as (
       update public.earn_attributions a set dispute_status='open'
       from inserted d where a.tenant_id=$1 and a.id=d.attribution_id returning a.id
     )
     update public.earn_ledger_entries l set settlement_status='disputed',dispute_id=d.id
     from inserted d where l.tenant_id=$1 and (l.id=d.ledger_entry_id or (d.attribution_id is not null and l.attribution_id=d.attribution_id and l.settlement_status='unsettled'))`,
    [tenantId, parsed.data.attributionId ?? "", parsed.data.ledgerEntryId ?? "", parsed.data.disputeType,
      parsed.data.reason, parsed.data.explanation, parsed.data.amountCents, actorId(actor.userId)]
  );
  refresh();
}

export async function correctEarnAttributionAction(formData: FormData) {
  const actor = await requirePermission("platform:manage");
  const parsed = correctionSchema.safeParse({
    attributionId: formData.get("attributionId"), opportunityId: formData.get("opportunityId"),
    classification: formData.get("classification"), reason: formData.get("reason"),
    sourceChannel: formData.get("sourceChannel"), evidence: formData.get("evidence")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const classification = parsed.data.classification as EarnClassification;
  const rateBps = rateForClassification(classification);
  await queryPostgres(
    `with prior as (
       select * from public.earn_attributions where tenant_id=$1 and id=$2 and opportunity_id=$3
     ), history as (
       insert into public.earn_attribution_history (
         tenant_id,attribution_id,event_type,prior_classification,prior_rate_bps,new_classification,new_rate_bps,reason,evidence_json,actor_type,actor_user_id
       ) select tenant_id,id,'corrected',classification,locked_rate_bps,$4,$5,$6,
         jsonb_build_object('correctionEvidence',$7::text),'user',$8 from prior returning id
     ), updated as (
       update public.earn_attributions a set classification=$4,locked_rate_bps=$5,attribution_reason=$6,
         source_channel=$9,evidence_json=a.evidence_json || jsonb_build_object('latestCorrection',$7::text),corrected_at=now()
       from prior where a.id=prior.id returning a.*
     ), totals as (
       select coalesce(sum(eligible_amount_cents),0)::bigint eligible from public.earn_ledger_entries
       where tenant_id=$1 and attribution_id=$2 and event_type='eligible_payment'
     ), old_earn as (
       select coalesce(sum(earn_amount_cents),0)::bigint amount from public.earn_ledger_entries
       where tenant_id=$1 and attribution_id=$2 and event_type in ('earn_accrual','earn_credit','correction','manual_adjustment','reversal')
     )
     insert into public.earn_ledger_entries (
       tenant_id,attribution_id,opportunity_id,customer_id,classification,locked_rate_bps,eligible_amount_cents,earn_amount_cents,
       event_type,reason,source_event_key,billing_period_start,actor_type,actor_user_id,metadata_json
     ) select $1,$2,$3,u.customer_id,$4,$5,0,
       floor((t.eligible::numeric*$5+5000)/10000)::bigint-o.amount,
       'correction',$6,'attribution-correction:'||h.id::text,date_trunc('month',current_date)::date,'user',$8,
       jsonb_build_object('priorEarnCents',o.amount,'eligibleRevenueCents',t.eligible,'historyId',h.id)
     from updated u cross join totals t cross join old_earn o cross join history h
     where floor((t.eligible::numeric*$5+5000)/10000)::bigint<>o.amount`,
    [tenantId, parsed.data.attributionId, parsed.data.opportunityId, classification, rateBps, parsed.data.reason,
      parsed.data.evidence, actorId(actor.userId), parsed.data.sourceChannel]
  );
  refresh();
}

export async function prepareEarnSettlementAction() {
  const actor = await requirePermission("billing:manage");
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `with enrollment as (
       select settlement_day from public.earn_enrollments where tenant_id=$1 and status in ('active','terminated')
     ), period as (
       select date_trunc('month',current_date)::date period_start,
         (date_trunc('month',current_date)+interval '1 month'-interval '1 day')::date period_end,
         case when extract(day from current_date)<settlement_day
           then make_date(extract(year from current_date)::int,extract(month from current_date)::int,settlement_day)
           else (date_trunc('month',current_date)+interval '1 month')::date+(settlement_day-1) end scheduled_for
       from enrollment
     ), ledger as (
       select
         coalesce(sum(eligible_amount_cents) filter(where classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED'),0)::bigint managed_revenue,
         coalesce(sum(earn_amount_cents) filter(where classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED'),0)::bigint managed_earn,
         coalesce(sum(eligible_amount_cents) filter(where classification='FEROCITY_ORIGINATED'),0)::bigint originated_revenue,
         coalesce(sum(earn_amount_cents) filter(where classification='FEROCITY_ORIGINATED'),0)::bigint originated_earn,
         coalesce(sum(earn_amount_cents) filter(where event_type in ('earn_credit','correction','manual_adjustment','reversal')),0)::bigint adjustments
       from public.earn_ledger_entries l cross join period p
       where l.tenant_id=$1 and l.billing_period_start=p.period_start and l.settlement_status='unsettled'
     ), usage as (
       select coalesce(sum(amount_cents),0)::bigint provider_usage from public.billing_usage_charges u cross join period p
       where u.tenant_id=$1 and u.created_at>=p.period_start and u.created_at<p.period_end+1 and u.status not in ('void','failed')
     ), inserted as (
       insert into public.earn_settlements (
         tenant_id,period_start,period_end,eligible_managed_cents,managed_earn_cents,eligible_originated_cents,
         originated_earn_cents,adjustment_cents,provider_usage_cents,total_due_cents,status,idempotency_key,scheduled_for,metadata_json
       ) select $1,p.period_start,p.period_end,l.managed_revenue,l.managed_earn,l.originated_revenue,l.originated_earn,
         l.adjustments,u.provider_usage,l.managed_earn+l.originated_earn,'scheduled',
         'earn-settlement:'||$1::text||':'||p.period_start::text,p.scheduled_for,
         jsonb_build_object('preparedBy',$2::text,'providerUsageShownSeparately',true)
       from period p cross join ledger l cross join usage u
       where l.managed_earn+l.originated_earn<>0
       on conflict (tenant_id,period_start,period_end) do nothing returning id,period_start
     )
     update public.earn_ledger_entries l set settlement_status='scheduled',
       metadata_json=l.metadata_json || jsonb_build_object('settlementId',i.id)
     from inserted i where l.tenant_id=$1 and l.billing_period_start=i.period_start and l.settlement_status='unsettled'`,
    [tenantId, actorId(actor.userId)]
  );
  refresh();
}

export async function recordOfflineRefundAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const rawAmount = Number(String(formData.get("amount") ?? "").replace(/[$,]/g, ""));
  const parsed = refundSchema.safeParse({
    paymentId: formData.get("paymentId"), idempotencyKey: formData.get("idempotencyKey"),
    amountCents: Math.round(rawAmount * 100), reason: formData.get("reason")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ id: string; refund_delta_cents: number }>(
    `with prior as materialized (
       select p.*,i.amount_paid_cents from public.service_invoice_payments p
       join public.service_invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id
       where p.tenant_id=$1 and p.id=$2 and p.status in ('succeeded','manual','partially_refunded','refunded') for update of p
     ), marker as (
       insert into public.service_ledger_entries (
         tenant_id,customer_id,invoice_id,payment_id,entry_type,direction,amount_cents,currency,description,provider,provider_event_id,metadata_json
       ) select tenant_id,customer_id,invoice_id,id,'refund','debit',least($3::integer,greatest(amount_cents-refunded_amount_cents,0)),currency,$5,provider,$4,
         jsonb_build_object('source','manual_refund_record','recordedBy',$6::text)
       from prior where $3>0
       on conflict (tenant_id,provider_event_id,entry_type) where provider_event_id is not null do nothing
       returning payment_id,amount_cents
     ), updated as (
       update public.service_invoice_payments p set refunded_amount_cents=p.refunded_amount_cents+m.amount_cents,
         status=case when p.refunded_amount_cents+m.amount_cents>=p.amount_cents then 'refunded' else 'partially_refunded' end,
         metadata_json=p.metadata_json || jsonb_build_object('lastManualRefundKey',$4,'lastManualRefundReason',$5)
       from marker m where p.id=m.payment_id returning p.id,m.amount_cents refund_delta_cents,p.invoice_id
     ), invoice_update as (
       update public.service_invoices i set amount_paid_cents=greatest(i.amount_paid_cents-u.refund_delta_cents,0),
         status=case when greatest(i.amount_paid_cents-u.refund_delta_cents,0)=0 then 'sent_manually' else 'partially_paid' end,updated_at=now()
       from updated u where i.id=u.invoice_id
     ) select id,refund_delta_cents from updated`,
    [tenantId, parsed.data.paymentId, parsed.data.amountCents, `manual-refund:${parsed.data.idempotencyKey}`,
      parsed.data.reason, actorId(actor.userId)]
  );
  const row = result?.rows[0];
  if (row?.refund_delta_cents) {
    await queryPostgres(`select public.adjust_earn_for_refund($1,$2,$3,'refund')`, [
      row.id, row.refund_delta_cents, `manual-refund:${parsed.data.idempotencyKey}`
    ]);
  }
  refresh();
}

export async function resolveEarnDisputeAction(formData: FormData) {
  const actor = await requirePermission("platform:manage");
  const rawCredit = Number(String(formData.get("creditAmount") ?? "0").replace(/[$,]/g, ""));
  const parsed = resolveDisputeSchema.safeParse({
    disputeId: formData.get("disputeId"), status: formData.get("status"), resolution: formData.get("resolution"),
    creditCents: Math.round(rawCredit * 100)
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `with prior as (
       select d.*,coalesce(d.ledger_entry_id,l.id) linked_entry_id,
         coalesce(l.classification,a.classification,'NEEDS_REVIEW') classification,
         coalesce(l.locked_rate_bps,a.locked_rate_bps,0) locked_rate_bps,
         coalesce(l.opportunity_id,a.opportunity_id) opportunity_id,
         coalesce(l.customer_id,a.customer_id) customer_id,
         l.payment_id,l.job_id
       from public.earn_disputes d
       left join public.earn_attributions a on a.id=d.attribution_id
       left join lateral (
         select * from public.earn_ledger_entries where tenant_id=d.tenant_id
           and (id=d.ledger_entry_id or (d.attribution_id is not null and attribution_id=d.attribution_id))
         order by occurred_at desc limit 1
       ) l on true
       where d.tenant_id=$1 and d.id=$2 and d.status in ('OPEN','UNDER_REVIEW') for update of d
     ), resolved as (
       update public.earn_disputes d set status=$3,resolution=$4,resolved_by_user_id=$5,resolved_at=now(),updated_at=now()
       from prior p where d.id=p.id returning d.*
     ), credit as (
       insert into public.earn_ledger_entries (
         tenant_id,attribution_id,opportunity_id,job_id,customer_id,payment_id,classification,locked_rate_bps,
         eligible_amount_cents,earn_amount_cents,event_type,reason,source_event_key,linked_prior_entry_id,
         billing_period_start,settlement_status,actor_type,actor_user_id,metadata_json
       ) select p.tenant_id,p.attribution_id,p.opportunity_id,p.job_id,p.customer_id,p.payment_id,p.classification,p.locked_rate_bps,
         0,-$6::bigint,'manual_adjustment',$4,'dispute-resolution:'||p.id::text,p.linked_entry_id,
         date_trunc('month',current_date)::date,'unsettled','user',$5,jsonb_build_object('disputeId',p.id,'resolutionStatus',$3)
       from prior p where $3 in ('APPROVED','PARTIALLY_APPROVED') and $6>0
       on conflict (tenant_id,source_event_key) do nothing
     ), ledger_release as (
       update public.earn_ledger_entries l set settlement_status='unsettled'
       from prior p where l.tenant_id=$1 and l.dispute_id=p.id
     )
     update public.earn_attributions a set dispute_status='resolved'
     from prior p where a.tenant_id=$1 and a.id=p.attribution_id`,
    [tenantId, parsed.data.disputeId, parsed.data.status, parsed.data.resolution, actorId(actor.userId), parsed.data.creditCents]
  );
  refresh();
}
