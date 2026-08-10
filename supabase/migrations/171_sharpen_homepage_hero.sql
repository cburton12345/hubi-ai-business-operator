update public.platform_public_content
set
  eyebrow = 'Meet your AI operations department',
  headline = 'Imagine hiring an entire AI operations department—all sharing the same Business Brain.',
  body = 'They answer phones, follow up with leads, prepare estimates, coordinate jobs, dispatch crews, manage customer communication, collect payments, keep marketing moving, monitor operations, and only bring you the decisions that actually require human judgment. And that’s just the beginning. That’s Ferocity.',
  cta_label = 'See how Ferocity works',
  cta_href = '/demo',
  secondary_cta_label = 'See plans & pricing',
  secondary_cta_href = '/pricing',
  updated_at = now()
where content_key = 'home_hero';
