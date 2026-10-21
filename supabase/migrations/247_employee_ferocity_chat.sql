-- Worker-scoped Ferocity conversation over the existing field-operation records.
-- Canonical work data remains unchanged; language is a presentation attribute.

alter table public.ferocity_chat_threads
  add column if not exists audience text not null default 'owner'
    check (audience in ('owner','employee')),
  add column if not exists worker_id uuid references public.operations_workers(id) on delete cascade,
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en','es'));

alter table public.ferocity_chat_threads
  drop constraint if exists ferocity_chat_threads_employee_scope_check;
alter table public.ferocity_chat_threads
  add constraint ferocity_chat_threads_employee_scope_check
  check ((audience='owner' and worker_id is null) or (audience='employee' and worker_id is not null));

alter table public.ferocity_chat_messages
  drop constraint if exists ferocity_chat_messages_role_check;
alter table public.ferocity_chat_messages
  add constraint ferocity_chat_messages_role_check
  check (role in ('owner','employee','ferocity','system'));
alter table public.ferocity_chat_messages
  add column if not exists original_language text
    check (original_language is null or original_language in ('en','es'));

create index if not exists ferocity_chat_threads_employee_idx
  on public.ferocity_chat_threads(tenant_id,worker_id,status,updated_at desc)
  where audience='employee';

drop policy if exists ferocity_chat_threads_tenant_access on public.ferocity_chat_threads;
drop policy if exists ferocity_chat_threads_operator_access on public.ferocity_chat_threads;
create policy ferocity_chat_threads_operator_access on public.ferocity_chat_threads
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists ferocity_chat_threads_employee_select on public.ferocity_chat_threads;
create policy ferocity_chat_threads_employee_select on public.ferocity_chat_threads
for select using (
  audience='employee'
  and created_by_user_id=public.current_app_user_id()
  and exists (
    select 1 from public.operations_workers worker
    where worker.id=ferocity_chat_threads.worker_id
      and worker.tenant_id=ferocity_chat_threads.tenant_id
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
);

drop policy if exists ferocity_chat_threads_employee_insert on public.ferocity_chat_threads;
create policy ferocity_chat_threads_employee_insert on public.ferocity_chat_threads
for insert with check (
  audience='employee'
  and created_by_user_id=public.current_app_user_id()
  and exists (
    select 1 from public.operations_workers worker
    where worker.id=ferocity_chat_threads.worker_id
      and worker.tenant_id=ferocity_chat_threads.tenant_id
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
);

drop policy if exists ferocity_chat_threads_employee_update on public.ferocity_chat_threads;
create policy ferocity_chat_threads_employee_update on public.ferocity_chat_threads
for update using (
  audience='employee' and created_by_user_id=public.current_app_user_id()
  and exists (
    select 1 from public.operations_workers worker
    where worker.id=ferocity_chat_threads.worker_id
      and worker.tenant_id=ferocity_chat_threads.tenant_id
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
) with check (
  audience='employee' and created_by_user_id=public.current_app_user_id()
  and exists (
    select 1 from public.operations_workers worker
    where worker.id=ferocity_chat_threads.worker_id
      and worker.tenant_id=ferocity_chat_threads.tenant_id
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
);

drop policy if exists ferocity_chat_messages_tenant_access on public.ferocity_chat_messages;
drop policy if exists ferocity_chat_messages_operator_access on public.ferocity_chat_messages;
create policy ferocity_chat_messages_operator_access on public.ferocity_chat_messages
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists ferocity_chat_messages_employee_select on public.ferocity_chat_messages;
create policy ferocity_chat_messages_employee_select on public.ferocity_chat_messages
for select using (
  exists (
    select 1 from public.ferocity_chat_threads thread
    join public.operations_workers worker
      on worker.id=thread.worker_id and worker.tenant_id=thread.tenant_id
    where thread.id=ferocity_chat_messages.thread_id
      and thread.tenant_id=ferocity_chat_messages.tenant_id
      and thread.audience='employee'
      and thread.created_by_user_id=public.current_app_user_id()
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
);

drop policy if exists ferocity_chat_messages_employee_insert on public.ferocity_chat_messages;
create policy ferocity_chat_messages_employee_insert on public.ferocity_chat_messages
for insert with check (
  role='employee' and user_id=public.current_app_user_id()
  and exists (
    select 1 from public.ferocity_chat_threads thread
    join public.operations_workers worker
      on worker.id=thread.worker_id and worker.tenant_id=thread.tenant_id
    where thread.id=ferocity_chat_messages.thread_id
      and thread.tenant_id=ferocity_chat_messages.tenant_id
      and thread.audience='employee'
      and thread.created_by_user_id=public.current_app_user_id()
      and worker.user_id=public.current_app_user_id()
      and worker.availability_status <> 'inactive'
  )
);

comment on column public.ferocity_chat_threads.audience is
  'Conversation permission boundary. Employee threads expose only worker-scoped operational context.';
comment on column public.ferocity_chat_messages.original_language is
  'Language of the stored original message. Canonical business records are never translated or duplicated.';
