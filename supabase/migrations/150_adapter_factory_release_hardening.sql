drop policy if exists provider_adapter_builds_tenant_update on public.provider_adapter_builds;

revoke insert, update, delete on table public.provider_adapter_builds from anon, authenticated;
revoke insert, update, delete on table public.provider_adapter_build_events from anon, authenticated;

comment on table public.provider_adapter_builds is
  'Tenant-readable adapter factory state. All writes use guarded server or platform-admin paths; customer database roles cannot release adapters.';

comment on column public.provider_adapter_builds.status is
  'Customer review may advance a draft to engineering. Only the guarded platform release path may set released.';
