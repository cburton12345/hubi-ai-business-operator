create table if not exists public.public_sms_consents (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  service_consent boolean not null default true,
  marketing_consent boolean not null default false,
  status text not null default 'granted'
    check (status in ('granted', 'revoked')),
  source text not null default 'ferocity_public_sms_opt_in',
  disclosure_version text not null,
  user_agent text,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_e164)
);

create index if not exists idx_public_sms_consents_status
  on public.public_sms_consents(status, updated_at desc);

alter table public.public_sms_consents enable row level security;

comment on table public.public_sms_consents is
  'Server-controlled consent evidence for Ferocity public SMS programs. No anonymous database policy is granted.';
