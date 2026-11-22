-- Keep the existing MarketplacePro object-link boundary aligned with the
-- contractor-network vocabulary admitted by the signed receiver. This is an
-- additive constraint expansion; existing object links and uniqueness rules
-- remain unchanged.

alter table public.marketplacepro_object_links
  drop constraint if exists marketplacepro_object_links_marketplace_table_check;

alter table public.marketplacepro_object_links
  add constraint marketplacepro_object_links_marketplace_table_check
  check (
    marketplace_table in (
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
      'worker_matches',
      'labor_assignments',
      'contractor_recruiting_leads',
      'coverage_requirements'
    )
  );
