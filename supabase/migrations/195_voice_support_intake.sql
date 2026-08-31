-- Extend the canonical support queue for signed AI voice intake. Voice support
-- creates the same trackable case as the public and authenticated forms.

alter table public.support_issue_queue drop constraint if exists support_issue_queue_source_check;
alter table public.support_issue_queue add constraint support_issue_queue_source_check
  check (source in (
    'public_form', 'proof_page', 'customer_portal', 'integration', 'marketplacepro',
    'internal', 'voice_agent', 'other'
  ));

create index if not exists support_issue_queue_requester_phone_idx
  on public.support_issue_queue (requester_phone, created_at desc)
  where requester_phone is not null;

comment on column public.support_issue_queue.source is
  'Canonical intake channel, including signed voice-agent intake; it does not imply caller identity was verified.';
