alter table public.webhook_endpoints
  add column if not exists direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound')),
  add column if not exists inbound_token_hash text,
  add column if not exists last_received_at timestamptz;

create index if not exists idx_webhook_endpoints_inbound_token
  on public.webhook_endpoints(inbound_token_hash)
  where inbound_token_hash is not null;
