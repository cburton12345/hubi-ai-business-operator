insert into public.ai_tasks (
  id,
  tenant_id,
  brand_id,
  type,
  title,
  prompt_context_json,
  status,
  priority,
  created_by
)
values
  (
    '55555555-5555-4555-8555-555555555501',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222206',
    'content_draft',
    'Draft Ferocity weekly personal injury intake post',
    '{"goal":"Create a careful, compliant lead-generation post. No legal advice, no outcome guarantees.","channel":"facebook_post"}',
    'completed',
    80,
    'ai'
  ),
  (
    '55555555-5555-4555-8555-555555555502',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222205',
    'seo_recommendation',
    'Recommend storm restoration city/service SEO priorities',
    '{"goal":"Identify low-risk SEO actions for roofing and storm restoration demand.","scope":"recommendation"}',
    'completed',
    70,
    'ai'
  ),
  (
    '55555555-5555-4555-8555-555555555503',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222203',
    'campaign_recommendation',
    'Recommend trailer rental quote campaign angle',
    '{"goal":"Suggest an ad campaign angle without launching spend.","scope":"campaign_recommendation"}',
    'completed',
    60,
    'ai'
  )
on conflict (id) do update
set
  title = excluded.title,
  prompt_context_json = excluded.prompt_context_json,
  status = excluded.status,
  priority = excluded.priority,
  updated_at = now();

insert into public.ai_drafts (
  id,
  tenant_id,
  brand_id,
  ai_task_id,
  content_type,
  title,
  body,
  metadata_json,
  status,
  risk_level
)
values
  (
    '66666666-6666-4666-8666-666666666501',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222206',
    '55555555-5555-4555-8555-555555555501',
    'facebook_post',
    'Ferocity: injury intake awareness post',
    'If you were hurt in an accident and are unsure what information matters, Ferocity can help collect the details for a case review intake. Share what happened, where it happened, and whether you have received treatment. This is not legal advice and does not guarantee representation or results.',
    '{"channel":"facebook","approval_reason":"Legal-sensitive public wording requires admin review."}',
    'needs_review',
    'high'
  ),
  (
    '66666666-6666-4666-8666-666666666502',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222205',
    '55555555-5555-4555-8555-555555555502',
    'gbp_post',
    'Storm Restoration: inspection reminder',
    'Recent storms can leave roof and exterior damage that is easy to miss from the ground. Request a storm restoration inspection and document visible issues before small problems become bigger repairs.',
    '{"channel":"google_business_profile","approval_reason":"Low-risk local service post queued for review."}',
    'needs_review',
    'low'
  )
on conflict (id) do update
set
  title = excluded.title,
  body = excluded.body,
  metadata_json = excluded.metadata_json,
  status = excluded.status,
  risk_level = excluded.risk_level,
  updated_at = now();

insert into public.recommendations (
  id,
  tenant_id,
  brand_id,
  category,
  title,
  summary,
  rationale,
  suggested_action,
  impact_estimate,
  effort_estimate,
  risk_level,
  status,
  created_by
)
values
  (
    '77777777-7777-4777-8777-777777777501',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222205',
    'seo',
    'Create storm damage inspection service page draft',
    'Storm Restoration should queue a service page focused on storm damage inspections.',
    'The brand goal is local roofing/restoration lead capture, and inspection intent is a high-fit search pattern.',
    'Draft a service page for storm damage inspections and route it through approval before publishing.',
    'medium',
    'low',
    'low',
    'open',
    'ai'
  ),
  (
    '77777777-7777-4777-8777-777777777502',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222203',
    'ads',
    'Test trailer rental quote request campaign',
    'Preferred Trailer Rental should draft a quote-focused campaign before any ad spend is launched.',
    'The current Phase 1 scope allows campaign recommendations, not budget changes or launches.',
    'Draft Google and Facebook ad copy variants for rental quote requests and hold them for admin review.',
    'medium',
    'medium',
    'medium',
    'open',
    'ai'
  )
on conflict (id) do update
set
  title = excluded.title,
  summary = excluded.summary,
  rationale = excluded.rationale,
  suggested_action = excluded.suggested_action,
  impact_estimate = excluded.impact_estimate,
  effort_estimate = excluded.effort_estimate,
  risk_level = excluded.risk_level,
  status = excluded.status,
  updated_at = now();

insert into public.approvals (
  id,
  tenant_id,
  brand_id,
  target_type,
  target_id,
  status,
  risk_level,
  notes
)
values
  (
    '88888888-8888-4888-8888-888888888501',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222206',
    'ai_draft',
    '66666666-6666-4666-8666-666666666501',
    'pending',
    'high',
    'Legal-sensitive Ferocity public content requires approval before publishing.'
  ),
  (
    '88888888-8888-4888-8888-888888888502',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222203',
    'recommendation',
    '77777777-7777-4777-8777-777777777502',
    'pending',
    'medium',
    'Campaign recommendation can be reviewed, but no ad spend should launch in Phase 1.'
  )
on conflict (id) do update
set
  status = excluded.status,
  risk_level = excluded.risk_level,
  notes = excluded.notes;
