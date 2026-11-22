-- MarketplacePro contractor-network events are recorded in Ferocity's
-- existing operator timeline. Migration 282 admitted the new object/status
-- vocabulary, but the timeline's original family constraint still rejected
-- the additive `workforce` family during the transactional domain apply.

alter table public.operator_timeline_events
  drop constraint if exists operator_timeline_events_event_family_check;

alter table public.operator_timeline_events
  add constraint operator_timeline_events_event_family_check
  check (
    event_family in (
      'lead',
      'marketing',
      'seo',
      'content',
      'review',
      'follow_up',
      'estimate',
      'job',
      'invoice',
      'revenue',
      'ai',
      'billing',
      'system',
      'workforce'
    )
  );
