-- Phase 6: one operational inbox plus deterministic stop-on-response controls.

alter table public.messaging_conversations
  add column if not exists source_thread_id uuid references public.communication_threads(id) on delete set null,
  add column if not exists assigned_user_id uuid references public.users(id) on delete set null,
  add column if not exists unread_count integer not null default 0 check (unread_count >= 0),
  add column if not exists first_response_due_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists ai_summary text,
  add column if not exists handoff_reason text;

create unique index if not exists messaging_conversations_source_thread_unique
  on public.messaging_conversations (tenant_id, source_thread_id)
  where source_thread_id is not null;

alter table public.messages
  add column if not exists source_message_id uuid references public.communication_messages(id) on delete set null,
  add column if not exists read_at timestamptz;

create unique index if not exists messages_source_message_unique
  on public.messages (tenant_id, source_message_id)
  where source_message_id is not null;

create table if not exists public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.messaging_conversations(id) on delete cascade,
  assigned_user_id uuid references public.users(id) on delete set null,
  assigned_team text,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.conversation_state_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.messaging_conversations(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system'
    check (actor_type in ('customer', 'user', 'ai', 'provider', 'system')),
  actor_id uuid,
  summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_response_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_channel text not null,
  contact_value text not null,
  reason text not null default 'customer_replied',
  active boolean not null default true,
  triggered_at timestamptz not null default now(),
  cleared_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb
);

create unique index if not exists customer_response_stops_active_contact_unique
  on public.customer_response_stops (tenant_id, contact_channel, lower(contact_value))
  where active = true;

create index if not exists messaging_conversations_inbox_idx
  on public.messaging_conversations (tenant_id, status, unread_count desc, last_message_at desc);
create index if not exists conversation_assignments_active_idx
  on public.conversation_assignments (tenant_id, active, assigned_user_id);
create index if not exists conversation_state_events_conversation_idx
  on public.conversation_state_events (tenant_id, conversation_id, created_at desc);

alter table public.conversation_assignments enable row level security;
alter table public.conversation_state_events enable row level security;
alter table public.customer_response_stops enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'conversation_assignments', 'conversation_state_events', 'customer_response_stops'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

-- Bring the older communication-thread records into the canonical provider-independent inbox.
insert into public.messaging_conversations (
  tenant_id, brand_id, lead_id, channel, provider_key, external_conversation_ref,
  source_thread_id, subject, status, unread_count, first_response_due_at,
  last_message_at, metadata_json, created_at, updated_at
)
select
  t.tenant_id, t.brand_id, t.lead_id, t.channel,
  coalesce(t.metadata_json->>'provider', case when t.channel = 'email' then 'resend_email' else 'legacy' end),
  coalesce(t.provider_thread_id, 'communication-thread:' || t.id::text),
  t.id, t.subject,
  case t.status
    when 'waiting_on_team' then 'waiting_on_team'
    when 'waiting_on_customer' then 'waiting_on_customer'
    when 'archived' then 'archived'
    else 'open'
  end,
  case when t.status = 'waiting_on_team' then 1 else 0 end,
  case when t.status = 'waiting_on_team' then coalesce(t.unanswered_since, t.last_message_at, t.created_at) + interval '15 minutes' else null end,
  t.last_message_at, t.metadata_json || jsonb_build_object('backfilledFrom', 'communication_threads'),
  t.created_at, t.updated_at
from public.communication_threads t
on conflict (tenant_id, source_thread_id) where source_thread_id is not null do nothing;

insert into public.messages (
  tenant_id, conversation_id, source_message_id, direction, channel, provider_key,
  provider_message_ref, from_value, to_value, subject, body, status, ai_generated,
  metadata_json, sent_at, received_at, created_at
)
select
  m.tenant_id, c.id, m.id, m.direction, m.channel,
  coalesce(m.metadata_json->>'provider', c.provider_key),
  m.provider_message_id, m.sender_label, m.recipient_label, null, m.body,
  case m.status when 'received' then 'received' when 'sent' then 'sent' when 'failed' then 'failed' else 'archived' end,
  case when lower(coalesce(m.metadata_json->>'aiGenerated', 'false')) = 'true' then true else false end,
  m.metadata_json || jsonb_build_object('backfilledFrom', 'communication_messages'),
  m.sent_at, m.received_at, m.created_at
from public.communication_messages m
join public.messaging_conversations c on c.tenant_id = m.tenant_id and c.source_thread_id = m.thread_id
on conflict (tenant_id, source_message_id) where source_message_id is not null do nothing;
