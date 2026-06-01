create table if not exists public.tenant_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  credential_label text not null,
  credential_kind text not null default 'api_key'
    check (credential_kind in ('api_key', 'oauth_client_secret', 'webhook_secret', 'account_sid', 'auth_token', 'refresh_token', 'other')),
  status text not null default 'configured'
    check (status in ('configured', 'needs_encryption_key', 'rotated', 'revoked', 'archived')),
  secret_preview text,
  secret_fingerprint text,
  encrypted_secret text,
  encryption_iv text,
  encryption_tag text,
  encryption_version text not null default 'aes-256-gcm:v1',
  last_verified_at timestamptz,
  rotation_due_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, credential_label)
);

create index if not exists idx_tenant_provider_credentials_tenant
  on public.tenant_provider_credentials(tenant_id, provider_key, status, updated_at desc);

alter table public.tenant_provider_credentials enable row level security;

drop policy if exists tenant_provider_credentials_tenant_admin on public.tenant_provider_credentials;
create policy tenant_provider_credentials_tenant_admin
on public.tenant_provider_credentials
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'byo_credential_vault',
  'limited',
  50,
  'monthly',
  '{"category":"Integrations","description":"Encrypted tenant-owned provider credentials for BYO tools","approvalMode":"review_required","plainRule":"Store tenant-owned secrets only when encryption is configured. Never show secrets back.","costed":false,"publicFacing":false}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('growth', 'byo_credential_vault', 'Bring Your Own Provider Keys', true, 'Encrypted credential records, live actions still reviewed', 245, '{"serviceControl":true}'::jsonb),
  ('operator', 'byo_credential_vault', 'Bring Your Own Provider Keys', true, 'Expanded encrypted credential records and rotation tracking', 245, '{"serviceControl":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
