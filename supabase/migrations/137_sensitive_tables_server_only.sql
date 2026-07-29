revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.user_password_credentials from anon, authenticated;
revoke all on table public.tenant_provider_credentials from anon, authenticated;
revoke all on table public.provider_webhook_events from anon, authenticated;
revoke all on table public.public_request_rate_limits from anon, authenticated;

comment on table public.app_sessions is
  'Server-only authentication session records. Browser roles have no direct table privileges.';
comment on table public.user_password_credentials is
  'Server-only password verifier records. Browser roles have no direct table privileges.';
comment on table public.tenant_provider_credentials is
  'Server-only encrypted provider credentials. Browser roles have no direct table privileges.';
comment on table public.provider_webhook_events is
  'Server-only signed provider event receipts and replay controls.';
