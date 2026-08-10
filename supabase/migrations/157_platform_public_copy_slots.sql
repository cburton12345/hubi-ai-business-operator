alter table public.platform_public_content
  add column if not exists secondary_cta_label text,
  add column if not exists secondary_cta_href text;

insert into public.platform_public_content (
  content_key, enabled, eyebrow, headline, body, cta_label, cta_href,
  secondary_cta_label, secondary_cta_href
) values
  (
    'home_hero', true, 'AI operating system for service businesses',
    'Win more work. Lose less money. Get your life back.',
    'Ferocity follows up with leads, keeps jobs moving, tracks money, builds customer trust, and handles approved routine office work—so the business runs without everything depending on you.',
    'Start Ferocity', '/subscribe', 'View plans', '/pricing'
  ),
  (
    'home_final_cta', true, 'First step',
    'See what Ferocity can take off your plate first.',
    'Run the free grader, then choose what you want Ferocity to watch, prepare, remind, or automate.',
    'Start Ferocity', '/subscribe', 'Compare plans', '/pricing'
  ),
  (
    'demo_hero', true, 'Product demo',
    'See the business machine Ferocity helps build.',
    'First Ferocity helps set up the growth and operations loop. Then it watches the queue, prepares the next move, and keeps important decisions in front of the owner.',
    'Start Ferocity', '/subscribe', 'Compare plans', '/pricing'
  ),
  (
    'pricing_hero', true, 'Simple paid plans',
    'Choose how much work you want taken off your plate.',
    'Every plan includes Ferocity’s real AI engine. Higher tiers handle more of the customer journey, connect more of the business, and watch for more problems before they cost you.',
    'Start Growth', '/subscribe?plan=growth', 'Compare plans', '#plans'
  )
on conflict (content_key) do nothing;

comment on column public.platform_public_content.secondary_cta_href is
  'Local Ferocity path or same-page anchor only; server actions validate before saving.';
