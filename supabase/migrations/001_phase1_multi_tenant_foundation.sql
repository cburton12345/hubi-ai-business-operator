create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  name text,
  platform_role text not null default 'user'
    check (platform_role in ('super_admin', 'support', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  account_type text not null default 'customer'
    check (account_type in ('internal', 'customer', 'agency', 'partner')),
  status text not null default 'active'
    check (status in ('active', 'trial', 'suspended', 'archived')),
  billing_status text not null default 'none'
    check (billing_status in ('none', 'trialing', 'active', 'past_due', 'cancelled')),
  plan_key text,
  owner_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'operator', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  domain text,
  phone text,
  email text,
  logo_url text,
  business_model text not null
    check (business_model in ('local_service', 'rental', 'software', 'marketplace', 'lead_generation')),
  industry text,
  vertical text,
  description text,
  primary_goal text,
  primary_location text,
  risk_profile text not null default 'normal'
    check (risk_profile in ('normal', 'regulated', 'legal_sensitive')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.brand_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  unique (brand_id, user_id)
);

create table if not exists public.brand_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists public.brand_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  city text,
  state text,
  service_area_name text,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_marketing_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  target_customers text,
  cta_goals text,
  ad_goals text,
  seo_targets text,
  review_strategy text,
  follow_up_strategy text,
  tone_of_voice text,
  approval_mode text not null default 'manual'
    check (approval_mode in ('manual', 'low_risk_auto', 'recommend_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  slug text not null,
  public_key text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  form_id uuid references public.forms(id) on delete set null,
  source text,
  source_detail text,
  name text,
  email text,
  phone text,
  message text,
  lead_type text not null default 'general'
    check (lead_type in ('general', 'appointment', 'quote', 'demo', 'buyer', 'seller', 'rental_request', 'case_intake')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'spam')),
  qualification_status text not null default 'unqualified'
    check (qualification_status in ('unqualified', 'qualified', 'disqualified', 'needs_review')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  lead_score integer,
  consent_to_contact boolean not null default false,
  assigned_to_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local_service_lead_details (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  service_interest text,
  location text,
  appointment_window text,
  urgency text
);

create table if not exists public.rental_lead_details (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  rental_item_type text,
  rental_start_date date,
  rental_end_date date,
  delivery_needed boolean,
  location text
);

create table if not exists public.software_lead_details (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  company_name text,
  role text,
  current_system text,
  units_managed integer,
  demo_requested boolean
);

create table if not exists public.marketplace_lead_details (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  intent text check (intent in ('buyer', 'seller', 'bidder', 'consignor')),
  asset_category text,
  estimated_value numeric(12,2),
  location text
);

create table if not exists public.legal_lead_details (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_type text,
  incident_date date,
  state text,
  injury_type text,
  has_attorney boolean,
  treatment_received boolean,
  legal_disclaimer_acknowledged boolean not null default false
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null
    check (type in ('note', 'status_change', 'call', 'email', 'text', 'form_submission', 'assignment', 'qualification')),
  body text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  form_id uuid references public.forms(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null
    check (type in ('seo_recommendation', 'content_draft', 'campaign_recommendation', 'lead_followup', 'weekly_plan')),
  title text not null,
  prompt_context_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  priority integer not null default 0,
  created_by text not null default 'system'
    check (created_by in ('system', 'user', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  ai_task_id uuid references public.ai_tasks(id) on delete set null,
  content_type text not null
    check (content_type in ('blog', 'facebook_post', 'gbp_post', 'landing_page', 'city_page', 'service_page', 'google_ad', 'facebook_ad', 'email', 'sms')),
  title text,
  body text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'rejected', 'published', 'archived')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  category text not null
    check (category in ('seo', 'ads', 'content', 'lead_management', 'operations')),
  title text not null,
  summary text,
  rationale text,
  suggested_action text,
  impact_estimate text check (impact_estimate in ('low', 'medium', 'high')),
  effort_estimate text check (effort_estimate in ('low', 'medium', 'high')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'approved', 'rejected', 'completed', 'archived')),
  created_by text not null default 'ai'
    check (created_by in ('ai', 'user', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  target_type text not null
    check (target_type in ('ai_draft', 'recommendation', 'campaign_change', 'page_change')),
  target_id uuid not null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  actor_type text not null
    check (actor_type in ('user', 'ai', 'system')),
  action text not null,
  target_type text,
  target_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_users_tenant on public.tenant_users(tenant_id);
create index if not exists idx_tenant_users_user on public.tenant_users(user_id);
create index if not exists idx_brands_tenant on public.brands(tenant_id);
create index if not exists idx_leads_tenant_brand_created on public.leads(tenant_id, brand_id, created_at desc);
create index if not exists idx_leads_status on public.leads(tenant_id, brand_id, status);
create index if not exists idx_lead_events_lead_created on public.lead_events(lead_id, created_at desc);
create index if not exists idx_ai_tasks_status on public.ai_tasks(tenant_id, brand_id, status);
create index if not exists idx_ai_drafts_status on public.ai_drafts(tenant_id, brand_id, status);
create index if not exists idx_recommendations_status on public.recommendations(tenant_id, brand_id, status);
create index if not exists idx_approvals_status on public.approvals(tenant_id, brand_id, status);
create index if not exists idx_activity_logs_tenant_created on public.activity_logs(tenant_id, created_at desc);

alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.brands enable row level security;
alter table public.brand_users enable row level security;
alter table public.brand_services enable row level security;
alter table public.brand_locations enable row level security;
alter table public.brand_offers enable row level security;
alter table public.brand_marketing_settings enable row level security;
alter table public.forms enable row level security;
alter table public.leads enable row level security;
alter table public.local_service_lead_details enable row level security;
alter table public.rental_lead_details enable row level security;
alter table public.software_lead_details enable row level security;
alter table public.marketplace_lead_details enable row level security;
alter table public.legal_lead_details enable row level security;
alter table public.lead_events enable row level security;
alter table public.form_submissions enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.recommendations enable row level security;
alter table public.approvals enable row level security;
alter table public.activity_logs enable row level security;
