# Jobber native read-analysis connection

**Status:** Implemented locally and database-applied; production credentials are staged in Netlify; no deploy was performed.

## What is complete

- A Ferocity Jobber developer application exists with broad read scopes for clients, requests, quotes, jobs, scheduled items, invoices, payments, users, custom-field configurations, tax rates, expenses, timesheets, vehicles/equipment, and marketing.
- Ferocity's code requests read-only Jobber scopes. A live review on August 2, 2026 confirmed broad read access to clients, requests, quotes, jobs, scheduled items, invoices, payments, Jobber Payments information, expenses, users/timesheets, equipment, marketing, and custom fields. The Jobber Tax Rates scope is now off and the draft was saved, removing the earlier authorization-screen warning about editing tax rates. All visible object write checkboxes remain off. OAuth access is still intentionally unapproved pending the release callback.
- The exposed client secret was regenerated. The new client ID, rotated secret, and production callback URL are stored as Netlify production environment variables.
- Native OAuth uses authorization-code flow, state validation, PKCE S256, a ten-minute authorization window, encrypted PKCE verifier storage, encrypted access/refresh tokens, and account identity verification.
- Refresh-token rotation overwrites the prior refresh token. Provider credentials remain tenant-scoped in Ferocity's existing credential vault.
- Ferocity's first read model imports bounded, cursor-paginated summaries of clients, requests, quotes, jobs, and invoices. It records query cost and synchronization cursors.
- External records remain explicitly provider-owned. They are stored in a tenant-isolated analysis table and do not become a second operational Jobber database.
- Jobber write-back is off. The signed middleware bridge remains available as a fallback and was not replaced.

## Why the first sync is intentionally focused

Ferocity needs the customer, pipeline, work, estimate, and receivables picture first. Those five object families are enough to analyze lead conversion, quote follow-up, schedule/workload, uninvoiced work, invoice aging, and customer value without pulling every attachment or deeply nested record and consuming unnecessary Jobber query cost.

The broader approved read scopes are available for later object-specific adapters after their GraphQL shapes are certified in the Jobber test account. Scheduled items, payments, team/timesheets, expenses, equipment, custom fields, tax rates, and marketing should be added incrementally to this same read model rather than as duplicate systems.

## Remaining external certification

1. Deploy the already-tested local release when the owner explicitly authorizes it.
2. From Ferocity, connect a controlled Jobber developer test account through OAuth.
3. Run the first read sync and compare sample counts/records against Jobber.
4. Test token refresh, reconnect, disconnect, expired authorization, throttling, and partial-page recovery.
5. Configure signed Jobber webhooks only after the deployed endpoint exists; keep polling/backfill as the recovery path.
6. Before connecting more than five paying Jobber accounts, complete Jobber's app review/marketplace process.

Official references: [Jobber OAuth](https://developer.getjobber.com/docs/building_your_app/app_authorization/), [GraphQL requests](https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/), [rate limits](https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/), [refresh-token rotation](https://developer.getjobber.com/docs/building_your_app/refresh_token_rotation/), and [webhooks](https://developer.getjobber.com/docs/using_jobbers_api/setting_up_webhooks/).
