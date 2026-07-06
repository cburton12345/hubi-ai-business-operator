create table if not exists public.owner_command_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  platform_key text not null,
  platform_name text not null,
  external_event_id text,
  event_type text not null,
  title text not null,
  summary text not null,
  severity text not null default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'needs_owner', 'critical', 'ai_handled', 'watching', 'resolved', 'archived')),
  owner_attention boolean not null default false,
  ai_handled boolean not null default false,
  ai_summary text,
  recommended_action text,
  action_href text,
  money_cents integer not null default 0,
  risk_type text
    check (risk_type is null or risk_type in ('revenue', 'financial', 'customer', 'legal', 'safety', 'automation', 'low_confidence', 'approval')),
  confidence_score integer not null default 80 check (confidence_score >= 0 and confidence_score <= 100),
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_owner_command_events_external
  on public.owner_command_events(tenant_id, platform_key, external_event_id)
  where external_event_id is not null;

create index if not exists idx_owner_command_events_attention
  on public.owner_command_events(tenant_id, owner_attention, severity, occurred_at desc);

create index if not exists idx_owner_command_events_status
  on public.owner_command_events(tenant_id, status, occurred_at desc);

create index if not exists idx_owner_command_events_money
  on public.owner_command_events(tenant_id, money_cents desc, occurred_at desc)
  where money_cents > 0;

alter table public.owner_command_events enable row level security;

