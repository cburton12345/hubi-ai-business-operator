update public.owner_platform_connections
set external_base_url = 'https://ferocity.live',
    connection_status = 'connected',
    notes = 'Ferocity / Check Hubi SEO. Active Netlify site ferocityflo under ferocityflow@outlook.com. Supabase ref puvpgebitzvyqbdnnlyz. GitHub repo cburton12345/hubi-ai-business-operator.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "workspace":"C:/Users/schem/Documents/Codex/2026-05-17/are-you-familiar-with-hubi-seo",
      "netlifyAccount":"ferocityflow@outlook.com",
      "netlifySite":"ferocityflo",
      "netlifySiteId":"418ea625-bb2f-45cc-951c-33b231147ab8",
      "supabaseRef":"puvpgebitzvyqbdnnlyz",
      "supabaseUrl":"https://puvpgebitzvyqbdnnlyz.supabase.co",
      "githubRepo":"https://github.com/cburton12345/hubi-ai-business-operator.git",
      "resendDomain":"ferocity.live",
      "sender":"hello@ferocity.live",
      "confidence":"confirmed"
    }'::jsonb
where platform_key = 'ferocity';

update public.owner_platform_connections
set external_base_url = 'https://marketplacepro.live',
    notes = 'MarketplacePro. Active Netlify marketplacepro-live-fresh under marketplaceprof@outlook.com. Supabase ref ruwctmxvarkhajayixcd. Resend alert flow tested. Old preferredtrailer1 Netlify project should be avoided.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "workspace":"C:/Users/schem/Documents/Codex/2026-05-25/marketplacepro-live-is-a-site-chatgpt",
      "netlifyAccount":"marketplaceprof@outlook.com",
      "netlifyTeam":"marketplaceprof",
      "netlifySite":"marketplacepro-live-fresh",
      "supabaseRef":"ruwctmxvarkhajayixcd",
      "supabaseUrl":"https://ruwctmxvarkhajayixcd.supabase.co",
      "resendAccount":"preferredtrailer1@gmail.com",
      "oldNetlifyAccount":"preferredtrailer1@gmail.com",
      "oldNetlifySite":"astonishing-kataifi-85ba54",
      "confidence":"confirmed"
    }'::jsonb
where platform_key = 'marketplacepro';

update public.owner_platform_connections
set external_base_url = 'https://4bidauction.com',
    notes = '4Bid auction/bidding project. Active Netlify site 4bid-web under schema7777777@gmail.com/team naaamr. Supabase ref ikrwjexmwgovuympqurd. Resend not set up yet.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "netlifyAccount":"schema7777777@gmail.com",
      "netlifyTeam":"naaamr",
      "netlifySite":"4bid-web",
      "netlifySiteId":"fdf94ad9-77ee-4be7-a20e-ffa9243b5f24",
      "supabaseRef":"ikrwjexmwgovuympqurd",
      "supabaseDashboard":"https://supabase.com/dashboard/project/ikrwjexmwgovuympqurd",
      "githubRepo":"https://github.com/cburton12345/4bid.git",
      "renderLegacyUrl":"https://fourbid.onrender.com",
      "renderPossibleUrl":"https://4bid-api.onrender.com",
      "resendStatus":"not_set_up",
      "confidence":"confirmed"
    }'::jsonb
where platform_key = '4bid';

update public.owner_platform_connections
set external_base_url = 'https://guardiansignal.net',
    notes = 'GuardianSignal / Alive caregiver safety app. Current production Netlify carecheck-health-alerts under schema2222222@gmail.com. Supabase ref vsqesazctpwxzpktjdxu. Old alive-apk-preview should be avoided.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "workspace":"C:/Users/schem/Alive",
      "netlifyAccount":"schema2222222@gmail.com",
      "netlifySite":"carecheck-health-alerts",
      "netlifySiteId":"24f9d623-80df-4bb4-b3ed-c2b24742a03e",
      "supabaseRef":"vsqesazctpwxzpktjdxu",
      "supabaseUrl":"https://vsqesazctpwxzpktjdxu.supabase.co",
      "supabaseDashboard":"https://supabase.com/dashboard/project/vsqesazctpwxzpktjdxu",
      "githubRepo":"https://github.com/cburton12345/Alive.git",
      "ouraContact":"schema7777777@gmail.com",
      "oldNetlifyAccount":"schema7777777@gmail.com",
      "oldNetlifySite":"alive-apk-preview",
      "confidence":"confirmed"
    }'::jsonb
