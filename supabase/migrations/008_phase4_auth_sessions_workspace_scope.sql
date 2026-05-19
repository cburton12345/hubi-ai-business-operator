create table if not exists public.user_password_credentials (
  user_id uuid primary key references public.users(id) on delete cascade,
  password_hash text not null,
  password_salt text not null,
  password_iterations integer not null default 120000,
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_token_hash text not null unique,
  selected_tenant_id uuid references public.tenants(id) on delete set null,
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'operator', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id uuid references public.users(id) on delete set null,
  accepted_user_id uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists idx_app_sessions_user_active
  on public.app_sessions(user_id, expires_at)
  where revoked_at is null;

create index if not exists idx_workspace_invites_tenant_status
  on public.workspace_invites(tenant_id, status, created_at desc);

alter table public.user_password_credentials enable row level security;
alter table public.app_sessions enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists user_password_credentials_platform_only on public.user_password_credentials;
create policy user_password_credentials_platform_only
on public.user_password_credentials
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists app_sessions_owner_or_platform on public.app_sessions;
create policy app_sessions_owner_or_platform
on public.app_sessions
for all
using (
  public.is_platform_admin()
  or user_id = public.current_app_user_id()
)
with check (
  public.is_platform_admin()
  or user_id = public.current_app_user_id()
);

drop policy if exists workspace_invites_read_by_tenant_member on public.workspace_invites;
create policy workspace_invites_read_by_tenant_member
on public.workspace_invites
for select
using (public.has_tenant_access(tenant_id));

drop policy if exists workspace_invites_write_by_tenant_admin on public.workspace_invites;
create policy workspace_invites_write_by_tenant_admin
on public.workspace_invites
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
