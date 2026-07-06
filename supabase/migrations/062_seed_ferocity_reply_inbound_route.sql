insert into public.email_inbound_routes (tenant_id, brand_id, address, metadata_json)
select
  b.tenant_id,
  b.id,
  'reply@ferocity.live',
  jsonb_build_object('source', 'ferocity_default_reply_to', 'brandName', b.name)
from public.brands b
where lower(b.name) = 'ferocity'
order by b.created_at asc
limit 1
on conflict (address) do nothing;
