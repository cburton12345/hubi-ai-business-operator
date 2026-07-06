alter table public.marketplacepro_sync_events
  drop constraint if exists marketplacepro_sync_events_event_type_check;

alter table public.marketplacepro_sync_events
  add constraint marketplacepro_sync_events_event_type_check
  check (event_type in (
    'connection_check',
    'lead_import',
    'status_update',
    'message',
    'quote_request',
    'estimate_request',
    'review',
    'profile_publish',
    'sync_error',
    'post_created',
    'post_updated',
    'offer_submitted',
    'labor_pool_submitted',
    'saved_provider_created',
    'worker_contact_request_submitted',
    'follow_created',
    'notification_logged',
    'support_request_created',
    'payment_completed',
    'payment_failed',
    'checkout_session_completed',
    'checkout_session_failed',
    'traffic_event_logged'
  ));

alter table public.marketplacepro_object_links
  drop constraint if exists marketplacepro_object_links_marketplace_table_check;

alter table public.marketplacepro_object_links
  add constraint marketplacepro_object_links_marketplace_table_check
  check (marketplace_table in (
    'posts',
    'offers',
    'labor_pool',
    'saved_providers',
    'worker_contact_requests',
    'follows',
    'notifications',
    'support_requests',
    'payments',
    'traffic_events'
  ));

update public.provider_setup_steps
set plain_language_goal = 'Connect MarketplacePro launch tables through an adapter: posts, offers, labor_pool, saved_providers, worker_contact_requests, follows, notifications, support_requests, payments, and traffic_events.',
    metadata_json = metadata_json || '{"adapterTables":["posts","offers","labor_pool","saved_providers","worker_contact_requests","follows","notifications","support_requests","payments","traffic_events"]}'::jsonb,
    updated_at = now()
where provider_key = 'marketplacepro';