drop policy if exists owner_command_events_tenant_operator on public.owner_command_events;
create policy owner_command_events_tenant_operator
on public.owner_command_events
for all
using (tenant_id is null or public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (tenant_id is null or public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

create or replace function public.set_owner_command_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_command_events_touch_updated_at on public.owner_command_events;
create trigger owner_command_events_touch_updated_at
before update on public.owner_command_events
for each row
execute function public.set_owner_command_events_updated_at();

insert into public.owner_command_events (
  tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
  severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
  action_href, money_cents, risk_type, confidence_score, metadata_json, occurred_at
)
values
  ('11111111-1111-4111-8111-111111111111', 'ferocity', 'Ferocity', 'seed-ferocity-hot-lead', 'lead.hot', 'Hot lead needs same-day reply', 'A service lead is still waiting for a useful first response.', 'high', 'needs_owner', true, false, 'AI prepared a response path but needs approval before customer contact.', 'Open the lead queue and approve or edit the first reply.', '/app/leads', 1800000, 'revenue', 86, '{"source":"seed"}'::jsonb, now() - interval '35 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'govflow', 'GovFlow', 'seed-govflow-deadline', 'deadline.contract', 'Government opportunity deadline approaching', 'A matching public-sector opportunity needs a go/no-go decision before the response window closes.', 'critical', 'critical', true, false, 'AI can summarize fit and missing documents, but owner decision is required.', 'Review bid fit, timeline, and documents before committing.', '/app/operator-depth', 0, 'legal', 74, '{"source":"seed"}'::jsonb, now() - interval '1 hour'),
  ('11111111-1111-4111-8111-111111111111', 'bidops', 'BidOps', 'seed-bidops-estimate', 'estimate.margin', 'Estimate margin looks worth reviewing', 'A bid has enough potential profit to deserve review before it goes cold.', 'medium', 'open', true, false, 'AI flagged this because money potential is high and confidence is moderate.', 'Check pricing, scope, and follow-up timing.', '/app/service', 4200000, 'revenue', 78, '{"source":"seed"}'::jsonb, now() - interval '2 hours'),
  ('11111111-1111-4111-8111-111111111111', 'h4r', 'H4R', 'seed-h4r-owner', 'rental.owner', 'Property owner inquiry needs triage', 'A rental/property owner appears to be a possible management or listing opportunity.', 'medium', 'needs_owner', true, false, 'AI drafted a qualification checklist.', 'Decide whether this should become a sales opportunity.', '/app/leads', 950000, 'revenue', 82, '{"source":"seed"}'::jsonb, now() - interval '3 hours'),
  ('11111111-1111-4111-8111-111111111111', '4bid', '4Bid', 'seed-4bid-dispute', 'customer.dispute', 'Buyer/seller issue needs careful response', 'A marketplace issue could become a reputation or support problem if ignored.', 'high', 'needs_owner', true, false, 'AI recommends a calm fact-gathering response and audit trail.', 'Review the dispute before sending any final decision.', '/app/operator-depth', 0, 'customer', 69, '{"source":"seed"}'::jsonb, now() - interval '4 hours'),
  ('11111111-1111-4111-8111-111111111111', 'guardiansignal', 'GuardianSignal', 'seed-guardian-safety', 'safety.alert', 'Safety alert requires human review', 'A safety-related signal was received and should not be handled blindly.', 'critical', 'critical', true, false, 'AI classified this as safety-sensitive and stopped short of automation.', 'Review details and decide escalation path.', '/app/alerts', 0, 'safety', 61, '{"source":"seed"}'::jsonb, now() - interval '5 hours'),
  ('11111111-1111-4111-8111-111111111111', 'marketplacepro', 'MarketplacePro', 'seed-mp-lead', 'marketplace.lead', 'Marketplace lead imported', 'A public marketplace lead is ready for Ferocity follow-up and source tracking.', 'medium', 'ai_handled', false, true, 'AI tagged the source and prepared a follow-up task.', 'Review prepared follow-up when ready.', '/app/operator', 1200000, 'revenue', 88, '{"source":"seed"}'::jsonb, now() - interval '6 hours'),
  ('11111111-1111-4111-8111-111111111111', 'preferred-trailer', 'Preferred Trailer', 'seed-trailer-rental', 'rental.request', 'Trailer rental request has money potential', 'A rental request may be ready for availability and payment follow-up.', 'medium', 'open', true, false, 'AI found likely rental intent and missing availability confirmation.', 'Confirm availability and prepare quote/payment next step.', '/app/service', 65000, 'revenue', 81, '{"source":"seed"}'::jsonb, now() - interval '7 hours'),
  ('11111111-1111-4111-8111-111111111111', 'diamond-homes', 'Diamond Homes', 'seed-diamond-review', 'review.proof', 'Customer proof can become marketing', 'A completed job has review/proof potential and should be turned into content after approval.', 'low', 'ai_handled', false, true, 'AI prepared a review ask and proof-to-content idea.', 'Approve the review/proof request when appropriate.', '/app/proof', 0, 'approval', 91, '{"source":"seed"}'::jsonb, now() - interval '8 hours'),
  ('11111111-1111-4111-8111-111111111111', 'tz-construction', 'TZ''s Construction', 'seed-tz-invoice', 'invoice.overdue', 'Invoice follow-up can protect cash', 'An invoice has aged enough to justify a polite reminder draft.', 'high', 'needs_owner', true, false, 'AI prepared a payment reminder but did not send it.', 'Review and approve the reminder.', '/app/service', 240000, 'financial', 84, '{"source":"seed"}'::jsonb, now() - interval '9 hours'),
  ('11111111-1111-4111-8111-111111111111', 'ferocity-owner-command', 'Ferocity Owner Command', 'seed-owner-command-production', 'system.direction', 'Owner Command Center lives in Ferocity', 'Ferocity is the production platform for the Owner Command Center and connected-system event stream.', 'info', 'resolved', false, true, 'AI recorded the production architecture direction.', 'Build owner command work as production Ferocity capability.', '/app/owner-command-center', 0, 'approval', 95, '{"source":"seed"}'::jsonb, now() - interval '10 hours')
on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
set event_type = excluded.event_type,
    title = excluded.title,
    summary = excluded.summary,
    severity = excluded.severity,
    status = excluded.status,
    owner_attention = excluded.owner_attention,
    ai_handled = excluded.ai_handled,
    ai_summary = excluded.ai_summary,
    recommended_action = excluded.recommended_action,
    action_href = excluded.action_href,
    money_cents = excluded.money_cents,
    risk_type = excluded.risk_type,
    confidence_score = excluded.confidence_score,
    metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('operator', 'owner_command_center', 'Owner Command Center', true, 'Internal AI Chief of Staff view', 255, '{"ownerLayer":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();
