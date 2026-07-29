alter table public.follow_up_workflows
  drop constraint if exists follow_up_workflows_workflow_type_check;

alter table public.follow_up_workflows
  add constraint follow_up_workflows_workflow_type_check
  check (workflow_type in (
    'new_lead_response',
    'stale_lead_recovery',
    'estimate_followup',
    'callback',
    'nurture',
    'invoice_followup',
    'missed_call_recovery',
    'database_reactivation',
    'referral_request',
    'customer_lifetime_value'
  ));

create table if not exists public.customer_referral_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  referral_token text not null unique,
  status text not null default 'active'
    check (status in ('active', 'paused', 'expired', 'archived')),
  visits integer not null default 0 check (visits >= 0),
  attributed_leads integer not null default 0 check (attributed_leads >= 0),
  attributed_revenue_cents integer not null default 0 check (attributed_revenue_cents >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id, form_id)
);

create index if not exists customer_referral_links_tenant_idx
  on public.customer_referral_links(tenant_id, status, updated_at desc);
alter table public.customer_referral_links enable row level security;
drop policy if exists customer_referral_links_member on public.customer_referral_links;
create policy customer_referral_links_member
on public.customer_referral_links for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

create table if not exists public.industry_knowledge_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  industry_key text not null,
  name text not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  applicability_json jsonb not null default '{}'::jsonb,
  guardrails_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_key, version)
);

create table if not exists public.industry_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.industry_knowledge_modules(id) on delete cascade,
  item_key text not null,
  category text not null
    check (category in ('intake', 'qualification', 'scheduling', 'estimating', 'operations', 'safety', 'compliance', 'follow_up', 'review', 'referral', 'lifetime_value')),
  title text not null,
  content text not null,
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  requires_verification boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (module_id, item_key)
);

create table if not exists public.tenant_industry_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  module_id uuid not null references public.industry_knowledge_modules(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  overrides_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, module_id)
);

create index if not exists industry_knowledge_modules_industry_idx
  on public.industry_knowledge_modules(industry_key, status, version desc);
create index if not exists industry_knowledge_items_module_idx
  on public.industry_knowledge_items(module_id, category);
create index if not exists tenant_industry_modules_tenant_idx
  on public.tenant_industry_modules(tenant_id, status);

alter table public.industry_knowledge_modules enable row level security;
alter table public.industry_knowledge_items enable row level security;
alter table public.tenant_industry_modules enable row level security;

drop policy if exists industry_knowledge_modules_authenticated_read on public.industry_knowledge_modules;
create policy industry_knowledge_modules_authenticated_read
on public.industry_knowledge_modules for select
using (auth.uid() is not null);

drop policy if exists industry_knowledge_items_authenticated_read on public.industry_knowledge_items;
create policy industry_knowledge_items_authenticated_read
on public.industry_knowledge_items for select
using (auth.uid() is not null);

drop policy if exists tenant_industry_modules_member on public.tenant_industry_modules;
create policy tenant_industry_modules_member
on public.tenant_industry_modules for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.industry_knowledge_modules (
  module_key, industry_key, name, version, status, applicability_json, guardrails_json, metadata_json
)
values (
  'roofing_core',
  'roofing',
  'Roofing business operations',
  1,
  'active',
  '{"aliases":["roofing","roof repair","storm restoration","hail damage","metal roofing","shingle roofing"],"businessModels":["local_service"]}'::jsonb,
  '[
    "Do not claim storm damage, insurance coverage, code compliance, licensing, warranty eligibility, or product suitability without verified evidence.",
    "Emergency leaks, structural concerns, active electrical hazards, injuries, and unsafe access require human escalation.",
    "AI may collect measurements and symptoms, but final scope, pricing, code conclusions, and safety decisions require qualified review."
  ]'::jsonb,
  '{"modular":true,"startingIndustry":"roofing","source":"Ferocity native operating knowledge"}'::jsonb
)
on conflict (module_key, version) do update
set status = excluded.status,
    applicability_json = excluded.applicability_json,
    guardrails_json = excluded.guardrails_json,
    metadata_json = public.industry_knowledge_modules.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.industry_knowledge_items (
  module_id, item_key, category, title, content, risk_level, requires_verification, metadata_json
)
select m.id, item.item_key, item.category, item.title, item.content, item.risk_level, item.requires_verification, '{"seed":"roofing_core_v1"}'::jsonb
from public.industry_knowledge_modules m
cross join (values
  ('intake_problem', 'intake', 'Roofing intake essentials', 'Collect property location, roof type if known, age if known, leak or damage symptoms, when the issue started, urgency, safe-access limitations, and the best contact method.', 'low', false),
  ('qualification_urgency', 'qualification', 'Roofing urgency signals', 'Active leaks, interior water intrusion, exposed decking, storm damage, missing material, structural movement, or unsafe conditions deserve faster human review. Never diagnose from a message alone.', 'high', true),
  ('qualification_fit', 'qualification', 'Roofing fit questions', 'Confirm service area, property type, requested service, timing, decision-maker involvement, insurance context without promising coverage, and whether an inspection or estimate is the appropriate next step.', 'medium', false),
  ('scheduling_weather', 'scheduling', 'Weather-aware scheduling', 'Inspection and installation timing may depend on weather, safe access, material availability, permits, and crew capacity. Offer a requested window and make clear the team confirms it.', 'medium', true),
  ('estimate_system', 'estimating', 'Complete roofing system scope', 'A roofing estimate should consider the installed system, including field material, underlayment, ice/water protection where applicable, flashing, ventilation, edges, penetrations, fasteners, waste, tear-off, disposal, access, labor, and code-required components.', 'high', true),
  ('followup_estimate', 'follow_up', 'Roofing estimate follow-up', 'Follow up on open estimates with a useful next step: answer scope questions, explain options without pressure, confirm timing, and offer an inspection or decision call.', 'low', false),
  ('review_timing', 'review', 'Roofing review timing', 'Request a review only after completion or a clearly successful milestone, avoid gating or incentives that distort sentiment, and route service problems to recovery first.', 'medium', false),
  ('referral_timing', 'referral', 'Roofing referral timing', 'Ask satisfied customers for introductions after confirmed completion or positive feedback. Make sharing easy, avoid pressure, and track the referred lead through revenue.', 'low', false),
  ('lifetime_inspection', 'lifetime_value', 'Roof lifecycle outreach', 'Useful lifecycle campaigns include seasonal inspection reminders, post-storm check-ins, maintenance education, warranty-document reminders, gutter or ventilation needs, and reinspection timing based on verified service history.', 'medium', true)
) as item(item_key, category, title, content, risk_level, requires_verification)
where m.module_key = 'roofing_core' and m.version = 1
on conflict (module_id, item_key) do update
set title = excluded.title,
    content = excluded.content,
    risk_level = excluded.risk_level,
    requires_verification = excluded.requires_verification;

insert into public.tenant_industry_modules (tenant_id, brand_id, module_id, status, metadata_json)
select b.tenant_id, b.id, m.id, 'active', '{"assignedBy":"industry_match_seed"}'::jsonb
from public.brands b
join public.industry_knowledge_modules m
  on m.module_key = 'roofing_core' and m.version = 1
where b.status = 'active'
  and (
    lower(coalesce(b.industry, '')) like '%roof%'
    or lower(coalesce(b.vertical, '')) in ('roofing', 'storm_restoration')
  )
on conflict (tenant_id, brand_id, module_id) do nothing;
