-- A provider accepting an outbound call does not prove the displayed caller ID
-- can receive a callback. Keep customer outreach off any number until an actual
-- inbound call has reached the correct Ferocity workspace and agent.

alter table public.telephony_numbers
  add column if not exists callback_status text not null default 'untested'
    check (callback_status in ('untested', 'certified', 'degraded', 'blocked', 'not_required')),
  add column if not exists callback_last_tested_at timestamptz,
  add column if not exists callback_last_failure_at timestamptz,
  add column if not exists callback_failure_reason text;

create index if not exists idx_telephony_numbers_callback_readiness
  on public.telephony_numbers (tenant_id, provider_key, callback_status)
  where status = 'active' and outbound_enabled = true;

comment on column public.telephony_numbers.callback_status is
  'Whether a real callback to this exact caller ID reached the intended Ferocity workspace and voice agent.';

-- Existing numbers have not earned certification merely because their provider
-- record says inbound_enabled. They must pass the real carrier-to-agent test.
update public.telephony_numbers
set callback_status = 'untested',
    callback_failure_reason = coalesce(callback_failure_reason, 'A real inbound callback has not been certified yet.'),
    updated_at = now()
where callback_status = 'untested';
