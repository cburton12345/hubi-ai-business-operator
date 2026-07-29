alter table public.review_first_export_queue
  drop constraint if exists review_first_export_queue_export_type_check;

alter table public.review_first_export_queue
  add constraint review_first_export_queue_export_type_check
  check (
    export_type in (
      'website_page',
      'marketplacepro_profile',
      'gbp_post',
      'review_reply',
      'ad_creative',
      'ad_autopilot_package',
      'video_brief',
      'seo_refresh',
      'email_campaign',
      'sms_campaign',
      'other'
    )
  );

create index if not exists idx_review_first_export_queue_tenant_status
  on public.review_first_export_queue(tenant_id, status, created_at desc);
