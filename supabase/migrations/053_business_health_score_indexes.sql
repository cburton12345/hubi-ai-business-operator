create index if not exists idx_website_grader_reports_business_type
  on public.website_grader_reports(lower(coalesce(business_type, '')), created_at desc);

create index if not exists idx_website_grader_reports_business_health_state
  on public.website_grader_reports(lower(coalesce(metadata_json->'operations'->>'state', '')), created_at desc);

create index if not exists idx_website_grader_reports_assessment_type
  on public.website_grader_reports((metadata_json->>'assessmentType'), created_at desc);
