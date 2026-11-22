-- Additive review-only insurance analysis. H4R remains authoritative and a
-- human must verify every insurance record in H4R.
alter table public.document_intelligence_documents drop constraint if exists document_intelligence_documents_document_type_check;
alter table public.document_intelligence_documents add constraint document_intelligence_documents_document_type_check
check (document_type in ('receipt','invoice','bill','purchase_order','warranty','credit_memo','statement','lease','contract','form','insurance_policy','other'));

alter table public.document_intelligence_analyses drop constraint if exists document_intelligence_analyses_analysis_type_check;
alter table public.document_intelligence_analyses add constraint document_intelligence_analyses_analysis_type_check
check (analysis_type in ('lease_terms_and_fields','contract_terms','form_fields','insurance_policy_coverage'));

comment on column public.document_intelligence_analyses.analysis_type is
  'Typed review-only analysis. insurance_policy_coverage is advisory and cannot verify H4R coverage.';
