import type { PoolClient } from "pg";

type LedgerClient = Pick<PoolClient, "query">;

export type WorkerBalanceEntryKind =
  | "cash_advance"
  | "personal_purchase"
  | "gift"
  | "business_expense"
  | "reimbursement"
  | "loss_damage";

export function isWorkerDebtKind(kind: WorkerBalanceEntryKind) {
  return kind === "cash_advance" || kind === "personal_purchase";
}

export function parseWorkerMoneyToCents(
  raw: string,
  locale: "en" | "es",
  maxCents = 100_000_000
) {
  const value = raw.trim().replace(/^\$\s*/, "").replace(/\s*USD$/i, "").trim();
  if (!value || value.startsWith("-") || value.startsWith("+")) return null;
  const pattern = locale === "es"
    ? /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/
    : /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) return null;
  const normalized = locale === "es"
    ? value.replaceAll(".", "").replace(",", ".")
    : value.replaceAll(",", "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return cents > 0 && cents <= maxCents ? cents : null;
}

type LockedAdvance = {
  id: string;
  worker_id: string;
  amount_cents: number;
  currency: string;
  is_worker_debt: boolean;
  approval_status: string;
  worker_authorization_status: string;
  status: string;
};

async function lockAdvance(client: LedgerClient, tenantId: string, advanceId: string) {
  const result = await client.query<LockedAdvance>(
    `select id,worker_id,amount_cents,currency,is_worker_debt,approval_status,
            worker_authorization_status,status
     from public.employee_cash_advances
     where tenant_id=$1 and id=$2
     for update`,
    [tenantId, advanceId]
  );
  return result.rows[0] ?? null;
}

async function recoveredCents(client: LedgerClient, tenantId: string, advanceId: string) {
  const result = await client.query<{ recovered_cents: string }>(
    `select (
       coalesce((select sum(amount_cents) from public.employee_advance_repayments
                 where tenant_id=$1 and advance_id=$2 and status='recorded'),0)
       + coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations
                   where tenant_id=$1 and advance_id=$2 and status='confirmed'),0)
     )::text as recovered_cents`,
    [tenantId, advanceId]
  );
  return Number(result.rows[0]?.recovered_cents ?? 0);
}

