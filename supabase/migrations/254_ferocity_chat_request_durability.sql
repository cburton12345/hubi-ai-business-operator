-- Persist each Ask Ferocity request/result pair exactly once across retries.
create unique index if not exists ferocity_chat_messages_client_request_role_idx
  on public.ferocity_chat_messages (
    tenant_id,
    thread_id,
    role,
    (detail_json->>'clientRequestId')
  )
  where nullif(detail_json->>'clientRequestId','') is not null;

comment on index public.ferocity_chat_messages_client_request_role_idx is
  'Makes owner request and Ferocity response persistence idempotent per client submission and role.';
