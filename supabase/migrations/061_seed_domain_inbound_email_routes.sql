insert into public.email_inbound_routes (tenant_id, brand_id, address, metadata_json)
select
  b.tenant_id,
  b.id,
  lower('reply@' || regexp_replace(regexp_replace(b.domain, '^https?://', ''), '^www\.', '')),
  jsonb_build_object('source', 'brand_domain_seed', 'brandName', b.name)
from public.brands b
where b.domain is not null
  and btrim(b.domain) <> ''
  and regexp_replace(regexp_replace(b.domain, '^https?://', ''), '^www\.', '') ~ '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
on conflict (address) do nothing;
