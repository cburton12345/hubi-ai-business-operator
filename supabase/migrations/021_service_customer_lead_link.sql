create unique index if not exists idx_customers_source_lead_once
  on public.customers(tenant_id, source_lead_id)
  where source_lead_id is not null;