async function appendEvent(
  client: LedgerClient,
  input: {
    tenantId: string;
    advanceId: string;
    workerId: string;
    eventType: string;
    actorUserId: string | null;
    actorWorkerId?: string | null;
    note?: string | null;
    previous?: Record<string, unknown>;
    next?: Record<string, unknown>;
  }
) {
  const result = await client.query(
    `insert into public.employee_advance_events
       (tenant_id,advance_id,worker_id,event_type,actor_user_id,actor_worker_id,note,previous_state_json,new_state_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
    [
      input.tenantId,input.advanceId,input.workerId,input.eventType,input.actorUserId,
      input.actorWorkerId ?? null,input.note ?? null,
      JSON.stringify(input.previous ?? {}),JSON.stringify(input.next ?? {})
    ]
  );
  if (result.rowCount !== 1) throw new Error("Worker balance audit evidence was not saved.");
}

export async function recordWorkerBalanceRepayment(
  client: LedgerClient,
  input: {
    tenantId: string;
    advanceId: string;
    amountCents: number;
    repaidAt: string;
    method: "cash" | "check" | "bank_transfer" | "other";
    note: string | null;
    idempotencyKey: string;
    actorUserId: string | null;
  }
) {
  const replay = await client.query<{
    advance_id: string;amount_cents: number;repaid_at: string;repayment_method: string;note: string | null;
  }>(
    `select advance_id,amount_cents,repaid_at::text,repayment_method,note
     from public.employee_advance_repayments where tenant_id=$1 and idempotency_key=$2 limit 1`,
    [input.tenantId,input.idempotencyKey]
  );
  const previous = replay.rows[0];
  if (previous) {
    const matches = previous.advance_id === input.advanceId && previous.amount_cents === input.amountCents
      && previous.repaid_at === input.repaidAt && previous.repayment_method === input.method
      && (previous.note ?? null) === (input.note ?? null);
    return matches ? { outcome: "already_recorded" as const } : { outcome: "idempotency_conflict" as const };
  }
  const advance = await lockAdvance(client, input.tenantId, input.advanceId);
  if (!advance) return { outcome: "not_found" as const };
  const racedReplay = await client.query<{
    advance_id: string;amount_cents: number;repaid_at: string;repayment_method: string;note: string | null;
  }>(
    `select advance_id,amount_cents,repaid_at::text,repayment_method,note
     from public.employee_advance_repayments where tenant_id=$1 and idempotency_key=$2 limit 1`,
    [input.tenantId,input.idempotencyKey]
  );
  if (racedReplay.rows[0]) {
    const row = racedReplay.rows[0];
    const matches = row.advance_id === input.advanceId && row.amount_cents === input.amountCents
      && row.repaid_at === input.repaidAt && row.repayment_method === input.method
      && (row.note ?? null) === (input.note ?? null);
    return matches ? { outcome: "already_recorded" as const } : { outcome: "idempotency_conflict" as const };
  }
  if (!advance.is_worker_debt || advance.approval_status !== "approved" || advance.status === "void") {
    return { outcome: "not_recoverable" as const };
  }
  const recovered = await recoveredCents(client, input.tenantId, input.advanceId);
  const outstanding = Math.max(0, advance.amount_cents - recovered);
  if (input.amountCents <= 0 || input.amountCents > outstanding) {
    return { outcome: "exceeds_outstanding" as const, outstandingCents: outstanding };
  }
  const inserted = await client.query<{ id: string }>(
    `insert into public.employee_advance_repayments
       (tenant_id,advance_id,worker_id,amount_cents,currency,repaid_at,repayment_method,note,idempotency_key,created_by_user_id)
     values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10)
     on conflict (tenant_id,idempotency_key) do nothing returning id`,
    [input.tenantId,advance.id,advance.worker_id,input.amountCents,advance.currency,input.repaidAt,input.method,input.note,input.idempotencyKey,input.actorUserId]
  );
  if (!inserted.rows[0]) {
    const winner = await client.query<{
      advance_id: string;amount_cents: number;repaid_at: string;repayment_method: string;note: string | null;
    }>(
      `select advance_id,amount_cents,repaid_at::text,repayment_method,note
       from public.employee_advance_repayments where tenant_id=$1 and idempotency_key=$2 limit 1`,
      [input.tenantId,input.idempotencyKey]
    );
    const row = winner.rows[0];
    const matches = row?.advance_id === input.advanceId && row.amount_cents === input.amountCents
      && row.repaid_at === input.repaidAt && row.repayment_method === input.method
      && (row.note ?? null) === (input.note ?? null);
    return matches ? { outcome: "already_recorded" as const } : { outcome: "idempotency_conflict" as const };
  }
  const remaining = outstanding - input.amountCents;
  await client.query(
    `update public.employee_cash_advances set status=$3,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId,advance.id,remaining === 0 ? "recovered" : "partially_recovered"]
  );
  await appendEvent(client, {
    tenantId: input.tenantId, advanceId: advance.id, workerId: advance.worker_id,
    eventType: "repayment_recorded", actorUserId: input.actorUserId, note: input.note,
    previous: { outstandingCents: outstanding }, next: { repaymentCents: input.amountCents, outstandingCents: remaining }
  });
  return { outcome: "recorded" as const, outstandingCents: remaining };
}

