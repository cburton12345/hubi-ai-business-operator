alter table public.managed_ad_budget_controls
  add column if not exists provider_funding_account_id uuid
    references public.provider_funding_accounts(id) on delete set null;

update public.managed_ad_budget_controls c
set provider_funding_account_id = (
  select f.id
  from public.provider_funding_accounts f
  where f.tenant_id is null
    and f.provider_key = c.provider_key
    and f.ownership_mode = 'ferocity_managed'
  order by f.created_at
  limit 1
)
where c.lane_key = 'ferocity_managed'
  and c.provider_funding_account_id is null
  and 1 = (
    select count(*)
    from public.provider_funding_accounts f
    where f.tenant_id is null
      and f.provider_key = c.provider_key
      and f.ownership_mode = 'ferocity_managed'
  );

create table if not exists public.managed_ad_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  budget_control_id uuid not null references public.managed_ad_budget_controls(id) on delete cascade,
  provider_key text not null,
  idempotency_key text not null,
  requested_cents integer not null check (requested_cents > 0),
  settled_cents integer not null default 0 check (settled_cents >= 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'settled', 'released', 'expired')),
  source_table text,
  source_id uuid,
  external_reference text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  settled_at timestamptz,
  released_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_managed_ad_reservations_active
  on public.managed_ad_spend_reservations(budget_control_id, status, expires_at);

alter table public.managed_ad_spend_reservations enable row level security;

drop policy if exists managed_ad_spend_reservations_tenant_admin on public.managed_ad_spend_reservations;
create policy managed_ad_spend_reservations_tenant_admin
on public.managed_ad_spend_reservations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

alter table public.managed_ad_spend_events
  drop constraint if exists managed_ad_spend_events_event_type_check;

alter table public.managed_ad_spend_events
  add constraint managed_ad_spend_events_event_type_check
  check (event_type in (
    'prepaid_credit', 'budget_reserved', 'reservation_released', 'spend_recorded',
    'refund_recorded', 'adjustment', 'blocked_attempt', 'auto_paused'
  ));

