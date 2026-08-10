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
  'migration:167_public_operating_system_story'
from public.platform_public_content
where content_key in ('home_hero', 'home_final_cta', 'demo_hero', 'featured_demo');

update public.platform_public_content
set
  eyebrow = 'The AI operating system for the whole business',
  headline = 'What if your entire business could think and act as one?',
  body = 'Ferocity gives your people and AI workforce one shared Business Brain. It remembers what happened, watches for meaningful change, decides what should happen next, and keeps authorized work moving across every department—only routing real decisions to the right person.',
  cta_label = 'Start Ferocity',
  cta_href = '/subscribe',
  secondary_cta_label = 'View plans',
  secondary_cta_href = '/pricing',
  updated_by = 'migration:167_public_operating_system_story',
  updated_at = now()
where content_key = 'home_hero';

update public.platform_public_content
set
  eyebrow = 'One Business Brain for the entire company',
  headline = 'Give the whole organization one system for what happens next.',
  body = 'Start with one department or connect the full operating loop. Ferocity learns the business, coordinates human and AI work, remembers the rules, and keeps unfinished work moving until it is complete or needs a real decision.',
  cta_label = 'Start Ferocity',
  cta_href = '/subscribe',
  secondary_cta_label = 'Compare plans',
  secondary_cta_href = '/pricing',
  updated_by = 'migration:167_public_operating_system_story',
  updated_at = now()
where content_key = 'home_final_cta';

update public.platform_public_content
set
  eyebrow = 'See Ferocity think',
  headline = 'Watch the whole business think and act as one.',
  body = 'One opportunity moves through people, AI employees, departments, and providers without losing its context. Ferocity decides what should happen next, advances authorized work, verifies the result, and keeps going until a real decision is needed.',
  cta_label = 'Start Ferocity',
  cta_href = '/subscribe',
  secondary_cta_label = 'Compare plans',
  secondary_cta_href = '/pricing',
  updated_by = 'migration:167_public_operating_system_story',
  updated_at = now()
where content_key = 'demo_hero';

update public.platform_public_content
set
  eyebrow = 'Watch the operating system think',
  headline = 'Watch work keep moving across the entire business.',
  body = 'Ferocity connects leads, conversations, jobs, people, money, customer promises, and growth—then determines, performs, and follows through on the next authorized move.',
  cta_label = 'Open full demo',
  cta_href = '/demo',
  updated_by = 'migration:167_public_operating_system_story',
  updated_at = now()
where content_key = 'featured_demo';
