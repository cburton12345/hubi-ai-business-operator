-- Migration 266 reconstructs ordinary client Data API grants from RLS policy
-- roles for fresh/reset databases. RLS policies are not themselves proof that a
-- table is a supported browser API, so restore the explicit server-only
-- boundaries established by earlier security migrations.

revoke all on table
  public.public_request_rate_limits,
  public.app_sessions,
  public.user_password_credentials,
  public.tenant_provider_credentials,
  public.provider_webhook_events,
  public.platform_public_content,
  public.platform_public_content_versions,
  public.platform_runtime_leases,
  public.platform_capacity_snapshots,
  public.platform_capacity_alerts,
  public.platform_admin_alerts,
  public.public_site_events,
  public.voice_dispatch_reservations,
  public.support_self_service_events,
  public.ferocity_connect_releases,
  public.h4r_ferocity_bridge_workspaces,
  public.h4r_ferocity_bridge_nonces,
  public.h4r_ferocity_bridge_events,
  public.companion_product_context_snapshots,
  public.ferocity_conversation_memories,
  public.ferocity_chat_action_receipts
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.public_request_rate_limits,
  public.app_sessions,
  public.user_password_credentials,
  public.tenant_provider_credentials,
  public.provider_webhook_events,
  public.platform_public_content,
  public.platform_public_content_versions,
  public.platform_runtime_leases,
  public.platform_capacity_snapshots,
  public.platform_capacity_alerts,
  public.platform_admin_alerts,
  public.public_site_events,
  public.voice_dispatch_reservations,
  public.support_self_service_events,
  public.ferocity_connect_releases,
  public.h4r_ferocity_bridge_workspaces,
  public.h4r_ferocity_bridge_nonces,
  public.h4r_ferocity_bridge_events,
  public.companion_product_context_snapshots,
  public.ferocity_conversation_memories,
  public.ferocity_chat_action_receipts
to service_role;

-- These two catalogs intentionally permit browser reads through their RLS
-- policies, but all writes remain server-governed.
revoke insert, update, delete, truncate, trigger, references on table
  public.provider_adapter_builds,
  public.provider_adapter_build_events
from public, anon, authenticated;
