alter table public.webhook_endpoints
  add column if not exists provider_key text,
  add column if not exists connection_mode text not null default 'generic'
    check (connection_mode in ('generic','middleware_bridge','native_oauth')),
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.webhook_events
  add column if not exists external_event_id text;

create unique index if not exists webhook_events_endpoint_external_event_unique
  on public.webhook_events(endpoint_id, external_event_id)
  where endpoint_id is not null and external_event_id is not null;

comment on column public.webhook_endpoints.connection_mode is
  'Truthful connection mode. Middleware bridges accept Ferocity canonical events; they are not represented as native provider OAuth.';
