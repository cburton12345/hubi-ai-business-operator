-- Extend the existing provider-independent messaging engine with normalized
-- delivery health and auditable retry lineage. This deliberately reuses the
-- canonical messages, delivery events, provider accounts, alerts, and routing.

alter table public.messages
  add column if not exists delivery_status text not null default 'unknown'
    check (delivery_status in (
      'accepted', 'queued', 'sending', 'sent', 'delivered',
      'failed', 'rejected', 'undelivered', 'suspected_filtered', 'unknown'
    )),
  add column if not exists delivery_raw_status text,
  add column if not exists delivery_error_code text,
  add column if not exists delivery_safe_reason text,
  add column if not exists delivery_final boolean not null default false,
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists retry_of_message_id uuid references public.messages(id) on delete set null,
  add column if not exists retry_attempt integer not null default 0 check (retry_attempt between 0 and 10);

alter table public.message_delivery_events
  add column if not exists normalized_status text
    check (normalized_status is null or normalized_status in (
      'accepted', 'queued', 'sending', 'sent', 'delivered',
      'failed', 'rejected', 'undelivered', 'suspected_filtered', 'unknown'
    )),
  add column if not exists raw_provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists receipt_at timestamptz not null default now(),
  add column if not exists is_final boolean not null default false,
  add column if not exists suspected_filtered boolean not null default false,
  add column if not exists idempotency_key text;

create unique index if not exists message_delivery_events_idempotency_unique
  on public.message_delivery_events (tenant_id, provider_key, idempotency_key)
  where idempotency_key is not null;

create index if not exists messages_delivery_attention_idx
  on public.messages (tenant_id, delivery_status, delivery_updated_at desc)
  where direction = 'outbound'
    and delivery_status in ('failed', 'rejected', 'undelivered', 'suspected_filtered');

create index if not exists messages_retry_lineage_idx
  on public.messages (tenant_id, retry_of_message_id, retry_attempt)
  where retry_of_message_id is not null;

update public.messages
set delivery_status = case status
      when 'queued' then 'queued'
      when 'sent' then 'sent'
      when 'sent_manually' then 'sent'
      when 'delivered' then 'delivered'
      when 'failed' then 'failed'
      when 'blocked' then 'rejected'
      else 'unknown'
    end,
    delivery_final = status in ('delivered', 'failed', 'blocked'),
    delivery_updated_at = coalesce(sent_at, created_at)
where direction = 'outbound'
  and delivery_status = 'unknown';

comment on column public.messages.delivery_status is
  'Provider-independent delivery health. Raw provider states remain in delivery_raw_status and delivery events.';
comment on column public.messages.retry_of_message_id is
  'Original failed/uncertain outbound message that caused this explicit retry. The original record is never rewritten as successful.';
