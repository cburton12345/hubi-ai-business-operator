create table if not exists public.marketing_platform_playbooks (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null unique,
  display_name text not null,
  status text not null default 'active'
    check (status in ('active', 'needs_review', 'paused', 'archived')),
  strategy_summary text not null,
  creative_rules_json jsonb not null default '[]'::jsonb,
  asset_requirements_json jsonb not null default '{}'::jsonb,
  testing_rules_json jsonb not null default '{}'::jsonb,
  avoid_json jsonb not null default '[]'::jsonb,
  source_urls_json jsonb not null default '[]'::jsonb,
  last_reviewed_on date not null default current_date,
  next_review_on date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_platform_playbooks enable row level security;

drop policy if exists marketing_platform_playbooks_readable on public.marketing_platform_playbooks;
create policy marketing_platform_playbooks_readable
on public.marketing_platform_playbooks
for select
using (true);

insert into public.marketing_platform_playbooks (
  platform_key, display_name, strategy_summary, creative_rules_json, asset_requirements_json,
  testing_rules_json, avoid_json, source_urls_json, next_review_on, metadata_json
)
values
  (
    'meta',
    'Meta / Facebook / Instagram',
    'Feed the system real creative variety. Make different angles, hooks, formats, proofs, and offers instead of tiny edits to one ad.',
    '["Create new creative weekly when spend is active.","Use true variation: proof, offer, urgency, objection, founder/owner, before-after.","Prefer simple campaign structure with multiple creative options.","Use customer proof and creator-style assets when permission exists."]'::jsonb,
    '{"formats":["1:1","4:5","9:16"],"minimumVariants":5,"recommendedVariants":10,"assetTypes":["static_ad","story_ad","ugc_video_script","short_video_script"]}'::jsonb,
    '{"test":"Rotate hooks and angles first, then offers and audiences.","winnerRule":"Store winners in Marketing Memory after leads/jobs/revenue are known.","refreshCadence":"weekly when active"}'::jsonb,
    '["Only changing button text and calling it a new variant.","Over-polished generic stock creative.","Launching spend without source tracking."]'::jsonb,
    '["https://www.facebook.com/business/news/three-steps-to-optimize-your-performance-with-creative-diversification"]'::jsonb,
    current_date + 60,
    '{"officialSource":true}'::jsonb
  ),
  (
    'google',
    'Google Ads / Performance Max',
    'Give Google enough high-quality assets and keep them refreshed. Group assets by service, product, category, or location so the message matches the search intent.',
    '["Use clear service or product relevance.","Refresh creative as offers, seasons, and services change.","Keep strong landing-page alignment.","Use images to show the unique selling point."]'::jsonb,
    '{"formats":["1200x1200","landscape","logo","video"],"minimumImages":7,"recommendedImages":20,"minimumVideos":1,"recommendedTextAssets":25,"assetTypes":["search_ad","display_ad","landing_page","short_video_script"]}'::jsonb,
    '{"test":"Build asset groups by service/category/location.","winnerRule":"Judge by qualified leads, booked jobs, and revenue, not clicks alone.","refreshCadence":"2-3 weeks before promotions, then frequently during active sale windows"}'::jsonb,
    '["Deleting low-rated assets without replacing them.","Using one generic page for every service.","Judging performance before enough conversion data exists."]'::jsonb,
    '["https://support.google.com/google-ads/answer/14528221","https://support.google.com/google-ads/answer/14530211"]'::jsonb,
    current_date + 60,
    '{"officialSource":true}'::jsonb
  ),
  (
    'tiktok',
    'TikTok',
    'Make creative feel native: vertical, simple, fast, trend-aware, and not overly polished. A TikTok ad should look like it belongs in the feed.',
    '["Use vertical video and safe zones.","Lead with the problem or curiosity in the first seconds.","Use creator/UGC style and plain speech.","Use trends as storytelling templates when appropriate."]'::jsonb,
    '{"formats":["9:16"],"minimumVariants":5,"recommendedVariants":10,"assetTypes":["ugc_video_script","short_video_script","caption"],"safeZoneRequired":true}'::jsonb,
    '{"test":"Test hooks and creator-style angles quickly.","winnerRule":"Save hooks with strong watch, click, lead, and booked-job performance.","refreshCadence":"weekly or faster when trend-based"}'::jsonb,
    '["Reusing polished Meta creative without changing it.","Long intros before the offer/problem.","Ignoring mobile safe zones."]'::jsonb,
    '["https://ads.tiktok.com/help/article/creative-best-practices","https://ads.tiktok.com/help/article/tiktok-ads-best-practices"]'::jsonb,
    current_date + 45,
    '{"officialSource":true}'::jsonb
  ),
  (
    'reddit',
    'Reddit',
    'Speak like a person in a specific community. Keep it mobile-first, concise, contextual, and transparent.',
    '["Make copy conversational and specific.","Use concise headlines and clear CTAs.","Build for mobile.","Vary copy and media instead of one corporate-looking ad."]'::jsonb,
    '{"formats":["4:5","mobile"],"headlineMaxCharacters":150,"minimumVariants":4,"recommendedVariants":8,"assetTypes":["reddit_ad","caption","static_ad"]}'::jsonb,
    '{"test":"Test community-specific language and one variable at a time.","winnerRule":"Track comments, qualified traffic, leads, and booked work.","refreshCadence":"biweekly or when community context shifts"}'::jsonb,
    '["Corporate jargon.","Ignoring subreddit/context fit.","Vague CTAs."]'::jsonb,
    '["https://www.business.reddit.com/copy-creative-best-practices","https://business.reddithelp.com/s/article/Creative-Best-Practices"]'::jsonb,
    current_date + 60,
    '{"officialSource":true}'::jsonb
  ),
  (
    'youtube',
    'YouTube',
    'Use video structure: hook, problem, proof, offer, CTA. Make skippable-first creative with the main point early.',
    '["Put the core promise early.","Use real proof or product/service demonstration.","Create short and longer variants.","Match video to landing page and campaign source."]'::jsonb,
    '{"formats":["16:9","9:16"],"minimumVariants":3,"recommendedVariants":6,"assetTypes":["short_video_script","youtube_ad","landing_page"]}'::jsonb,
    '{"test":"Test first-five-second hooks, proof types, and CTAs.","winnerRule":"Track view quality, click quality, leads, and booked revenue.","refreshCadence":"monthly or by offer/season"}'::jsonb,
    '["Slow intros.","Brand-only videos with no action.","No landing-page match."]'::jsonb,
    '["https://support.google.com/google-ads/answer/14528221"]'::jsonb,
    current_date + 60,
    '{"derivedFromGoogleCreativeGuidance":true}'::jsonb
  ),
  (
    'microsoft',
    'Microsoft Ads',
    'Treat Microsoft as search-intent and professional-audience demand capture. Keep copy direct, offer-specific, and tied to landing pages.',
    '["Lead with service, location, problem, or offer.","Keep landing-page match tight.","Use search-style variants for different intent levels.","Track calls/forms through to revenue."]'::jsonb,
    '{"formats":["search","display"],"minimumVariants":3,"recommendedVariants":6,"assetTypes":["microsoft_ad","landing_page"]}'::jsonb,
    '{"test":"Test intent-specific headlines and offers.","winnerRule":"Judge by qualified leads, booked work, and revenue.","refreshCadence":"monthly or by offer/season"}'::jsonb,
    '["Generic all-services copy.","No call/form tracking.","Sending every ad to the homepage."]'::jsonb,
    '[]'::jsonb,
    current_date + 60,
    '{"needsOfficialReview":true}'::jsonb
  )
on conflict (platform_key) do update set
  display_name = excluded.display_name,
  strategy_summary = excluded.strategy_summary,
  creative_rules_json = excluded.creative_rules_json,
  asset_requirements_json = excluded.asset_requirements_json,
  testing_rules_json = excluded.testing_rules_json,
  avoid_json = excluded.avoid_json,
  source_urls_json = excluded.source_urls_json,
  last_reviewed_on = current_date,
  next_review_on = excluded.next_review_on,
  metadata_json = public.marketing_platform_playbooks.metadata_json || excluded.metadata_json,
  updated_at = now();
