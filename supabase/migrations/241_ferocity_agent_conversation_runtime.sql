-- Durable, tenant-isolated memory and action receipts for Ask Ferocity.
-- This does not grant new provider permissions or bypass approvals.

create table if not exists public.ferocity_conversation_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_user_key text not null default 'workspace',
  scope text not null default 'workspace' check (scope in ('workspace','user')),
  memory_kind text not null check (memory_kind in ('business_fact','preference','constraint','person','workflow')),
  memory_key text not null,
  value_text text not null,
  confidence numeric(5,4) not null default 1 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active','forgotten')),
  source_thread_id uuid references public.ferocity_chat_threads(id) on delete set null,
  source_message_excerpt text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  forgotten_at timestamptz,
  unique (tenant_id,subject_user_key,memory_key)
);

create index if not exists ferocity_conversation_memories_active_idx
  on public.ferocity_conversation_memories(tenant_id,subject_user_key,updated_at desc)
  where status='active';

create table if not exists public.ferocity_chat_action_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  thread_id uuid references public.ferocity_chat_threads(id) on delete set null,
  command_run_id uuid references public.ai_command_runs(id) on delete set null,
  operating_goal_id uuid references public.operating_goals(id) on delete set null,
  receipt_kind text not null check (receipt_kind in ('inspection','draft','workspace_change','goal','approval','external','result')),
  title text not null,
  summary text not null,
  status text not null check (status in ('prepared','completed','needs_input','needs_approval','blocked','failed')),
  href text,
  target_table text,
  target_id text,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ferocity_chat_action_receipts_thread_idx
  on public.ferocity_chat_action_receipts(tenant_id,thread_id,created_at desc);
create index if not exists ferocity_chat_action_receipts_run_idx
  on public.ferocity_chat_action_receipts(tenant_id,command_run_id,created_at desc);

alter table public.ferocity_conversation_memories enable row level security;
alter table public.ferocity_chat_action_receipts enable row level security;

drop policy if exists ferocity_conversation_memories_tenant_access on public.ferocity_conversation_memories;
create policy ferocity_conversation_memories_tenant_access
on public.ferocity_conversation_memories for select
using (
  public.has_tenant_access(tenant_id)
  and (
    subject_user_key = 'workspace'
    or subject_user_key = 'user:' || auth.uid()::text
  )
);

drop policy if exists ferocity_chat_action_receipts_tenant_access on public.ferocity_chat_action_receipts;
create policy ferocity_chat_action_receipts_tenant_access
on public.ferocity_chat_action_receipts for select
using (public.has_tenant_access(tenant_id));

revoke all on table public.ferocity_conversation_memories from anon, authenticated;
revoke all on table public.ferocity_chat_action_receipts from anon, authenticated;
grant select on table public.ferocity_conversation_memories to authenticated;
grant select on table public.ferocity_chat_action_receipts to authenticated;

comment on table public.ferocity_conversation_memories is
  'Durable owner-approved or high-confidence conversational memory. Credentials, secrets, and payment data are prohibited.';
comment on table public.ferocity_chat_action_receipts is
  'Auditable links from Ask Ferocity turns to goals, records, approvals, and exact result surfaces.';
