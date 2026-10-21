alter table public.document_intelligence_import_batches
  drop constraint if exists document_intelligence_import_batches_status_check;
alter table public.document_intelligence_import_batches
  add constraint document_intelligence_import_batches_status_check
  check (status in ('processing','completed','partial','failed','canceled'));

alter table public.document_intelligence_email_jobs
  drop constraint if exists document_intelligence_email_jobs_status_check;
alter table public.document_intelligence_email_jobs
  add constraint document_intelligence_email_jobs_status_check
  check (status in ('pending','processing','completed','failed','canceled'));

comment on constraint document_intelligence_import_batches_status_check on public.document_intelligence_import_batches is
  'Canceled batches preserve completed file outcomes and originals while preventing unresolved work from continuing.';
