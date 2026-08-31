import { queryPostgres } from "@/lib/db/postgres";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { resolveRetellConfiguration } from "@/lib/providers/retell-config";

export type OutboundCapacityDecision = {
  allowed: boolean;
  reservationId: string | null;
  retryAt: string | null;
  providerConcurrency: number;
  normalLimit: number;
  outboundSoftLimit: number;
  reservedInboundSlots: number;
};

type RetellConcurrency = {
  current_concurrency?: number;
  concurrency_limit?: number;
};

export function calculateInboundReserve(normalLimit: number) {
  const limit = Math.max(1, Math.floor(normalLimit));
  if (limit <= 2) return 0;
  return Math.min(limit - 1, Math.max(2, Math.ceil(limit * 0.25)));
}

async function retellConcurrency(tenantId: string) {
  const credentials = await resolveRetellConfiguration(tenantId, true);
  if (!credentials) return null;
  const response = await resilientFetch("https://api.retellai.com/get-concurrency", {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
    cache: "no-store"
  }, { timeoutMs: 8_000, retries: 1 });
  const body = await response.json().catch(() => null) as RetellConcurrency | null;
  const current = Number(body?.current_concurrency);
  const limit = Number(body?.concurrency_limit);
  if (!response.ok || !Number.isFinite(current) || !Number.isFinite(limit) || limit < 1) return null;
  return { current: Math.max(0, Math.floor(current)), limit: Math.floor(limit) };
}

export async function reserveOutboundCapacity(input: {
  tenantId: string;
  providerKey: string;
  queueId?: string | null;
  correlationId?: string | null;
  priority?: "routine" | "high" | "urgent";
}): Promise<OutboundCapacityDecision | null> {
  if (input.providerKey !== "retell_voice") return null;
  const [concurrency, account] = await Promise.all([
    retellConcurrency(input.tenantId),
    queryPostgres<{
      ownership_mode: string;
      fallback_current_concurrency: number | string;
      fallback_normal_limit: number | string | null;
    }>(
      `with account as (
         select ownership_mode from public.provider_accounts where tenant_id=$1 and provider_key=$2 limit 1
       ), tenant_limit as (
         select concurrent_call_limit from public.spend_limits
         where tenant_id=$1 and status='active'
           and (scope_type='tenant' or (scope_type='provider' and scope_key=$2) or (scope_type='feature' and scope_key='ai_receptionist'))
         order by case scope_type when 'provider' then 0 when 'feature' then 1 else 2 end limit 1
       ), global_limit as (
         select concurrent_call_limit from public.spend_limits
         where tenant_id is null and scope_type='global' and scope_key in ('managed_voice','all') and status='active'
         order by case scope_key when 'managed_voice' then 0 else 1 end limit 1
       )
       select a.ownership_mode,
         case when a.ownership_mode='ferocity_managed' then (
           select count(*) from public.receptionist_calls c join public.provider_accounts p
             on p.tenant_id=c.tenant_id and p.provider_key=c.provider_key and p.ownership_mode='ferocity_managed'
           where c.status in ('received','ringing','in_progress') and c.started_at>=now()-interval '4 hours'
         ) else (
           select count(*) from public.receptionist_calls c where c.tenant_id=$1 and c.provider_key=$2
             and c.status in ('received','ringing','in_progress') and c.started_at>=now()-interval '4 hours'
         ) end as fallback_current_concurrency,
         case when a.ownership_mode='ferocity_managed' then (select concurrent_call_limit from global_limit)
              else (select concurrent_call_limit from tenant_limit) end as fallback_normal_limit
       from account a`,
      [input.tenantId, input.providerKey]
    )
  ]);
  const accountRow = account?.rows[0];
  if (!accountRow) return null;
  const fallbackLimit = Number(accountRow.fallback_normal_limit);
  const observed = concurrency ?? (
    Number.isFinite(fallbackLimit) && fallbackLimit > 0
      ? {
          current: Math.max(0, Math.floor(Number(accountRow.fallback_current_concurrency) || 0)),
          limit: Math.floor(fallbackLimit)
        }
      : null
  );
  if (!observed) return null;
  const scope = accountRow.ownership_mode === "ferocity_managed"
    ? `${input.providerKey}:ferocity_managed`
    : `${input.providerKey}:workspace:${input.tenantId}`;
  const reservedInboundSlots = calculateInboundReserve(observed.limit);
  const result = await queryPostgres<{
    allowed: boolean;
    reservation_id: string | null;
    estimated_start_at: Date | string | null;
    outbound_soft_limit: number;
  }>(
    `select * from public.reserve_voice_dispatch_capacity($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.tenantId, input.providerKey, scope, observed.current, observed.limit,
      reservedInboundSlots, input.queueId ?? null, input.correlationId ?? null, input.priority ?? "routine"
    ]
  );
  const row = result?.rows[0];
  if (!row) return null;
  return {
    allowed: row.allowed,
    reservationId: row.reservation_id,
    retryAt: row.estimated_start_at ? new Date(row.estimated_start_at).toISOString() : null,
    providerConcurrency: observed.current,
    normalLimit: observed.limit,
    outboundSoftLimit: Number(row.outbound_soft_limit),
    reservedInboundSlots
  };
}

export async function activateOutboundCapacityReservation(reservationId: string, providerCallId: string) {
  const result = await queryPostgres<{ activate_voice_dispatch_reservation: boolean }>(
    `select public.activate_voice_dispatch_reservation($1,$2)`,
    [reservationId, providerCallId]
  );
  return result?.rows[0]?.activate_voice_dispatch_reservation === true;
}

export async function releaseOutboundCapacityReservation(providerKey: string, providerCallId: string) {
  const result = await queryPostgres<{ release_voice_dispatch_reservation: boolean }>(
    `select public.release_voice_dispatch_reservation($1,$2)`,
    [providerKey, providerCallId]
  );
  return result?.rows[0]?.release_voice_dispatch_reservation === true;
}

export async function abandonOutboundCapacityReservation(reservationId: string) {
  await queryPostgres(
    `update public.voice_dispatch_reservations set status='released',released_at=now(),updated_at=now() where id=$1 and status='reserved'`,
    [reservationId]
  );
}
