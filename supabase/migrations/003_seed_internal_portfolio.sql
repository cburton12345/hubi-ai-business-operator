insert into public.tenants (
  id,
  name,
  slug,
  account_type,
  status,
  billing_status,
  plan_key
)
values (
  '11111111-1111-4111-8111-111111111111',
  'Internal Portfolio',
  'internal-portfolio',
  'internal',
  'active',
  'none',
  'internal'
)
on conflict (slug) do update
set
  name = excluded.name,
  account_type = excluded.account_type,
  status = excluded.status,
  billing_status = excluded.billing_status,
  plan_key = excluded.plan_key,
  updated_at = now();

insert into public.brands (
  id,
  tenant_id,
  name,
  slug,
  domain,
  business_model,
  industry,
  vertical,
  description,
  primary_goal,
  primary_location,
  risk_profile,
  status
)
values
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111111',
    '4bid',
    '4bid',
    null,
    'marketplace',
    'Auction marketplace',
    'auctions',
    'Auction marketplace for buyer, seller, bidder, and consignor demand.',
    'Generate buyer, seller, bidder, and consignor demand.',
    null,
    'normal',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111111',
    'MarketplacePro',
    'marketplacepro',
    'marketplacepro.live',
    'software',
    'Property management software',
    'property_management',
    'Software brand for property management operators.',
    'Drive demos and nurture property management operators.',
    null,
    'normal',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '11111111-1111-4111-8111-111111111111',
    'Preferred Trailer Rental',
    'preferred-trailer-rental',
    null,
    'rental',
    'Trailer rental',
    'trailer_rental',
    'Trailer rental business for local quote and rental requests.',
    'Capture rental quote requests and local service demand.',
    null,
    'normal',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    '11111111-1111-4111-8111-111111111111',
    'Homes4Rent',
    'homes4rent',
    null,
    'marketplace',
    'Rental housing',
    'rental_housing',
    'Rental housing and tenant/landlord demand generation.',
    'Capture rental housing demand and property owner opportunities.',
    null,
    'normal',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    '11111111-1111-4111-8111-111111111111',
    'Storm Restoration',
    'storm-restoration',
    null,
    'local_service',
    'Roofing / storm restoration',
    'roofing',
    'Local service brand for storm restoration and roofing leads.',
    'Generate qualified roofing and restoration estimate requests.',
    null,
    'normal',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    '11111111-1111-4111-8111-111111111111',
    'Ferocity',
    'ferocity',
    null,
    'lead_generation',
    'Personal injury lead generation',
    'personal_injury',
    'Legal-sensitive personal injury lead-generation brand.',
    'Generate qualified, consent-based personal injury leads.',
    null,
    'legal_sensitive',
    'active'
  )
on conflict (tenant_id, slug) do update
set
  name = excluded.name,
  domain = excluded.domain,
  business_model = excluded.business_model,
  industry = excluded.industry,
  vertical = excluded.vertical,
  description = excluded.description,
  primary_goal = excluded.primary_goal,
  primary_location = excluded.primary_location,
  risk_profile = excluded.risk_profile,
  status = excluded.status,
  updated_at = now();

insert into public.brand_marketing_settings (
  tenant_id,
  brand_id,
  target_customers,
  cta_goals,
  ad_goals,
  seo_targets,
  review_strategy,
  follow_up_strategy,
  tone_of_voice,
  approval_mode
)
select
  b.tenant_id,
  b.id,
  case b.slug
    when 'ferocity' then 'People seeking information after a potential personal injury incident who consent to be contacted.'
    when 'storm-restoration' then 'Homeowners needing storm, roof, or exterior restoration help.'
    when 'preferred-trailer-rental' then 'Local renters who need trailer availability, delivery, and quotes.'
    when 'marketplacepro' then 'Property managers and operators evaluating better software.'
    else 'Marketplace buyers, sellers, bidders, and consignors.'
  end,
  case b.slug
    when 'marketplacepro' then 'Request a demo'
    when 'ferocity' then 'Request a free case review intake'
    when 'preferred-trailer-rental' then 'Request a rental quote'
    else 'Request information'
  end,
  'Recommend campaign angles only in Phase 1.',
  'Generate draft SEO recommendations only in Phase 1.',
  'Draft review requests only; do not auto-send.',
  'Draft follow-up messages only; do not auto-send.',
  case b.slug
    when 'ferocity' then 'Clear, careful, compliant, and empathetic. No legal advice or guarantees.'
    else 'Direct, useful, local, and conversion-focused.'
  end,
  'manual'
from public.brands b
where b.tenant_id = '11111111-1111-4111-8111-111111111111'
on conflict (brand_id) do update
set
  target_customers = excluded.target_customers,
  cta_goals = excluded.cta_goals,
  ad_goals = excluded.ad_goals,
  seo_targets = excluded.seo_targets,
  review_strategy = excluded.review_strategy,
  follow_up_strategy = excluded.follow_up_strategy,
  tone_of_voice = excluded.tone_of_voice,
  approval_mode = excluded.approval_mode,
  updated_at = now();

insert into public.forms (
  tenant_id,
  brand_id,
  name,
  slug,
  public_key,
  active
)
select
  b.tenant_id,
  b.id,
  'Primary Lead Form',
  'primary-lead-form',
  'internal-' || b.slug || '-primary-lead-form',
  true
from public.brands b
where b.tenant_id = '11111111-1111-4111-8111-111111111111'
on conflict (brand_id, slug) do update
set
  name = excluded.name,
  public_key = excluded.public_key,
  active = excluded.active;
