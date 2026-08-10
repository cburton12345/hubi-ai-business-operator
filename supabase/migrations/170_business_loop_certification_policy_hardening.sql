drop policy if exists business_loop_certifications_tenant_operator on public.business_loop_certifications;
drop policy if exists business_loop_certifications_tenant_admin_insert on public.business_loop_certifications;
drop policy if exists business_loop_certifications_tenant_admin_update on public.business_loop_certifications;
drop policy if exists business_loop_certifications_tenant_admin_delete on public.business_loop_certifications;

create policy business_loop_certifications_tenant_operator on public.business_loop_certifications
for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

create policy business_loop_certifications_tenant_admin_insert on public.business_loop_certifications
for insert with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy business_loop_certifications_tenant_admin_update on public.business_loop_certifications
for update
using (public.has_tenant_role(tenant_id, array['owner','admin']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy business_loop_certifications_tenant_admin_delete on public.business_loop_certifications
for delete
using (public.has_tenant_role(tenant_id, array['owner','admin']));
