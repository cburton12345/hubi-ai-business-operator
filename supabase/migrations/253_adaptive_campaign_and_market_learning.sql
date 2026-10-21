-- Extend existing Marketing Memory and privacy-safe cohort learning for
-- current market evidence and paid source-to-profit outcomes. No raw customer,
-- campaign creative, contact, message, or tenant identity enters shared data.
alter table public.marketing_memory_items drop constraint if exists marketing_memory_items_memory_type_check;
alter table public.marketing_memory_items add constraint marketing_memory_items_memory_type_check check (memory_type in (
  'headline','offer','cta','facebook_post','gbp_post','landing_page','ad','photo','video','city','service','audience',
  'referral_source','campaign','seasonal_pattern','ideal_customer','customer_language','pain_point','objection','won_reason',
  'lost_reason','competitor','competitor_change','positioning','website_gap','channel_learning','conversation_signal','brand_voice',
  'market_trend'
));

alter table public.cross_tenant_learning_contributions
  add column if not exists spend_cents bigint not null default 0 check (spend_cents >= 0),
  add column if not exists gross_profit_cents bigint not null default 0,
  add column if not exists measurement_kind text not null default 'lifecycle' check (measurement_kind in ('lifecycle','paid_channel'));

alter table public.aggregate_growth_playbooks
  add column if not exists spend_cents bigint not null default 0 check (spend_cents >= 0),
  add column if not exists gross_profit_cents bigint not null default 0,
  add column if not exists gross_profit_return numeric(14,6),
  add column if not exists cost_per_qualified_lead_cents numeric(14,2),
  add column if not exists customer_acquisition_cost_cents numeric(14,2),
  add column if not exists measurement_kind text not null default 'lifecycle' check (measurement_kind in ('lifecycle','paid_channel'));

comment on column public.cross_tenant_learning_contributions.measurement_kind is
  'Only deidentified aggregate counters are shared after explicit tenant consent; raw tenant records never leave tenant scope.';
