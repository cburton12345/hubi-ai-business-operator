create or replace function public.current_app_user_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
      and platform_role in ('super_admin', 'support')
  )
$$;

create or replace function public.has_tenant_access(check_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_users tu
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = check_tenant_id
        and tu.status = 'active'
        and u.auth_user_id = auth.uid()
    )
$$;

create or replace function public.has_tenant_role(check_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_users tu
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = check_tenant_id
        and tu.status = 'active'
        and tu.role = any(allowed_roles)
        and u.auth_user_id = auth.uid()
    )
$$;

drop policy if exists users_read_self_or_platform on public.users;
create policy users_read_self_or_platform
on public.users
for select
using (auth_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists users_update_self_or_platform on public.users;
create policy users_update_self_or_platform
on public.users
for update
using (auth_user_id = auth.uid() or public.is_platform_admin())
with check (auth_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists tenants_read_by_member on public.tenants;
create policy tenants_read_by_member
on public.tenants
for select
using (public.has_tenant_access(id));

drop policy if exists tenants_write_by_owner_admin on public.tenants;
create policy tenants_write_by_owner_admin
on public.tenants
for update
using (public.has_tenant_role(id, array['owner', 'admin']))
with check (public.has_tenant_role(id, array['owner', 'admin']));

drop policy if exists tenant_users_read_by_member on public.tenant_users;
create policy tenant_users_read_by_member
on public.tenant_users
for select
using (public.has_tenant_access(tenant_id));

drop policy if exists tenant_users_write_by_owner_admin on public.tenant_users;
create policy tenant_users_write_by_owner_admin
on public.tenant_users
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists brands_read_by_tenant_member on public.brands;
create policy brands_read_by_tenant_member
on public.brands
for select
using (public.has_tenant_access(tenant_id));

drop policy if exists brands_write_by_tenant_operator on public.brands;
create policy brands_write_by_tenant_operator
on public.brands
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brand_users',
    'brand_services',
    'brand_locations',
    'brand_offers',
    'brand_marketing_settings',
    'forms',
    'leads',
    'local_service_lead_details',
    'rental_lead_details',
    'software_lead_details',
    'marketplace_lead_details',
    'legal_lead_details',
    'lead_events',
    'form_submissions',
    'ai_tasks',
    'ai_drafts',
    'recommendations',
    'approvals',
    'activity_logs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read_by_tenant_member', table_name);
    execute format(
      'create policy %I on public.%I for select using (public.has_tenant_access(tenant_id))',
      table_name || '_read_by_tenant_member',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_write_by_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_write_by_tenant_operator',
      table_name
    );
  end loop;
end $$;
