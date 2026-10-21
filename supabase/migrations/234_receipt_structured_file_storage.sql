-- Structured statements and spreadsheets use the same private, tenant-scoped source
-- evidence bucket as receipt images. Keep the allowlist explicit so broad binary
-- uploads remain rejected while common browser/provider MIME variations are stable.
update storage.buckets
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'application/pdf',
      'text/csv',
      'text/tab-separated-values',
      'text/plain',
      'application/xml',
      'application/x-ofx',
      'application/vnd.intu.qfx',
      'application/vnd.intu.qbo',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'receipt-expense-assets';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'receipt-expense-assets') then
    raise exception 'receipt-expense-assets bucket must exist before enabling structured financial uploads';
  end if;
end $$;
