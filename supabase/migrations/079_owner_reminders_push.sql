create table if not exists public.owner_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  title text not null,
  body text,
  reminder_type text not null default 'task'
    check (reminder_type in ('meeting', 'goal', 'task', 'follow_up', 'payment', 'personal', 'custom')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  remind_at timestamptz not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly')),
  push_enabled boolean not null default true,
  action_url text not null default '/app/attention-command',
  last_sent_at timestamptz,
  next_due_at timestamptz not null,
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_owner_reminders_due
  on public.owner_reminders(tenant_id, status, push_enabled, next_due_at);

create index if not exists idx_owner_reminders_user
  on public.owner_reminders(tenant_id, user_id, status, next_due_at);

alter table public.owner_reminders enable row level security;

drop policy if exists owner_reminders_tenant_access on public.owner_reminders;
create policy owner_reminders_tenant_access
on public.owner_reminders
for all
using (
  exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = owner_reminders.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = owner_reminders.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
);

create or replace function public.set_owner_reminders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_reminders_touch_updated_at on public.owner_reminders;
create trigger owner_reminders_touch_updated_at
before update on public.owner_reminders
for each row
execute function public.set_owner_reminders_updated_at();
