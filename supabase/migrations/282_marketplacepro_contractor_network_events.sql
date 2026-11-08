alter table public.marketplacepro_sync_events
  drop constraint if exists marketplacepro_sync_events_event_type_check;

alter table public.marketplacepro_sync_events
  add constraint marketplacepro_sync_events_event_type_check check (event_type in (
    'connection_check','lead_import','status_update','message','quote_request','estimate_request',
    'review','profile_publish','sync_error','post_created','post_updated','offer_submitted',
    'labor_pool_submitted','saved_provider_created','worker_contact_request_submitted','follow_created',
    'notification_logged','support_request_created','payment_completed','payment_failed',
    'checkout_session_completed','checkout_session_failed','traffic_event_logged','opportunity_received',
    'contractor_matches_found','coverage_gap_detected','contractor_confirmed',
    'assignment_status_changed','recruiting_status_changed'
  ));

comment on constraint marketplacepro_sync_events_event_type_check on public.marketplacepro_sync_events is
  'Allows the frozen owner-pilot contract plus non-binding contractor-network status events.';
