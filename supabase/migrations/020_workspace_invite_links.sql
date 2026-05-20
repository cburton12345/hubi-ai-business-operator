alter table public.workspace_invites
  add column if not exists invite_token_hash text,
  add column if not exists revoked_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_workspace_invites_token_hash
  on public.workspace_invites(invite_token_hash)
  where invite_token_hash is not null;

create unique index if not exists idx_workspace_invites_tenant_email
  on public.workspace_invites(tenant_id, email);
