# Customer marketing connector readiness

Last verified: 2026-09-30

## Production configuration deployed on 2026-09-27

The complete production credential sets for Google/YouTube, Meta, TikTok Login Kit, Reddit Ads, and Microsoft Advertising are present in Netlify's **production** context. Values were copied from the already-established local Ferocity configuration without displaying them. The connector configuration was deployed successfully in Netlify production deploy `6ab9dd0e7c6500f0ecaa87f0`.

The Ferocity QA workspace was reconciled after deployment. Google Business Profile, Google Ads, Search Console, Meta, Reddit, and Microsoft Advertising now report that Ferocity's platform OAuth application is configured while correctly retaining `oauthUserGrantRequired=true`, `apiConnected=false`, and `liveActionsEnabled=false`. TikTok Login Kit was separately refreshed and its `ferocity78` identity was verified with encrypted token storage.

The connector certification suite passed 21/21 tests covering standard OAuth, customer/developer credential separation, account discovery, and provider certification boundaries. The provider truth guard, capability truth guard, and provider-lane smoke suite also passed. No publishing, campaign mutation, or spend was enabled.

Provider-side approval remains a separate gate. Staging credentials does not grant Meta advanced Marketing API access, TikTok API for Business or Content Posting approval, Google Ads production certification, Reddit Ads production certification, or any write/spend permission.

## Customer connection model

Normal customers never supply developer keys. For supported networks they click **Connect Account**, sign in on the provider's own page, grant Ferocity access, and choose the business, page, channel, ad account, or advertiser profile Ferocity should use. Ferocity stores tenant authorization separately from Ferocity's platform application credentials. Disconnecting a connection disables Ferocity access and clears the tenant credential material.

The shared OAuth and account-selection pipeline now covers Google Ads/YouTube, Meta, TikTok, Reddit, Microsoft Ads, LinkedIn Ads, Pinterest Ads, Snap Ads, and Amazon Ads. A completed code path does not override provider approval: a Connect button becomes usable only after Ferocity's own provider application credentials and required approval are present.

X Ads uses a separate signed OAuth 1.0a customer flow. That adapter, secure tenant token storage, and advertiser-account discovery are implemented locally, but it remains unavailable until Ferocity's X application receives Ads API access and credentials.

This document tracks the customer-facing connection path, not Ferocity's own advertiser accounts.

## Product rule

Ordinary customers never paste developer client IDs, app secrets, developer tokens, or API keys. Ferocity owns provider applications and secrets. Each customer clicks **Connect Account**, signs in at the provider, grants the requested permissions, and selects the business, Page, or advertising account Ferocity should use.

Authorization alone does not enable public posting, campaign edits, budgets, or spend. Those actions require the provider capability, workspace authority, approval policy, and financial controls to all permit the action.

## Implemented customer flow

The following is implemented locally:

- workspace-scoped OAuth state and callback validation;
- encrypted access/refresh token storage per tenant;
- provider account discovery for Google Ads, Meta, Reddit, Microsoft Advertising, LinkedIn, Pinterest, Snap, Amazon, and X Ads;
- read-only YouTube channel authorization and channel verification;
- automatic selection when exactly one eligible ad account is returned;
- explicit ad-account and Meta Page selection when several are available;
- connection/read status separated from live action status;
- disconnect and local credential revocation;
- no campaign publishing or spend enabled by connection alone.

## Provider matrix