where platform_key = 'guardiansignal';

update public.owner_platform_connections
set external_base_url = 'https://diamond-homes-contracts.netlify.app',
    notes = 'Diamond Homes contract signing system. Netlify site exists under schema2222222@gmail.com, but not confirmed as real DiamondHomes.us production. Supabase/SQL status uncertain.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "workspace":"C:/Users/schem/Documents/Codex/2026-05-06/diamond-homes-deploy-69ba40-was-just",
      "netlifyAccount":"schema2222222@gmail.com",
      "netlifySite":"diamond-homes-contracts",
      "supabaseRef":"ikrwjexmwgovuympqurd",
      "supabaseUrl":"https://ikrwjexmwgovuympqurd.supabase.co",
      "resendStatus":"not_used",
      "productionDomainStatus":"not_confirmed",
      "confidence":"partial"
    }'::jsonb
where platform_key = 'diamond-homes';

update public.owner_platform_connections
set notes = 'Homes4Rent / H4R rental listings or housing project. Accounts remembered: burtonchristopher125@gmail.com and homes4rent125@gmail.com. Hosting, repo, Supabase, and Netlify need confirmation.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "possibleAccounts":["burtonchristopher125@gmail.com","homes4rent125@gmail.com"],
      "confidence":"unconfirmed",
      "needsVerification":["repo","hosting","supabase","netlify"]
    }'::jsonb
where platform_key = 'h4r';

update public.owner_platform_connections
set notes = 'Preferred Trailer. Possible trailer business site/app. Account preferredtrailer1@gmail.com is tied to MarketplacePro Resend and may own this project; needs repo/hosting confirmation.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "possibleAccount":"preferredtrailer1@gmail.com",
      "confidence":"unconfirmed",
      "needsVerification":["repo","hosting","supabase","netlify"]
    }'::jsonb
where platform_key = 'preferred-trailer';

update public.owner_platform_connections
set notes = 'TZS / TZ Construction. Project location is not confirmed. User previously suspected Supabase may be under schema7777777; needs verification.',
    metadata_json = metadata_json || '{
      "projectMapSource":"2026-05-31 project-where-things-live",
      "possibleSupabaseAccount":"schema7777777",
      "confidence":"unconfirmed",
      "needsVerification":["repo","hosting","supabase","netlify"]
    }'::jsonb
where platform_key = 'tz-construction';

insert into public.owner_platform_connections (
  tenant_id, platform_key, platform_name, platform_type, connection_status, owner_layer, event_scope, action_href, external_base_url, notes, metadata_json
)
values (
  '11111111-1111-4111-8111-111111111111',
  'bidops',
  'BidOps / GovFlow',
  'software',
  'planned',
  'owner_command',
  array['government_opportunities','deadlines','bid_decisions','compliance','procurement_intelligence'],
  '/app/lifeops-connections',
  'https://bidops.net',
  'GovFlow/BidOps government opportunity intelligence platform. Local docs suggest bidops.net as primary domain and govflow.live as engine/redirect domain.',
  '{
    "projectMapSource":"GovFlow docs",
    "workspace":"C:/Users/schem/Documents/Codex/2026-05-26/build-an-mvp-government-contract-opportunity",
    "primaryDomain":"https://bidops.net",
    "engineDomain":"https://govflow.live",
    "netlifyPilot":"https://bidops-govflow.netlify.app",
    "relationship":"standalone product family member, optional Ferocity adapter",
    "confidence":"documented"
  }'::jsonb
)
on conflict (tenant_id, platform_key) do update
set platform_name = excluded.platform_name,
    platform_type = excluded.platform_type,
    event_scope = excluded.event_scope,
    action_href = excluded.action_href,
    external_base_url = excluded.external_base_url,
    notes = excluded.notes,
    metadata_json = public.owner_platform_connections.metadata_json || excluded.metadata_json,
    updated_at = now();
