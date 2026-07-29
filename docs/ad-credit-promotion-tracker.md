# Ferocity Ad Credit Promotion Tracker

Last checked: July 8, 2026.

Goal: make sure Ferocity and customer onboarding capture legitimate new-advertiser credits before any paid campaigns go live.

Promotions change often. Always confirm the official offer page immediately before creating a new ad account, adding payment, or launching spend.

## Current Promo Leads To Check

### Reddit Ads

- Official signup page: `https://ads.reddit.com/register`
- Current visible offer: `$500 in ad credit when you spend $500`
- Best use: Ferocity launch ads, business grader ads, local service lead magnets, Reddit community retargeting tests.
- Action before account creation:
  - Create the account from the promo/signup path.
  - Screenshot or save the offer terms.
  - Confirm whether the account must be new.
  - Confirm spend threshold and expiration.
  - Confirm whether the credit applies automatically or requires a code.

### Microsoft Advertising

- Official consultation/credit form: `https://about.ads.microsoft.com/en/forms/agency-center-contact`
- Current visible offer: `$500 in Microsoft Advertising ad credits`
- Current visible deadline: offer expires `June 30, 2026`
- Key conditions from the visible page:
  - New Microsoft Advertising customers in the United States.
  - Primary payment method required.
  - Credit expires if unused after the stated period.
  - Ads can keep spending after credit is exhausted.
- Best use: Bing/Yahoo/DuckDuckGo search tests, lower-cost local search, B2B/service search, retargeting.
- Action before account creation:
  - Submit the consultation/credit form before creating or spending from the account if the offer requires it.
  - Save offer terms.
  - Set budget caps before launch.

### Google Ads

- Official promo credit terms: `https://ads.google.com/intl/en_us/home/terms-and-conditions/incentives/`
- Current status: Google has promotional credit terms for eligible new advertisers, but the exact spend/get amount varies by country, offer, recipient, and signup path.
- Best use: high-intent local search, branded search protection, call/form lead tests, remarketing once conversion tracking is ready.
- Action before account creation:
  - Search from the business owner account for the active Google Ads new advertiser promo.
  - Start account creation from the official promo path when available.
  - Confirm billing country, offer code/auto-credit, required spend, and expiration.
  - Add conversion tracking before significant spend.

### Meta / Facebook / Instagram

- Official ad credit help: `https://www.facebook.com/business/help/131439120265224`
- Claim help: `https://www.facebook.com/business/help/103748816383197`
- Current status: Meta ad credits are usually account-specific, invitation-specific, coupon-specific, or partner-issued rather than a predictable public new-account credit.
- Best use: local proof ads, before/after posts, review/testimonial creative, lead forms, retargeting, trailer/rental/community ads.
- Action before account creation:
  - Check Business Manager billing/payment settings for an available ad credit.
  - Check email/account notifications for Meta coupon offers.
  - Save terms before applying.
  - Confirm Special Ad Category rules if the offer/business touches housing, employment, credit, financial products, politics, or regulated topics.

### TikTok Ads

- Official signup page: `https://ads.tiktok.com/i18n/signup/`
- Account created: Business Center `7666569313026654224`, ad account `7666569270685155345`.
- Visible signup offer on July 25, 2026: `Get up to USD 6000 ads credit for new account`.
- Account-specific status on July 25, 2026:
  - Email and phone are attached to the TikTok Ads user profile.
  - Ads Manager still shows: `Your advertising agreement is not effective yet or has already expired. No new ads can be delivered. Please contact the sales team.`
  - Promotions page is reachable at `/i18n/account/payment_promotion?aadvid=7666569270685155345`, but shows `0.00 USD` available ad credit and no coupon rows.
  - Payment page is reachable at `/i18n/account/payment?aadvid=7666569270685155345`, but says payment setup is incomplete.
  - No payment method was added and no campaign spend was launched.
- Action before spend:
  - Resolve the advertising agreement/account delivery warning.
  - Complete payment setup only after budget gates are verified and the owner intentionally approves it.
  - Confirm whether the `up to USD 6000` signup offer needs a redeem code, sales contact, or a billing setup step before it appears in Promotions.
  - Save the spend threshold, eligible campaign objective, issue date, expiration date, and whether the coupon auto-applies.
  - Set hard budget caps before launching the first TikTok test.

## Ferocity Onboarding Rule

Before a customer launches paid ads, Ferocity should ask:

1. Is this a new ad account?
2. Is there an official promo path available?
3. Does the promo require a specific signup link or consultation form?
4. Does the promo require a minimum spend?
5. When does the credit expire?
6. Can ads continue spending after the credit is used?
7. Is a payment method required?
8. Are there special category or regulated-industry restrictions?
9. Has a hard daily/monthly budget cap been set?
10. Is conversion tracking ready before spend starts?

## Ferocity Product Follow-Up

Add a future checklist inside `/app/integrations` or `/app/marketing`:

- "Claim available ad credits"
- "Save promo terms"
- "Set budget cap"
- "Verify conversion tracking"
- "Launch only after approval"

This should be part of the customer growth setup, not buried in advanced settings.
