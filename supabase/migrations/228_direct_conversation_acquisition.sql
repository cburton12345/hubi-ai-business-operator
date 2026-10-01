-- Native click -> conversation -> customer -> cash attribution.
-- Extends the canonical messaging, growth attribution and conversion queues.

create table if not exists public.conversation_acquisition_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  name text not null,
  status text not null default 'active' check (status in ('draft','active','paused','archived')),
  preferred_channel text not null default 'sms' check (preferred_channel in ('sms','mms','whatsapp','rcs','apple_business_chat','meta_messenger','instagram','website_chat','phone')),
  destination_value text,
  prefilled_message text not null default 'Hi, I would like more information.',
  source_name text,
  campaign_reference text,
  ad_reference text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fallback_url text,
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_acquisition_clicks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  link_id uuid not null references public.conversation_acquisition_links(id) on delete cascade,
  token_hash text not null unique,
  token_preview text not null,
  status text not null default 'clicked' check (status in ('clicked','destination_opened','conversation_matched','converted','expired','blocked')),
  request_attribution_json jsonb not null default '{}'::jsonb,
  user_agent text,
  referrer text,
  ip_hash text,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  clicked_at timestamptz not null default now(),
  matched_at timestamptz,
  converted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.conversion_feedback_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider_key text not null,
  connection_id uuid references public.integration_connections(id) on delete set null,
  status text not null default 'not_configured' check (status in ('not_configured','configured','active','paused','error','revoked')),
  supported_event_types text[] not null default array[]::text[],
  requires_manual_approval boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, provider_key)
);

create table if not exists public.conversion_feedback_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_event_id uuid not null references public.revenue_conversion_event_queue(id) on delete cascade,
  destination_id uuid not null references public.conversion_feedback_destinations(id) on delete cascade,
  provider_key text not null,
  event_id text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','retry','failed','skipped','canceled')),
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, destination_id, event_id)
);

alter table public.growth_attribution_touches
  add column if not exists conversation_link_id uuid references public.conversation_acquisition_links(id) on delete set null,
  add column if not exists acquisition_click_id uuid references public.conversation_acquisition_clicks(id) on delete set null;

alter table public.revenue_conversion_event_queue drop constraint if exists revenue_conversion_event_queue_event_type_check;
alter table public.revenue_conversion_event_queue add constraint revenue_conversion_event_queue_event_type_check
  check (event_type in ('conversation_started','reply_received','qualified_lead','appointment_booked','appointment_showed','estimate_sent','estimate_accepted','sale_closed','job_completed','payment_collected','high_profit_customer','review_created','repeat_customer','referral_customer'));

-- Only canonical lifecycle events create outbound conversion feedback. This
-- avoids treating an arbitrary UI movement as a conversion while preserving
-- the original Growth attribution and consent state.
create or replace function public.enqueue_growth_conversion_feedback()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  mapped_type text;
  origin public.growth_attribution_touches%rowtype;
  lead_row public.leads%rowtype;
  payload jsonb;
begin
  mapped_type := case
    when new.event_type in ('conversation_started','reply_received','qualified_lead','appointment_booked','appointment_showed','review_created','repeat_customer','referral_customer') then new.event_type
    when new.event_type='estimate_created' and new.outcome='sent_manually' then 'estimate_sent'
    when new.event_type='estimate_created' and new.outcome='approved' then 'estimate_accepted'
    when new.event_type='job_created' and new.outcome='completed' then 'job_completed'
    when new.event_type='revenue_attributed' then 'payment_collected'
    else null
  end;
  if mapped_type is null then return new; end if;

  if new.lead_id is not null then
    select * into lead_row from public.leads where tenant_id=new.tenant_id and id=new.lead_id limit 1;
    select * into origin from public.growth_attribution_touches
      where tenant_id=new.tenant_id and lead_id=new.lead_id order by occurred_at asc limit 1;
  end if;
  payload := coalesce(origin.metadata_json,'{}'::jsonb) || coalesce(new.attribution_json,'{}'::jsonb) || jsonb_build_object(
    'growthEventId',new.id,'conversationId',new.conversation_id,'leadId',new.lead_id,'customerId',new.customer_id,
    'externalId',coalesce(new.lead_id,new.customer_id,new.conversation_id),
    'email',case when lead_row.consent_to_contact then lead_row.email else null end,
    'phone',case when lead_row.consent_to_contact then lead_row.phone else null end,
    'currency','USD',
    'value',coalesce((new.attribution_json->>'wonRevenueCents')::numeric,(new.attribution_json->>'pipelineValueCents')::numeric,0)/100.0
  );
  insert into public.revenue_conversion_event_queue
    (tenant_id,brand_id,event_key,event_type,provider,status,consent_checked,requires_manual_approval,idempotency_key,payload_json)
  values (new.tenant_id,new.brand_id,'growth-event:'||new.id::text,mapped_type,'provider_agnostic','needs_review',
    coalesce(lead_row.consent_to_contact,false),true,'growth-event:'||new.id::text,jsonb_strip_nulls(payload))
  on conflict (tenant_id,provider,idempotency_key) do nothing;
  return new;
exception when invalid_text_representation then
  -- Bad optional monetary metadata must not block the source lifecycle event.
  return new;
end $$;

drop trigger if exists growth_events_conversion_feedback on public.growth_events;
create trigger growth_events_conversion_feedback
after insert on public.growth_events for each row execute function public.enqueue_growth_conversion_feedback();

create index if not exists conversation_acquisition_links_tenant_idx on public.conversation_acquisition_links(tenant_id,brand_id,status,created_at desc);
create index if not exists conversation_acquisition_clicks_funnel_idx on public.conversation_acquisition_clicks(tenant_id,link_id,status,clicked_at desc);
create index if not exists conversion_feedback_deliveries_queue_idx on public.conversion_feedback_deliveries(tenant_id,status,next_attempt_at,created_at);

do $$
declare table_name text;
begin
  foreach table_name in array array['conversation_acquisition_links','conversation_acquisition_clicks','conversion_feedback_destinations','conversion_feedback_deliveries']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select t.id,'direct_conversation_acquisition','enabled',null,'monthly',
  '{"category":"Growth","description":"Tracked conversation links, QR acquisition, deterministic Connect attribution and source-to-cash reporting.","approvalMode":"enabled","publicFacing":true}'::jsonb
from public.tenants t where t.status <> 'archived'
on conflict (tenant_id,feature_key) do update set metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,updated_at=now();
