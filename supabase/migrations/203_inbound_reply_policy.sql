-- Ordinary inbound replies are prepared for review by default. A workspace may
-- deliberately promote this policy to live, but consent, suppression, quiet
-- hours, provider health, confidence, and Business Brain risk checks still apply.

insert into public.live_action_policies (
  tenant_id,action_key,provider_key,label,status,minimum_plan_key,
  requires_consent,requires_human_approval,risk_level,metadata_json
)
select id,'inbound_sms_reply','ferocity_connect','Reply to inbound SMS',
  'review_only','ferocity_connect',true,true,'medium',
  '{"defaultMode":"approval_first","requiresHighConfidence":true,"ordinaryInboundOnly":true}'::jsonb
from public.tenants where status <> 'archived'
on conflict (tenant_id,action_key) do nothing;
