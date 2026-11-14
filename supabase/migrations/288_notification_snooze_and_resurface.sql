alter table public.in_app_notification_states
  add column if not exists snoozed_until timestamptz,
  add column if not exists cleared_at timestamptz,
  add column if not exists resurface_reason text,
  add column if not exists resurface_count integer not null default 0,
  add column if not exists last_resurfaced_at timestamptz;

alter table public.in_app_notification_states
  drop constraint if exists in_app_notification_states_status_check;
alter table public.in_app_notification_states
  add constraint in_app_notification_states_status_check
  check (status in ('unread','read','acknowledged','snoozed','cleared','dismissed'));

alter table public.in_app_notification_states
  drop constraint if exists in_app_notification_states_snooze_check;
alter table public.in_app_notification_states
  add constraint in_app_notification_states_snooze_check
  check ((status = 'snoozed' and snoozed_until is not null) or status <> 'snoozed');

create index if not exists in_app_notification_states_resurface_idx
  on public.in_app_notification_states (tenant_id, user_id, snoozed_until)
  where status = 'snoozed';

comment on column public.in_app_notification_states.snoozed_until is
  'When the item must automatically return to the active notification feed.';
comment on column public.in_app_notification_states.cleared_at is
  'Soft-clear timestamp. The state row remains as audit evidence; source records are never deleted.';