| Provider | Customer authorization code | Account discovery | Provider-side production status | Customer live actions |
| --- | --- | --- | --- | --- |
| Google Ads | Implemented | Accessible Google Ads customers discovered through the official API when the platform developer token is active | Platform OAuth credentials are configured; production API access still must pass provider certification | Off |
| Meta Ads / Pages | Implemented with Facebook Login for Business | Ad accounts and Pages discovered after authorization | Meta app was published on 2026-09-25; Marketing API access remains limited/testing, so general-customer ad management still requires provider review/advanced access | Off |
| YouTube Channel | Implemented with Google OAuth, read-only first | Connected channel ID and title verified through the YouTube Data API | YouTube Data API is enabled in project `ferocity-502105`; production OAuth consent and one external-customer read certification remain. Upload scope is intentionally not requested yet. | Off |
| TikTok Login | Implemented | Basic connected identity only | Live in production since 2026-08-04 | Not an ads authorization |
| TikTok Ads (API for Business) | Implemented separately from Login Kit | Advertiser discovery implemented | Separate API for Business approval remains required | Off |
| Reddit Ads | Implemented | Businesses and owned ad accounts discovered through Ads API v3 | Ferocity developer app and redirect URI exist; production Ads API authorization/certification must still be verified | Off |
| Microsoft Advertising | Implemented | Signed-in user and accessible advertiser-account discovery implemented through Customer Management v13 | Platform credentials and developer token are configured; one controlled external-customer read certification remains required | Off |
| LinkedIn Ads | Implemented locally | Campaign Manager account discovery implemented | Ferocity-owned LinkedIn application and Marketing API product approval are still required | Off |
| Pinterest Ads | Implemented locally | Ad-account discovery implemented | Ferocity app `1616330` has active trial access; production callback and server credentials are configured. Standard access additionally requires Pinterest's OAuth/product video demo and reCAPTCHA-backed submission. | Off |
| Snap Ads | Implemented locally | Organization and nested ad-account discovery implemented | Ferocity-owned Snap organization and Marketing API OAuth app exist with the production callback. Business address, billing address, and funding remain intentionally incomplete ad-serving steps. | Off |
| Amazon Ads | Implemented locally | Eligible advertiser-profile discovery implemented | The non-Business identity attached to the 612 number was recovered and reached Partner Network registration, but Amazon requires a corporate-domain login email and rejects the current Diamond Homes Gmail identity. A working `@ferocity.live` mailbox must be confirmed and attached before the Partner Network/API application can be submitted. | Off |
| X Ads | Implemented locally with OAuth 1.0a | Advertiser-account discovery implemented | X confirmed Ads API access for App ID `33483039` on September 30; controlled customer OAuth/account-discovery certification remains | Off |

## Full adapter inventory

| Adapter | What exists locally | Honest next boundary |
| --- | --- | --- |
| Google Ads, including YouTube Ads | Provider-neutral paid-media definition, OAuth, account discovery, read/write capability contract | Production developer access, controlled read certification, then separately approved writes/spend |
| Meta Ads / Facebook / Instagram | OAuth, Page/ad-account discovery, published Meta app | Advanced Marketing API access and controlled external-customer certification |
| TikTok Ads | Separate API for Business adapter with advertiser discovery/reporting contracts | TikTok developer/app approval |
| Microsoft Ads | OAuth, Customer Management v13 account discovery, secure tenant token storage, and paid-media contract | Controlled external-customer production read certification |
| Reddit Ads | OAuth, business/ad-account discovery, paid-media contract | Ads API production approval and controlled certification |
| LinkedIn Ads | Provider-neutral capability, OAuth callback, secure tenant token storage, and account discovery | LinkedIn Marketing API product approval and Ferocity-owned OAuth app credentials |
| X Ads | Provider-neutral capability, signed OAuth 1.0a callback, secure tenant token storage, and advertiser-account discovery | X Ads API approval and Ferocity-owned application credentials |
| Pinterest Ads | Provider-neutral capability, OAuth callback, secure tenant token storage, account discovery, active trial app, and staged production credentials | Deploy the staged configuration when authorized, then complete one controlled read-only OAuth/account-discovery certification before enabling writes |
| Snapchat Ads | Provider-neutral capability, OAuth callback, secure tenant token storage, and organization/account discovery | Snap organization/OAuth app approval and credentials before exposing Connect Account |
| Amazon Ads | Provider-neutral capability, Login with Amazon callback, secure tenant token storage, and advertiser-profile discovery | Eligible Amazon Ads developer access and app credentials before exposing Connect Account |
| OpenAI Ads | Provider-neutral capability contract plus guided connection inventory | Eligible advertiser/partner access and an ad-account-scoped Advertiser API key stored in the tenant vault; OpenAI currently exposes no normal multi-tenant customer OAuth flow |
| Apple Ads | Provider-neutral capability contract plus guided invite/key inventory | Eligible App Store or Apple Maps advertiser account, minimum API-role invite, and Ferocity-managed OAuth key material |
| YouTube organic | Read-only Google OAuth and channel verification | YouTube Data API production certification; upload scope only after separate approval design |
| TikTok organic | Login Kit is live; Content Posting adapter exists separately | TikTok Content Posting product approval and audit |
| Facebook organic/community | Connector/worker and provider-neutral publishing contracts exist | Separate controlled publishing/community certification and policy-safe account operation |
| Yahoo DSP | Provider-neutral capability/fallback only | Yahoo must enable DSP API access for an eligible seat; the official DSP flow uses seat API credentials, not a normal customer "Sign in with Yahoo" ad authorization |

