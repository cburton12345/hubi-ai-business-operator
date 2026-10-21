create extension if not exists pgcrypto;

alter table public.customer_portal_access
  add column if not exists token_hash text;

update public.customer_portal_access
set token_hash = encode(digest(public_token, 'sha256'), 'hex')
where token_hash is null and public_token is not null;

do $$
begin
  if exists (select 1 from public.customer_portal_access where token_hash is null) then
    raise exception 'customer portal token hash backfill is incomplete';
  end if;
end $$;

alter table public.customer_portal_access
  alter column token_hash set not null,
  alter column public_token drop not null;

create unique index if not exists customer_portal_access_token_hash_unique
  on public.customer_portal_access(token_hash);

create index if not exists customer_portal_access_active_token_hash_idx
  on public.customer_portal_access(token_hash)
  where enabled = true;

comment on column public.customer_portal_access.token_hash is
  'SHA-256 digest of the customer-held bearer token. New and rotated links are hash-only.';

comment on column public.customer_portal_access.public_token is
  'Legacy compatibility column. Existing plaintext is retained during the zero-downtime transition and removed when that link is rotated; new code must never write a bearer token here.';
