-- Give every workspace a deterministic receipt-forwarding alias on the already
-- configured Ferocity inbound email domain. The existing signed Resend webhook
-- remains the only public ingestion surface.
insert into public.email_inbound_routes (
  tenant_id, brand_id, address, default_lead_source, metadata_json
)
select
  t.id,
  null,
  lower('receipts+' || t.slug || '@ferocity.live'),
  'expense_document_email',
  jsonb_build_object('source', 'document_intelligence', 'purpose', 'expense_attachments')
from public.tenants t
where t.status <> 'archived'
  and t.slug is not null
  and t.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
on conflict (address) do update set
  default_lead_source = excluded.default_lead_source,
  metadata_json = public.email_inbound_routes.metadata_json || excluded.metadata_json,
  status = 'active',
  updated_at = now();

create or replace function public.ensure_expense_email_intake_route()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is not null and new.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$' then
    insert into public.email_inbound_routes (
      tenant_id, brand_id, address, default_lead_source, metadata_json
    ) values (
      new.id,
      null,
      lower('receipts+' || new.slug || '@ferocity.live'),
      'expense_document_email',
      '{"source":"document_intelligence","purpose":"expense_attachments"}'::jsonb
    )
    on conflict (address) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_expense_email_intake_route_trigger on public.tenants;
create trigger ensure_expense_email_intake_route_trigger
after insert or update of slug on public.tenants
for each row execute function public.ensure_expense_email_intake_route();
