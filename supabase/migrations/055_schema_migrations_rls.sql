alter table public.schema_migrations enable row level security;

revoke all on table public.schema_migrations from anon;
revoke all on table public.schema_migrations from authenticated;

drop policy if exists schema_migrations_no_public_access on public.schema_migrations;
create policy schema_migrations_no_public_access
on public.schema_migrations
for all
using (false)
with check (false);
