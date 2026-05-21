create table if not exists public.lead_routing_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  routing_type text not null default 'legal_buyer_review'
    check (routing_type in ('legal_buyer_review', 'marketplace_buyer_review', 'partner_review')),
  status text not null default 'needs_approval'
    check (status in ('needs_approval', 'approved_for_manual_routing', 'rejected', 'routed_manually')),
  suggested_buyer_profile text,
  routing_notes text,
  approval_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, lead_id, routing_type)
);

create index if not exists idx_lead_routing_reviews_tenant_status
  on public.lead_routing_reviews(tenant_id, status, created_at desc);

alter table public.lead_routing_reviews enable row level security;

drop policy if exists lead_routing_reviews_tenant_operator on public.lead_routing_reviews;
create policy lead_routing_reviews_tenant_operator
on public.lead_routing_reviews
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