create or replace function public.reserve_managed_ad_spend(
  p_tenant_id uuid,
  p_provider_key text,
  p_requested_cents integer,
  p_idempotency_key text,
  p_source_table text default null,
  p_source_id uuid default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  allowed boolean,
  decision_status text,
  reason text,
  available_cents integer,
  daily_remaining_cents integer,
  monthly_remaining_cents integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_control public.managed_ad_budget_controls%rowtype;
  v_existing public.managed_ad_spend_reservations%rowtype;
  v_daily_spent integer := 0;
  v_monthly_spent integer := 0;
  v_active_reserved integer := 0;
  v_available integer := 0;
  v_provider_available integer := 0;
  v_provider_month_spent integer := 0;
  v_funding public.provider_funding_accounts%rowtype;
  v_reservation_id uuid;
  v_reason text;
  v_status text;
  v_should_pause boolean := false;
begin
  if p_requested_cents is null or p_requested_cents <= 0 then
    return query select null::uuid, false, 'blocked', 'Requested spend must be greater than zero.', 0, 0, 0;
    return;
  end if;

  if nullif(trim(p_idempotency_key), '') is null then
    return query select null::uuid, false, 'blocked', 'A stable idempotency key is required.', 0, 0, 0;
    return;
  end if;

  select * into v_existing
  from public.managed_ad_spend_reservations
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;

  if found then
    return query select
      v_existing.id,
      v_existing.status in ('reserved', 'settled'),
      v_existing.status,
      case
        when v_existing.status in ('reserved', 'settled') then 'This managed-ad spend request was already accepted.'
        else 'This managed-ad spend request was previously released or expired.'
      end,
      0, 0, 0;
    return;
  end if;

  select * into v_control
  from public.managed_ad_budget_controls
  where tenant_id = p_tenant_id
    and provider_key = p_provider_key
    and lane_key = 'ferocity_managed'
  for update;

  if not found then
    return query select null::uuid, false, 'blocked', 'No managed ad budget control exists for this provider.', 0, 0, 0;
    return;
  end if;

  update public.managed_ad_spend_reservations
  set status = 'expired', released_at = now(), updated_at = now()
  where budget_control_id = v_control.id
    and status = 'reserved'
    and expires_at <= now();

  select coalesce(sum(requested_cents), 0)::integer into v_active_reserved
  from public.managed_ad_spend_reservations
  where budget_control_id = v_control.id
    and status = 'reserved'
    and expires_at > now();

  update public.managed_ad_budget_controls
  set reserved_cents = v_active_reserved, updated_at = now()
  where id = v_control.id;

  v_control.reserved_cents := v_active_reserved;
  v_available := greatest(0, v_control.prepaid_balance_cents - v_control.spent_cents - v_active_reserved);

  select coalesce(sum(amount_cents), 0)::integer into v_daily_spent
  from public.managed_ad_spend_events
  where budget_control_id = v_control.id
    and event_type = 'spend_recorded'
    and created_at >= date_trunc('day', now());

  select coalesce(sum(amount_cents), 0)::integer into v_monthly_spent
  from public.managed_ad_spend_events
  where budget_control_id = v_control.id
    and event_type = 'spend_recorded'
    and created_at >= date_trunc('month', now());

  if not v_control.live_spend_enabled or v_control.status in ('not_ready', 'blocked', 'archived') then
    v_status := 'blocked';
    v_reason := 'Managed ad spend is disabled for this workspace and provider.';
  elsif v_control.status = 'paused' then
    v_status := 'paused';
    v_reason := 'Managed ad spend is paused for this workspace.';
  elsif not v_control.approved_by_customer then
    v_status := 'needs_approval';
    v_reason := 'Customer approval is required before Ferocity-managed ad spend.';
  elsif v_control.daily_cap_cents <= 0 or v_control.monthly_cap_cents <= 0 then
    v_status := 'needs_caps';
    v_reason := 'Daily and monthly ad spend caps must be set before launch.';
  elsif v_daily_spent + v_active_reserved + p_requested_cents > v_control.daily_cap_cents then
    v_status := 'needs_caps';
    v_reason := 'This spend would exceed the remaining daily cap.';
  elsif v_monthly_spent + v_active_reserved + p_requested_cents > v_control.monthly_cap_cents then
    v_status := 'needs_caps';
    v_reason := 'This spend would exceed the remaining monthly cap.';
  elsif v_control.stop_loss_cents > 0 and v_monthly_spent + v_active_reserved + p_requested_cents > v_control.stop_loss_cents then
    v_status := 'paused';
    v_reason := 'The managed-ad stop-loss threshold was reached.';
    v_should_pause := true;
  elsif v_control.prepaid_required and p_requested_cents > v_available then
    v_status := 'needs_payment';
    v_reason := 'The customer prepaid ad wallet does not have enough available funds.';
  elsif v_control.provider_funding_account_id is null then
    v_status := 'blocked';
    v_reason := 'The Ferocity provider funding account is not linked.';
  else
    select * into v_funding
    from public.provider_funding_accounts
    where id = v_control.provider_funding_account_id
      and provider_key = p_provider_key
      and ownership_mode = 'ferocity_managed'
    for update;

    if not found then
      v_status := 'blocked';
      v_reason := 'The linked provider funding account is unavailable.';
    elsif v_funding.payment_status <> 'current' or v_funding.status in ('depleted', 'payment_issue', 'paused', 'closed') then
      v_status := 'blocked';
      v_reason := 'The provider payment account is not ready for customer spend.';
    elsif v_funding.last_balance_sync_at is null or v_funding.last_balance_sync_at < now() - interval '36 hours' then
      v_status := 'blocked';
      v_reason := 'The provider balance must be refreshed before customer spend.';
    else
      select coalesce(sum(e.amount_cents), 0)::integer into v_provider_month_spent
      from public.managed_ad_spend_events e
      join public.managed_ad_budget_controls c on c.id = e.budget_control_id
      where c.provider_funding_account_id = v_funding.id
        and e.event_type = 'spend_recorded'
        and e.created_at >= date_trunc('month', now());

      v_provider_available := greatest(
        0,
        coalesce(v_funding.current_balance_cents, 0)::integer
        + case
            when v_funding.promotional_expires_at is null or v_funding.promotional_expires_at > now()
              then coalesce(v_funding.promotional_balance_cents, 0)::integer
            else 0
          end
        + case
            when v_funding.reload_enabled and v_funding.monthly_reload_limit_cents is not null
              then greatest(0, v_funding.monthly_reload_limit_cents::integer - v_provider_month_spent)
            else 0
          end
        - coalesce((
            select sum(r.requested_cents)
            from public.managed_ad_spend_reservations r
            join public.managed_ad_budget_controls c on c.id = r.budget_control_id
            where c.provider_funding_account_id = v_funding.id
              and r.status = 'reserved'
              and r.expires_at > now()
          ), 0)::integer
      );

      if p_requested_cents > v_provider_available then
        v_status := 'blocked';
        v_reason := 'The provider account balance cannot safely fund this spend.';
        v_should_pause := true;
      end if;
    end if;
  end if;

  if v_status is not null then
    if v_should_pause then
      update public.managed_ad_budget_controls
      set status = 'paused', live_spend_enabled = false, updated_at = now()
      where id = v_control.id;
    end if;

    insert into public.managed_ad_spend_events (
      tenant_id, budget_control_id, provider_key, event_type, amount_cents,
      idempotency_key, source_table, source_id, description, metadata_json
    ) values (
      p_tenant_id, v_control.id, p_provider_key,
      case when v_should_pause then 'auto_paused' else 'blocked_attempt' end,
      p_requested_cents, p_idempotency_key || ':blocked', p_source_table, p_source_id,
      v_reason, coalesce(p_metadata_json, '{}'::jsonb)
    ) on conflict (tenant_id, idempotency_key) do nothing;

    return query select
      null::uuid, false, v_status, v_reason, v_available,
      greatest(0, v_control.daily_cap_cents - v_daily_spent - v_active_reserved),
      greatest(0, v_control.monthly_cap_cents - v_monthly_spent - v_active_reserved);
    return;
  end if;

  insert into public.managed_ad_spend_reservations (
    tenant_id, budget_control_id, provider_key, idempotency_key, requested_cents,
    source_table, source_id, metadata_json
  ) values (
    p_tenant_id, v_control.id, p_provider_key, p_idempotency_key, p_requested_cents,
    p_source_table, p_source_id, coalesce(p_metadata_json, '{}'::jsonb)
  ) returning id into v_reservation_id;

  update public.managed_ad_budget_controls
  set reserved_cents = reserved_cents + p_requested_cents, updated_at = now()
  where id = v_control.id;

  insert into public.managed_ad_spend_events (
    tenant_id, budget_control_id, provider_key, event_type, amount_cents,
    idempotency_key, source_table, source_id, description, metadata_json
  ) values (
    p_tenant_id, v_control.id, p_provider_key, 'budget_reserved', p_requested_cents,
    p_idempotency_key || ':reserved', p_source_table, p_source_id,
    'Managed-ad budget reserved before provider execution.', coalesce(p_metadata_json, '{}'::jsonb)
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return query select
    v_reservation_id, true, 'reserved', 'Managed-ad budget was reserved.',
    greatest(0, v_available - p_requested_cents),
    greatest(0, v_control.daily_cap_cents - v_daily_spent - v_active_reserved - p_requested_cents),
    greatest(0, v_control.monthly_cap_cents - v_monthly_spent - v_active_reserved - p_requested_cents);
end;
$$;

create or replace function public.settle_managed_ad_spend(
  p_tenant_id uuid,
  p_reservation_id uuid,
  p_actual_spend_cents integer,
  p_external_reference text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reservation public.managed_ad_spend_reservations%rowtype;
  v_overspent boolean;
begin
  if p_actual_spend_cents is null or p_actual_spend_cents < 0 then
    raise exception 'Actual spend cannot be negative';
  end if;

  select * into v_reservation
  from public.managed_ad_spend_reservations
  where id = p_reservation_id and tenant_id = p_tenant_id
  for update;

  if not found then return false; end if;
  if v_reservation.status = 'settled' then return true; end if;
  if v_reservation.status <> 'reserved' then return false; end if;

  v_overspent := p_actual_spend_cents > v_reservation.requested_cents;

  update public.managed_ad_spend_reservations
  set status = 'settled', settled_cents = p_actual_spend_cents,
      external_reference = p_external_reference, settled_at = now(), updated_at = now(),
      metadata_json = metadata_json || coalesce(p_metadata_json, '{}'::jsonb)
  where id = v_reservation.id;

  update public.managed_ad_budget_controls
  set reserved_cents = greatest(0, reserved_cents - v_reservation.requested_cents),
      spent_cents = spent_cents + p_actual_spend_cents,
      status = case when v_overspent then 'paused' else status end,
      live_spend_enabled = case when v_overspent then false else live_spend_enabled end,
      updated_at = now()
  where id = v_reservation.budget_control_id;

  insert into public.managed_ad_spend_events (
    tenant_id, budget_control_id, provider_key, event_type, amount_cents,
    idempotency_key, source_table, source_id, description, metadata_json
  ) values (
    p_tenant_id, v_reservation.budget_control_id, v_reservation.provider_key,
    'spend_recorded', p_actual_spend_cents, v_reservation.idempotency_key || ':settled',
    v_reservation.source_table, v_reservation.source_id,
    case when v_overspent then 'Provider spend exceeded the reservation; managed spend was paused.' else 'Managed-ad spend settled.' end,
    coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object('overspentReservation', v_overspent)
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return true;
end;
$$;

create or replace function public.release_managed_ad_spend(
  p_tenant_id uuid,
  p_reservation_id uuid,
  p_reason text default 'Provider action did not execute',
  p_metadata_json jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reservation public.managed_ad_spend_reservations%rowtype;
begin
  select * into v_reservation
  from public.managed_ad_spend_reservations
  where id = p_reservation_id and tenant_id = p_tenant_id
  for update;

  if not found then return false; end if;
  if v_reservation.status = 'released' then return true; end if;
  if v_reservation.status <> 'reserved' then return false; end if;

  update public.managed_ad_spend_reservations
  set status = 'released', released_at = now(), updated_at = now(),
      metadata_json = metadata_json || coalesce(p_metadata_json, '{}'::jsonb)
  where id = v_reservation.id;

  update public.managed_ad_budget_controls
  set reserved_cents = greatest(0, reserved_cents - v_reservation.requested_cents), updated_at = now()
  where id = v_reservation.budget_control_id;

  insert into public.managed_ad_spend_events (
    tenant_id, budget_control_id, provider_key, event_type, amount_cents,
    idempotency_key, source_table, source_id, description, metadata_json
  ) values (
    p_tenant_id, v_reservation.budget_control_id, v_reservation.provider_key,
    'reservation_released', v_reservation.requested_cents, v_reservation.idempotency_key || ':released',
    v_reservation.source_table, v_reservation.source_id, p_reason, coalesce(p_metadata_json, '{}'::jsonb)
  ) on conflict (tenant_id, idempotency_key) do nothing;

  return true;
end;
$$;

revoke all on function public.reserve_managed_ad_spend(uuid, text, integer, text, text, uuid, jsonb) from public;
revoke all on function public.settle_managed_ad_spend(uuid, uuid, integer, text, jsonb) from public;
revoke all on function public.release_managed_ad_spend(uuid, uuid, text, jsonb) from public;