export async function confirmWorkerPayAllocation(
  client: LedgerClient,
  input: {
    tenantId: string;
    advanceId: string;
    amountCents: number;
    payPeriodStart: string;
    payPeriodEnd: string;
    workerAuthorizationEvidence: string;
    legalPolicyReview: string;
    idempotencyKey: string;
    actorUserId: string;
  }
) {
  const replay = await client.query<{
    advance_id: string;amount_cents: number;pay_period_start: string;pay_period_end: string;
    worker_authorization_evidence: string;legal_policy_review: string;
  }>(
    `select advance_id,amount_cents,pay_period_start::text,pay_period_end::text,
            worker_authorization_evidence,legal_policy_review
     from public.employee_advance_pay_allocations where tenant_id=$1 and idempotency_key=$2 limit 1`,
    [input.tenantId,input.idempotencyKey]
  );
  const previous = replay.rows[0];
  if (previous) {
    const matches = previous.advance_id === input.advanceId && previous.amount_cents === input.amountCents
      && previous.pay_period_start === input.payPeriodStart && previous.pay_period_end === input.payPeriodEnd
      && previous.worker_authorization_evidence === input.workerAuthorizationEvidence
      && previous.legal_policy_review === input.legalPolicyReview;
    return matches ? { outcome: "already_confirmed" as const } : { outcome: "idempotency_conflict" as const };
  }
  const advance = await lockAdvance(client, input.tenantId, input.advanceId);
  if (!advance) return { outcome: "not_found" as const };
  const racedReplay = await client.query<{
    advance_id: string;amount_cents: number;pay_period_start: string;pay_period_end: string;
    worker_authorization_evidence: string;legal_policy_review: string;
  }>(
    `select advance_id,amount_cents,pay_period_start::text,pay_period_end::text,
            worker_authorization_evidence,legal_policy_review
     from public.employee_advance_pay_allocations where tenant_id=$1 and idempotency_key=$2 limit 1`,
    [input.tenantId,input.idempotencyKey]
  );
  if (racedReplay.rows[0]) {
    const row = racedReplay.rows[0];
    const matches = row.advance_id === input.advanceId && row.amount_cents === input.amountCents
      && row.pay_period_start === input.payPeriodStart && row.pay_period_end === input.payPeriodEnd
      && row.worker_authorization_evidence === input.workerAuthorizationEvidence
      && row.legal_policy_review === input.legalPolicyReview;
    return matches ? { outcome: "already_confirmed" as const } : { outcome: "idempotency_conflict" as const };
  }
  if (
    !advance.is_worker_debt || advance.approval_status !== "approved" ||
    advance.worker_authorization_status !== "authorized" || advance.status === "void"
  ) return { outcome: "not_authorized" as const };
  if (advance.currency !== "USD") return { outcome: "currency_not_supported" as const, currency: advance.currency };
  if (!input.workerAuthorizationEvidence.trim() || !input.legalPolicyReview.trim()) {
    return { outcome: "missing_evidence" as const };
  }
  const recovered = await recoveredCents(client, input.tenantId, input.advanceId);
  const outstanding = Math.max(0, advance.amount_cents - recovered);
  if (input.amountCents <= 0 || input.amountCents > outstanding) {
    return { outcome: "exceeds_outstanding" as const, outstandingCents: outstanding };
  }
  const inserted = await client.query<{ id: string }>(
    `insert into public.employee_advance_pay_allocations
       (tenant_id,advance_id,worker_id,pay_period_start,pay_period_end,amount_cents,currency,status,
        worker_authorization_evidence,legal_policy_review,manager_confirmed_by_user_id,manager_confirmed_at,idempotency_key)
     values ($1,$2,$3,$4::date,$5::date,$6,$7,'confirmed',$8,$9,$10,now(),$11)
     on conflict (tenant_id,idempotency_key) do nothing returning id`,
    [
      input.tenantId,advance.id,advance.worker_id,input.payPeriodStart,input.payPeriodEnd,
      input.amountCents,advance.currency,input.workerAuthorizationEvidence,input.legalPolicyReview,
      input.actorUserId,input.idempotencyKey
    ]
  );
  if (!inserted.rows[0]) {
    const winner = await client.query<{
      advance_id: string;amount_cents: number;pay_period_start: string;pay_period_end: string;
      worker_authorization_evidence: string;legal_policy_review: string;
    }>(
      `select advance_id,amount_cents,pay_period_start::text,pay_period_end::text,
              worker_authorization_evidence,legal_policy_review
       from public.employee_advance_pay_allocations where tenant_id=$1 and idempotency_key=$2 limit 1`,
      [input.tenantId,input.idempotencyKey]
    );
    const row = winner.rows[0];
    const matches = row?.advance_id === input.advanceId && row.amount_cents === input.amountCents
      && row.pay_period_start === input.payPeriodStart && row.pay_period_end === input.payPeriodEnd
      && row.worker_authorization_evidence === input.workerAuthorizationEvidence
      && row.legal_policy_review === input.legalPolicyReview;
    return matches ? { outcome: "already_confirmed" as const } : { outcome: "idempotency_conflict" as const };
  }
  const remaining = outstanding - input.amountCents;
  await client.query(
    `update public.employee_cash_advances set status=$3,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId,advance.id,remaining === 0 ? "recovered" : "partially_recovered"]
  );
  await appendEvent(client, {
    tenantId: input.tenantId, advanceId: advance.id, workerId: advance.worker_id,
    eventType: "allocation_confirmed", actorUserId: input.actorUserId,
    note: input.legalPolicyReview,
    previous: { outstandingCents: outstanding },
    next: { allocationCents: input.amountCents, outstandingCents: remaining, payPeriodStart: input.payPeriodStart, payPeriodEnd: input.payPeriodEnd }
  });
  return { outcome: "confirmed" as const, outstandingCents: remaining };
}
