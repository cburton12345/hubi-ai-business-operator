insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-expense-assets',
  'receipt-expense-assets',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if to_regclass('public.feature_entitlements') is not null then
    insert into public.feature_entitlements (feature_key, feature_name, description, tier, status, metadata_json)
    values (
      'receipt_photo_draft',
      'Receipt photo drafts',
      'Let field workers snap receipt proof and let Ferocity draft expense details for owner review.',
      'operations',
      'enabled',
      '{"ownerVisible": true, "employeeVisible": true, "reviewRequired": true, "storageBucket": "receipt-expense-assets"}'::jsonb
    )
    on conflict (feature_key) do update set
      feature_name = excluded.feature_name,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      metadata_json = public.feature_entitlements.metadata_json || excluded.metadata_json;
  end if;
end $$;
