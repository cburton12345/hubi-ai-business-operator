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
    'traffic_event_logged',
    'worker_profile_created',
    'worker_profile_updated',
    'worker_skill_created',
    'labor_request_created',
    'labor_request_updated',
    'worker_match_suggested',
    'worker_match_status_updated'
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
    'traffic_events',
    'worker_profiles',
    'worker_skills',
    'labor_requests',
    'worker_matches'
  ));

update public.provider_setup_steps
set plain_language_goal = 'Connect MarketplacePro marketplace and matcher tables through an adapter while Ferocity remains the operations, scheduling, timekeeping, payroll, and owner-command engine.',
    metadata_json = metadata_json || '{
      "adapterTables":[
        "posts",
        "offers",
        "labor_pool",
        "saved_providers",
        "worker_contact_requests",
        "follows",
        "notifications",
        "support_requests",
        "payments",
        "traffic_events",
        "worker_profiles",
        "worker_skills",
        "labor_requests",
        "worker_matches"
      ],
      "matcherBoundary":"MarketplacePro owns public network and matching intake; Ferocity owns operations workforce, scheduling, timekeeping, payroll, billing, and owner command."
    }'::jsonb,
    updated_at = now()
where provider_key = 'marketplacepro';

update public.owner_platform_connections
set event_scope = array(
      select distinct unnest(coalesce(event_scope, '{}'::text[]) || array['matcher_requests','worker_profiles','worker_matches','labor_fulfillment'])
    ),
    notes = 'Public marketplace, worker network, and Matcher intake. Ferocity remains operations/workforce engine for scheduling, timekeeping, payroll, billing, and owner command.',
    metadata_json = metadata_json || '{"matcherAdapter":true,"operationsBoundary":"Ferocity owns fulfillment operations after MarketplacePro match/intake."}'::jsonb,
    updated_at = now()
where tenant_id = '11111111-1111-4111-8111-111111111111'
  and platform_key = 'marketplacepro';
