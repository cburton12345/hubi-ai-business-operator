update public.owner_platform_connections
set notes = 'GovFlow aka BidOps. Current government opportunity / procurement intelligence product family member. Treat bidops.net as the primary public domain, govflow.live as related engine/redirect domain, and bidops-govflow.netlify.app as a pilot/staging reference until confirmed otherwise.',
    metadata_json = metadata_json || '{
      "aliases":["GovFlow","BidOps","Bid Ops"],
      "currentProjectHint":"GovFlow and BidOps refer to the same product area for LifeOps routing.",
      "primaryDomain":"https://bidops.net",
      "relatedDomain":"https://govflow.live",
      "pilotUrl":"https://bidops-govflow.netlify.app",
      "currentWorkspace":"C:/Users/schem/Documents/Codex/2026-05-26/build-an-mvp-government-contract-opportunity",
      "ownerEventExamples":["opportunity_found","deadline_risk","bid_decision_needed","import_failure","compliance_review_needed"],
      "doNotMergeProduct":true
    }'::jsonb
where platform_key = 'bidops';

update public.owner_platform_connections
set notes = 'Alive aka GuardianSignal. Current production identity is GuardianSignal at guardiansignal.net on Netlify site carecheck-health-alerts. Use the C:/Users/schem/Alive repo and avoid the old alive-apk-preview Netlify site unless explicitly restoring old history.',
    metadata_json = metadata_json || '{
      "aliases":["Alive","GuardianSignal","Guardian Signal"],
      "currentProjectHint":"Alive is the app/codebase name; GuardianSignal is the current public brand.",
      "currentWorkspace":"C:/Users/schem/Alive",
      "currentNetlifySite":"carecheck-health-alerts",
      "currentDomain":"https://guardiansignal.net",
      "legacyNetlifySite":"alive-apk-preview",
      "legacyUrl":"https://alive-apk-preview.netlify.app",
      "avoidLegacyByDefault":true,
      "ownerEventExamples":["missed_check_in","safety_alert","caregiver_escalation","device_health_issue","notification_failure"]
    }'::jsonb
where platform_key = 'guardiansignal';

update public.owner_platform_connections
set notes = '4Bid current project. Use the most recent/current 4Bid identity: 4bidauction.com, Netlify site 4bid-web under team naaamr, Supabase ref ikrwjexmwgovuympqurd, GitHub cburton12345/4bid. Old Render/clean copies are legacy references only.',
    metadata_json = metadata_json || '{
      "aliases":["4Bid","4 Bid","4bid"],
      "currentProjectHint":"Use the current Netlify/Supabase/GitHub 4Bid, not old Render or archived clean copies.",
      "currentLocalCandidate":"C:/Users/schem/OneDrive/Documents/GitHub/4bid",
      "currentDomain":"https://4bidauction.com",
      "currentNetlifySite":"4bid-web",
      "currentSupabaseRef":"ikrwjexmwgovuympqurd",
      "currentGithubRepo":"https://github.com/cburton12345/4bid.git",
      "legacyReferences":["https://fourbid.onrender.com","https://4bid-api.onrender.com","C:/Users/schem/Documents/Codex/2026-04-29/i-was-in-a-good-chat/4bid-clean"],
      "avoidLegacyByDefault":true,
      "ownerEventExamples":["auction_ending","payment_issue","bidder_dispute","seller_dispute","backend_health_issue","settlement_needed"]
    }'::jsonb
where platform_key = '4bid';
