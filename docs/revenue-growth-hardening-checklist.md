# Revenue Growth Hardening Checklist

Status: local implementation and verification checklist.

## Completed locally

1. Provider readiness cleanup
   - Credentials page links to provider setup, ad credits, and env key checklist.
   - Added a clear "Add Keys Later" note.

2. Revenue Growth scan button polish
   - Changed the main action to "Find Money Leaks."

3. Revenue Growth empty states
   - Added plain start steps for connecting sources, scanning, approving work, and tracking money.
   - Empty states now tell the user what to do next.

4. Onboarding path update
   - Welcome page routes "more booked income" to Revenue Growth.

5. Key/env checklist
   - Added `docs/ferocity-env-key-checklist.md`.
   - Updated `.env.example` for Reddit, TikTok, Microsoft Ads, and Yahoo Ads.

6. Conversion event test mode UI
   - Added "Mark ready" and "Skip" actions.
   - Marking ready does not upload anything to ad platforms.

7. Appointment/show-rate workflow
   - Added a safe appointment reminder sequence with confirmation, 24-hour, 3-hour, and 30-minute steps.
   - Scheduled service jobs synchronize into deduplicated revenue appointments.
   - The business automation loop materializes due reminders and conversion feedback events.

8. Qualification form UI
   - Qualification forms are now visible on Revenue Growth.
   - Starter form creation avoids duplicate starter forms.

9. Revenue Advisor actions create work
   - Estimate recommendations create follow-up workflow items.
   - Cash collection recommendations create invoice follow-up items.
   - Appointment recommendations create reminder sequences.
   - Qualification recommendations create the starter qualification form.

10. Funnel packages create operating records
   - Ad Autopilot packages now activate a qualification form and qualified-lead follow-up sequence.
   - Qualified leads enroll once, stop on reply/booking/sale/opt-out, and advance after a completed send.

11. Guarded automatic execution
   - The action queue honors owner-granted automatic email/SMS authority.
   - Automatic sends still require contact consent, no suppression, an enabled service/plan, provider readiness, and remaining provider-cost budget.
   - A Netlify scheduled function invokes the existing business automation route every 15 minutes after deployment.

12. Local QA
   - Typecheck and lint are part of the verification pass.
   - Build/public guard must pass before deploy.

13. Deploy
   - Held until explicitly requested because Netlify deploys are limited.
   - Apply migrations 118, 119, and 120 before or with the next release.
   - Confirm `AI_WORKFORCE_CRON_TOKEN` is set before enabling the scheduled automation function.

## Still requires keys or account connections

- Live ad uploads
- Live customer email/SMS sends without a configured provider, consent, and owner authority
- Google/Meta/Reddit/TikTok/Microsoft/Yahoo OAuth
- Managed payment processing and payouts
- Production webhook verification

Those are not fake-live in this pass. The UI stays safe until credentials and approvals exist.
