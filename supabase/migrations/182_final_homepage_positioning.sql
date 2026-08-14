insert into public.platform_public_content_versions (content_key, snapshot_json, changed_by)
select
  content_key,
  jsonb_build_object(
    'enabled', enabled,
    'source_type', source_type,
    'media_url', media_url,
    'poster_url', poster_url,
    'eyebrow', eyebrow,
    'headline', headline,
    'body', body,
    'cta_label', cta_label,
    'cta_href', cta_href,
    'secondary_cta_label', secondary_cta_label,
    'secondary_cta_href', secondary_cta_href
  ),
  'migration:182_final_homepage_positioning'
from public.platform_public_content
where content_key in ('home_hero', 'home_final_cta');

update public.platform_public_content
set
  eyebrow = 'Meet your AI operations department',
  headline = 'Your business shouldn''t stop when you stop looking at it.',
  body = 'Ferocity answers the phone. Chases leads. Follows up on estimates. Schedules work. Coordinates crews. Talks to customers. Collects money. Keeps marketing moving. Watches for problems—and handles hundreds of other things it takes to keep a business running. And when something actually needs you, Ferocity brings you the decision.',
  cta_label = 'See Ferocity work',
  cta_href = '/demo',
  secondary_cta_label = 'See plans & pricing',
  secondary_cta_href = '/pricing',
  updated_by = 'migration:182_final_homepage_positioning',
  updated_at = now()
where content_key = 'home_hero';

update public.platform_public_content
set
  eyebrow = 'Build without becoming the bottleneck',
  headline = 'Build the business without making yourself the bottleneck.',
  body = 'More customers shouldn''t mean more things for you to chase. More employees shouldn''t mean more things for you to coordinate. More work shouldn''t mean more things for you to remember. More software shouldn''t mean more dashboards for you to watch. Your business keeps moving—even when you''re not watching it.',
  cta_label = 'Start Ferocity',
  cta_href = '/subscribe',
  secondary_cta_label = 'Compare plans',
  secondary_cta_href = '/pricing',
  updated_by = 'migration:182_final_homepage_positioning',
  updated_at = now()
where content_key = 'home_final_cta';
