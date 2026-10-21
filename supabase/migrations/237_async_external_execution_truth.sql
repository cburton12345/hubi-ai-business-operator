alter table public.outbound_action_queue
  drop constraint if exists outbound_action_queue_status_check;

alter table public.outbound_action_queue
  add constraint outbound_action_queue_status_check
  check (status in (
    'draft',
    'needs_review',
    'approved',
    'queued',
    'provider_queued',
    'sent_manually',
    'sent',
    'failed',
    'canceled',
    'blocked'
  ));

comment on column public.outbound_action_queue.status is
  'provider_queued means an asynchronous provider accepted the action but has not yet confirmed execution. sent requires provider execution evidence.';
