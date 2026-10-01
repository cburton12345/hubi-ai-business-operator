-- Standard Ferocity Earn keeps provider costs separate. Sponsorship is an
-- explicit, tenant-specific pilot exception and is never inferred from the
-- Earn plan itself.

update public.billing_plans
set metadata_json = metadata_json || '{
  "providerUsageSeparate": true,
  "tenantPilotSponsorshipSupported": true,
  "providerUsageSponsoredByDefault": false
}'::jsonb
where plan_key = 'earn';

create table if not exists public.earn_provider_sponsorships (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  status text not null default 'approved'
    check (status in ('approved','active','paused','expired','revoked')),
  monthly_provider_cost_cap_cents integer not null
    check (monthly_provider_cost_cap_cents > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  approved_by_user_id uuid references public.users(id) on delete set null,
  reason text not null,
  written_terms text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_earn_provider_sponsorships_status
  on public.earn_provider_sponsorships(status, ends_at);

alter table public.earn_provider_sponsorships enable row level security;

create policy earn_provider_sponsorships_members_read
  on public.earn_provider_sponsorships for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));

create policy earn_provider_sponsorships_platform_admin
  on public.earn_provider_sponsorships for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

comment on table public.earn_provider_sponsorships is
  'Written, tenant-specific Ferocity-funded provider-cost exceptions. No row means provider usage remains customer-paid under standard Earn terms.';

-- Preserve any founder-approved pilot created before this migration reached
-- production. Merely choosing Earn never sets this metadata, so this remains
-- an explicit named-workspace exception.
insert into public.earn_provider_sponsorships (
  tenant_id,status,monthly_provider_cost_cap_cents,reason,written_terms,metadata_json
)
select
  ee.tenant_id,
  'active',
  greatest(1,coalesce((ee.metadata_json->>'sponsorshipCapCents')::integer,5000)),
  coalesce(nullif(ee.metadata_json->>'sponsorshipReason',''),'Founder-approved customer pilot exception.'),
  coalesce(nullif(ee.metadata_json->>'sponsorshipWrittenTerms',''),'Ferocity covers approved provider usage for this named pilot workspace subject to its recorded monthly cap; other third-party costs remain separate.'),
  jsonb_build_object('backfilledFromEarnEnrollment',true,'backfilledAt',now())
from public.earn_enrollments ee
where coalesce((ee.metadata_json->>'providerUsageSponsored')::boolean,false)=true
on conflict (tenant_id) do nothing;

-- Standard Earn has no bundled managed-voice allowance. Its disclosed usage
-- price remains customer-paid unless the workspace has an active sponsorship.
insert into public.usage_allowance_policies (
  tenant_id,plan_key,feature_key,unit_type,included_quantity,soft_limit_quantity,
  hard_limit_quantity,overage_mode,overage_unit_price_cents,status,metadata_json
)
select
  null,'earn','ai_receptionist','minute',0,null,null,'notify_then_bill',25,'active',
  '{
    "disclosedOverage": true,
    "autoBillDisclosedOverage": true,
    "providerCostCeilingCentsPerMinute": 35,
    "tenantPilotSponsorshipMayOverride": true
  }'::jsonb
where not exists (
  select 1 from public.usage_allowance_policies
  where tenant_id is null and plan_key='earn'
    and feature_key='ai_receptionist' and unit_type='minute'
);

update public.usage_allowance_policies
set included_quantity=0,
    overage_mode='notify_then_bill',
    overage_unit_price_cents=25,
    status='active',
    metadata_json=metadata_json || '{
      "disclosedOverage": true,
      "autoBillDisclosedOverage": true,
      "providerCostCeilingCentsPerMinute": 35,
      "tenantPilotSponsorshipMayOverride": true
    }'::jsonb,
    updated_at=now()
where tenant_id is null and plan_key='earn'
  and feature_key='ai_receptionist' and unit_type='minute';
