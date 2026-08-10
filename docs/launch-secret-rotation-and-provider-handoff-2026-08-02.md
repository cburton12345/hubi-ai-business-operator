# Launch secret rotation and provider handoff

Status: pre-deploy. Production deployment remains intentionally blocked until the owner handoff is complete.

## Why rotation is required

Production environment values were exposed in local diagnostic output during launch preparation. No secret values belong in this document, source control, logs, screenshots, or chat. Assume every value visible in that output is compromised and replace it before launch.

## Do not rotate the credential vault key blindly

The credential vault currently contains two configured TikTok credential records in the `ferocity-qa-demo` tenant. Both records were verified decryptable with the current key on August 2, 2026.

`CREDENTIAL_ENCRYPTION_KEY` must therefore be rotated only with a dual-key migration or a controlled decrypt/re-encrypt operation. Replacing the environment value by itself would make those records unreadable.

## Safe rotation order

1. Freeze production deploys and provider authorization changes.
2. Create replacement provider credentials in each provider dashboard without revoking the old value yet.
3. Set replacement application values in Netlify as secret-scoped environment variables.
4. Create a deploy preview and run the relevant provider smoke test.
5. For `CREDENTIAL_ENCRYPTION_KEY`, stage the old value as `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS`, stage the replacement as `CREDENTIAL_ENCRYPTION_KEY`, deploy the dual-key reader, run `npm run db:rotate-credential-vault` first as a dry run and then with `CONFIRM_CREDENTIAL_VAULT_ROTATION=YES`, and only remove the previous key after every record verifies.
6. Publish one production deploy after every required replacement is staged.
7. Run production health, checkout, email, webhook-signature, OAuth callback, and provider-lane checks.
8. Revoke old provider credentials only after production verification passes.
9. Record the rotation date and next rotation date without storing any secret value.

## Values requiring replacement before launch

- Netlify personal access/OAuth token.
- Application internal automation and webhook tokens that appeared in diagnostic output.
- Database URL/password.
- Supabase service-role credentials.
- Resend API key and inbound-signing material.
- OpenAI API key.
- Push-notification private key.
- Any third-party OAuth client secret or provider key that appeared in the same output.
- Security HMAC material.
- Credential vault encryption key, using the re-encryption procedure above.

## Provider/account owner handoff

These actions require the account owner because they create credentials, grant persistent access, submit identity/bank information, accept provider terms, or authorize spend:

- Stripe Connect identity, bank onboarding, and the daily automatic payout choice were submitted by the owner. Stripe subsequently activated both card payments and payouts. A read-only Accounts v2 check showed no current, past-due, or future requirement groups, and Ferocity's stored account state was reconciled to `connected` without a frontend deployment or financial transaction.
- The existing Stripe Connect account contact was corrected through Stripe Accounts v2 to the established Ferocity business email and verified through a live read. New onboarding rejects `.local`, localhost, reserved example-domain, and malformed contact emails so the placeholder cannot recur.
- Run controlled inbound and outbound Retell calls after choosing safe test destinations. Do not create another API key: the Ferocity workspace already has an existing masked production key named `Ferocity LiveWebhook`, and the corresponding Retell configuration is already present in Netlify.
- Add Twilio or another messaging-provider credentials only if managed SMS is part of the initial launch. BYO and non-SMS fallbacks remain available without it.
- Finish OAuth consent for the production Google, Microsoft, Reddit, and Jobber accounts after the production callback URLs are deployed.
- The waiting Jobber OAuth screen must still be approved after the release callback is deployed. The Jobber draft has been saved with Tax Rates off and visible object write permissions off; its remaining broad read access matches Ferocity's coexistence design. The app is still a draft and has not completed Jobber marketplace approval.
- Create Meta, TikTok, and Yahoo developer credentials only for channels included in the initial release. Do not present unconnected channels as live.
- Add at least one real review destination when a business profile exists; retain the private-feedback fallback when it does not.

## Evidence already verified

