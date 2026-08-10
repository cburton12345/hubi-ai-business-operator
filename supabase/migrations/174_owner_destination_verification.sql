create table if not exists public.owner_destination_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  destination_fingerprint text not null,
  delivery_channel text not null default 'sms' check (delivery_channel in ('sms')),
  provider_key text,
  provider_message_id text,
  code_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','verified','expired','locked','canceled','delivery_failed')),
  attempts_remaining integer not null default 5 check (attempts_remaining between 0 and 5),
  expires_at timestamptz not null,
  last_attempt_at timestamptz,
  verified_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_destination_verification_lookup_idx
  on public.owner_destination_verification_challenges
  (tenant_id, user_id, status, created_at desc);

create index if not exists owner_destination_verification_expiry_idx
  on public.owner_destination_verification_challenges (expires_at)
  where status = 'pending';

alter table public.owner_destination_verification_challenges enable row level security;

drop policy if exists owner_destination_verification_challenges_tenant_operator
  on public.owner_destination_verification_challenges;
create policy owner_destination_verification_challenges_tenant_operator
  on public.owner_destination_verification_challenges
  for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.owner_destination_verification_challenges is
  'Short-lived, hashed, attempt-limited challenges for private owner briefing destinations. Plaintext codes are never stored.';
