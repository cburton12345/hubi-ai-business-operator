insert into public.platform_public_content_versions (content_key, snapshot_json, changed_by)
select
  content_key,
  jsonb_build_object(
    'eyebrow', eyebrow,
    'headline', headline,
    'body', body,
    'ctaLabel', cta_label,
    'ctaHref', cta_href,
    'secondaryCtaLabel', secondary_cta_label,
    'secondaryCtaHref', secondary_cta_href,
    'enabled', enabled
  ),
  'migration_206_ferocity_earn_first_pricing_story'
from public.platform_public_content
where content_key = 'pricing_hero';

update public.platform_public_content
set
  eyebrow = 'Start with the result',
  headline = 'Put Ferocity to work before you commit to another subscription.',
  body = 'Start with Ferocity Earn and pay a percentage only when eligible revenue is actually collected—or choose a complete monthly plan when you want more of the operating system working across the business every day.',
  cta_label = 'Start with Ferocity Earn',
  cta_href = '/start?source=pricing&plan=earn#start-request',
  secondary_cta_label = 'Compare monthly plans',
  secondary_cta_href = '#plans',
  updated_at = now()
where content_key = 'pricing_hero';
