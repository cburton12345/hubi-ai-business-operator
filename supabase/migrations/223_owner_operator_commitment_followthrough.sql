-- Shared owner/operator primitive: durable commitments with follow-through and evidence.
-- This extends the existing action, timeline, and Owner Command systems rather than
-- introducing a parallel task manager.

create table if not exists public.operating_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  commitment_key text not null,
  description text not null,
  status text not null default 'active'
    check (status in ('needs_confirmation','active','due_soon','overdue','completed','verified','canceled','blocked')),
  importance text not null default 'normal'
    check (importance in ('low','normal','high','critical')),
  responsible_type text not null default 'unassigned'
    check (responsible_type in ('user','employee','vendor','customer','ai','ferocity','unassigned')),
  responsible_id uuid,
  responsible_label text,
  recipient_type text,
  recipient_id uuid,
  recipient_label text,
  due_at timestamptz,
  related_entity_type text,
  related_entity_id uuid,
  source_type text not null,
  source_table text,
  source_id uuid,
  source_reference text,
  confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  expected_outcome text,
  completion_evidence_required boolean not null default false,
  completion_evidence_json jsonb not null default '{}'::jsonb,
  escalation_policy_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  canceled_at timestamptz,
  last_followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, commitment_key)
);

create table if not exists public.operating_commitment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_id uuid not null references public.operating_commitments(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text,
  actor_type text not null default 'system',
  actor_id uuid,
  note text,
  evidence_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists operating_commitments_due_idx
  on public.operating_commitments (tenant_id,status,due_at)
  where status in ('needs_confirmation','active','due_soon','overdue','blocked');
create index if not exists operating_commitments_entity_idx
  on public.operating_commitments (tenant_id,related_entity_type,related_entity_id,updated_at desc);
create index if not exists operating_commitment_events_idx
  on public.operating_commitment_events (tenant_id,commitment_id,occurred_at desc);

alter table public.operating_commitments enable row level security;
alter table public.operating_commitment_events enable row level security;

drop policy if exists operating_commitments_tenant_operator on public.operating_commitments;
create policy operating_commitments_tenant_operator on public.operating_commitments
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists operating_commitment_events_tenant_operator on public.operating_commitment_events;
create policy operating_commitment_events_tenant_operator on public.operating_commitment_events
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

insert into public.workspace_feature_entitlements
  (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select tenant.id,'operating_commitments','enabled',null,'monthly',
  '{"category":"Operations","description":"Tracks promises, owners, deadlines, follow-through, and outcome evidence across the business.","approvalMode":"risk_based","plainRule":"Ferocity follows routine commitments and escalates material broken promises instead of treating assignment as completion.","costed":false,"publicFacing":true}'::jsonb
from public.tenants tenant where tenant.status <> 'archived'
on conflict (tenant_id,feature_key) do update set
  metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at=now();
