-- Keep provider-independent conversation timelines responsive as tenants build
-- message history. These indexes support tenant-safe recent-message reads and
-- per-message delivery receipt history without changing stored data.

create index if not exists messages_conversation_timeline_idx
  on public.messages (tenant_id, conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists message_delivery_events_message_receipt_idx
  on public.message_delivery_events (tenant_id, message_id, receipt_at desc)
  where message_id is not null;

comment on index public.messages_conversation_timeline_idx is
  'Supports bounded, tenant-scoped customer conversation timeline reads.';

comment on index public.message_delivery_events_message_receipt_idx is
  'Supports bounded, tenant-scoped delivery history reads for an individual message.';