- No common live-key, private-key, or personal Netlify-token patterns were found in source-controlled application files.
- The credential vault has two encrypted records, both decrypt successfully, and none are marked `needs_encryption_key`.
- Stripe subscription prices and checkout-session creation passed a live read-only/expire smoke.
- The deployed public Starter checkout returned a real Stripe Checkout session, the controlled session was expired, and its temporary access-request record was removed. Ferocity subscription checkout is therefore independent of the still-incomplete tenant Stripe Connect onboarding.
- A real Resend message reached final `delivered` status.
- The Retell `Ferocity` workspace is on Pay As You Go with a $10.00 balance and a 20-call concurrency allowance. It contains the existing `Ferocity LiveWebhook` API key, the `Ferocity AI Support` agent, and the active Ferocity Support number `+1 (888) 256-6005`. The number is assigned to that agent for both inbound and outbound calls. No paid call was placed during this audit.
- Four replacement internal application secrets (`ADMIN_ACCESS_TOKEN`, `AI_WORKFORCE_CRON_TOKEN`, `SECURITY_HMAC_KEY`, and `FEROCITY_MESSAGING_WEBHOOK_SECRET`) are staged in Netlify for production and deploy previews. They will not affect the currently deployed site until the authorized release.
- Invalid Stripe and Retell webhooks were rejected without taking down the homepage or health endpoint.
- Production build, TypeScript, lint, migration validation, and targeted security/workflow tests pass locally.
- The post-fix gate passed across 229 routes, 207 component files, 41 connected workflows, TypeScript, lint, and a production build. Workflow health is clean and database usage measured 8 of 60 connections (13.3%) with no active alerts.
- After the final Stripe recovery and readiness additions, the complete unit suite passed 264 tests across 77 files and the full production build gate passed again. A local production-server load test passed 160/160 GET requests at concurrency 12 with 0% errors, 569 ms p95, and 762 ms p99.
- The Stripe emergency backup code is stored outside the repository at `C:\Users\schem\AppData\Local\Ferocity\Secure\stripe-emergency-backup.dpapi`, encrypted with current-user Windows DPAPI. It was decrypt-and-match verified, never written as plaintext, and removed from the clipboard.
- Live Stripe Accounts v2 readiness now confirms active card payments, active payouts, no requirement groups, and no drift between Stripe and Ferocity's database. Subscription checkout remains a separate verified lane.
- The currently deployed Stripe Connect route still contains an obsolete `stripe_balance` capability request and returns an error. The local release removes that field and passes all gates. A controlled direct Accounts v2 recovery path was added so onboarding could continue without deploying or creating a duplicate account.
- Jobber's app draft was saved with Tax Rates off and visible write checkboxes off. The authorization grant itself remains unapproved.
- Provider failure isolation passed: invalid Stripe and Retell webhook requests were rejected while `/health` and the homepage remained available. Fourteen provider capability lanes and the provider-promotion guard passed.
- Migration `171_sharpen_homepage_hero.sql` validates transactionally but remains pending until the authorized deployment. RLS checks pass. Golden-loop certification remains `not_tested`; local wiring evidence is not presented as live third-party completion.
- The provider credential audit now checks every tenant instead of only the internal tenant. It found the encrypted TikTok access token expired while its refresh token remains healthy. Native TikTok refresh support and a regression test were added; production refresh still requires the staged TikTok client credentials and remains non-live until verified.
- Retell call preflight confirms the provider credential and phone record exist, but Ferocity intentionally keeps live actions, inbound calls, outbound calls, and compliance approval disabled. No call was placed. One controlled call still requires a safe destination and explicit enablement.
- Jobber OAuth preflight confirms the database lane remains planned and write-back disabled. Local source does not contain the client credentials, and authorization must wait for the release callback; no duplicate OAuth grant was created.

## August 2 ownerless completion pass

The next ten non-deployment launch tasks were completed as far as they can be without pretending third-party actions occurred:

1. Reconciled the launch branch and provider handoff.
2. Added truthful Stripe `pending_review` handling and tests.
3. Added safe Stripe Connect provider/database reconciliation and used it after Stripe approval.
4. Reverified live subscription prices and created then expired a no-payment Checkout session.
5. Added Retell controlled-call preflight and reran the transactionally rolled-back receptionist data path.
6. Added Jobber OAuth readiness for callback, encrypted-token, and stale-job state.
7. Added all-tenant encrypted credential and rotation-health auditing plus TikTok refresh support.
8. Reverified golden-loop ordering, 54 active workflows, provider lanes, authority handling, review fallbacks, retry/failure isolation, and database tenant boundaries.
9. Passed 267 tests, RLS, pending-migration validation, TypeScript, lint, production build, source secret-pattern scanning, capacity checks, and a 160-request local load test with zero errors.
10. Updated this handoff with the exact owner-only and post-deploy checkpoints.

Production was not deployed.
- Production remains unchanged.

## Release rule

Do not call the release certified until a controlled real golden loop records the lead, qualification, accepted estimate, scheduled and completed visit, low-dollar invoice payment, review request, approved proof, and approved growth action. Provider-specific call, SMS, payment, OAuth, and publishing lanes must also be certified independently.
