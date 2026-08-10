-- A Retell function can be interrupted after it reaches Ferocity. Keep the
-- callback side effect idempotent even if Retell or an operator repeats it.
create unique index if not exists idx_operator_schedule_events_retell_callback
  on public.operator_schedule_events (
    tenant_id,
    (metadata_json->>'providerCallId')
  )
  where event_type = 'callback'
    and metadata_json->>'source' = 'retell_sales_callback_tool';
