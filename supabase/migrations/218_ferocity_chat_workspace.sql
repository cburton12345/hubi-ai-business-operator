create table if not exists public.ferocity_chat_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_user_id uuid references public.users(id) on delete set null,
  title text not null default 'New conversation',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ferocity_chat_threads_tenant_updated
  on public.ferocity_chat_threads(tenant_id, updated_at desc);

create table if not exists public.ferocity_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  thread_id uuid not null references public.ferocity_chat_threads(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  role text not null check (role in ('owner', 'ferocity', 'system')),
  body text not null,
  command_run_id uuid references public.ai_command_runs(id) on delete set null,
  status text not null default 'completed' check (status in ('completed', 'needs_input', 'needs_attention', 'failed')),
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ferocity_chat_messages_thread_created
  on public.ferocity_chat_messages(thread_id, created_at asc);

alter table public.ferocity_chat_threads enable row level security;
alter table public.ferocity_chat_messages enable row level security;

drop policy if exists ferocity_chat_threads_tenant_access on public.ferocity_chat_threads;
create policy ferocity_chat_threads_tenant_access
on public.ferocity_chat_threads for all
using (public.has_tenant_access(tenant_id))
with check (public.has_tenant_access(tenant_id));
drop policy if exists ferocity_chat_messages_tenant_access on public.ferocity_chat_messages;
create policy ferocity_chat_messages_tenant_access
on public.ferocity_chat_messages for all
using (public.has_tenant_access(tenant_id))
with check (public.has_tenant_access(tenant_id));