An adapter contract means Ferocity can plan, normalize, route, report status, and fall back without rewriting the core system. It does **not** mean a provider has granted production API access.

## Remaining provider-side actions

1. Complete Meta app review/advanced access for the permissions required by general-customer Marketing API use; the app itself is published.
2. Complete TikTok API for Business approval; do not treat the live Login Kit app as TikTok Ads approval.
3. Run one controlled external-customer OAuth certification per provider, select the returned account, sync read-only reporting, and record evidence.
4. Run a controlled Microsoft Advertising customer-account discovery certification with the production developer token and record the returned account-selection evidence.
5. Keep every write/spend capability disabled until its separate controlled certification succeeds.
6. YouTube Data API is enabled under Ferocity's Google project. Run one external-customer read-only channel connection before requesting upload scope.
7. Obtain and configure the Ferocity-owned LinkedIn application. For Amazon, the puzzle and OTPs succeeded, but both known mobiles already belong to Amazon identities and the recovered Diamond homes Amazon Business identity is ineligible for Partner Network. Use an eligible non-Business Amazon identity—possibly the personal identity attached to the 612 number—or create one with another owner-controlled SMS-capable mobile, then complete Partner Network/API enrollment and stage the resulting access. For Pinterest, record the required OAuth/product video and submit Standard access. Pinterest and Snap credentials are configured; after the next authorized deploy, run one controlled read-only customer connection for each before enabling writes.
8. X granted Ads API access to App ID `33483039` on September 30. Verify the approved access in the developer console, follow any token-regeneration instruction, and run the separate OAuth 1.0a read-only customer/account-discovery certification before enabling writes.
9. TikTok Business password recovery and Ads Manager login were completed September 30, 2026. The **Ferocity Ads** advertiser is accessible and Account Health reports **Good**. Continue with API for Business registration/app approval and Content Posting review; do not confuse this recovered Ads Manager access with those separate product grants.
10. Ferocity's OpenAI Ads Manager account exists as `adacct_6abc84c50aa0819b9ab16f20f7f2dcc6`; the Ferocity logo is saved. The persistent **Ferocity Production Connector** key is stored in the Git-ignored private vault, and official `GET /v1/ad_account` certification succeeded with account status `active` and advertiser review `in_review`. Billing remains unset, no campaign exists, and no spend is enabled. Wait for review; correct the legal advertiser name only through a separately authorized review-impacting change and add billing only with explicit payment authorization. Complete Apple Ads organization/API-role setup only if Ferocity is eligible; neither provider supports a fabricated one-click customer OAuth path.
11. Create or transfer a legitimate verified Ferocity Google Business Profile to an intended owner/manager identity, keep it active for Google's required period, and then submit project `905467079694` for GBP basic API access. The required GBP account, business-information, and performance APIs are already enabled; the current blocker is provider eligibility, not code or an API toggle.
12. Finish Google OAuth verification. The public Ferocity logo is uploaded and saved. Branding verification is blocked only by Search Console ownership: add the recorded `google-site-verification` TXT record (or later publish Google's HTML file in an explicitly authorized frontend deploy), verify ownership, wait Google's stated 24 hours, and rerun branding. Then reconcile the production scope list, record the OAuth demo, and submit sensitive/restricted-scope review.

## Provider categories that must not be conflated

- **YouTube Ads** is inventory inside the Google Ads adapter.
- **YouTube Channel** is a separate organic channel authorization.
- **OpenAI Ads** is an advertising-provider adapter only for eligible advertiser accounts; it is not the ChatGPT model connection.
- **OpenAI and xAI/Grok workers** belong to Ferocity's provider-neutral AI/action layer. They are not marketing account OAuth connectors. Ferocity does not publicly claim external-agent compatibility until the secure external identity, grant, token, rate-limit, redaction, approval, and audit boundary is exposed and certified.

## Deployment rule

Platform credentials and the honest connection-state model are deployed. Provider approvals and each customer's OAuth grant remain independent gates. A provider's external approval state must be checked immediately before enabling any customer write, publishing, campaign mutation, or spend capability.
