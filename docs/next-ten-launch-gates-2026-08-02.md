# Ferocity: next ten launch gates

Completed locally on 2026-08-02. No frontend deployment was performed.

1. **Secret exposure — pass.** No high-risk credential patterns were found in scanned workspace files. Only `.env.example` is tracked; `.env.local` and `.private/` are ignored.
2. **Database migrations and RLS — pass.** Zero pending migrations. Tenant-table coverage and sensitive-table grants pass verification.
3. **Public/auth routes — pass.** Homepage, demo, plans, signup/start, login, reset, health, install, grader, worker intake, and protected-app redirect all rendered correctly.
4. **Stripe safety — pass with one remaining live certification.** Five live prices are readable; a checkout session was created and expired without payment. Stripe Connect has charges and payouts enabled with no requirements due. A low-dollar tenant invoice still needs a real controlled payment.
5. **Email readiness — pass.** Resend credentials work and the `ferocity.live` sending domain is verified. No test email was sent during this gate.
6. **Failure isolation — pass.** Invalid Stripe and voice webhooks were rejected while application health and the homepage remained available. Fourteen provider capability lanes pass isolation checks.
7. **Command/workflow readiness — pass with Golden Loop pending.** Ask Ferocity command tests pass. Fifty-four AI workflows are healthy with no stuck or failed runs. The live Golden Business Loop remains uncertified.
8. **Capacity — pass for the local release gate.** Database connections were 13/60 with no active alerts. A 250-request, concurrency-20 test completed with zero failures at approximately 96 requests/second and p95 846 ms.
9. **Incident fallback — local pass; external fallback pending.** `/status`, `/health`, and dependency-free `/emergency.html` respond correctly. A separately hosted status service and external uptime monitor are still required for a total Netlify/DNS outage.
10. **Truth in marketing — pass.** Public claims retain provider-connection, authorization, prepared-work, and manual-fallback qualifiers. A new automated guard blocks common absolute claims such as unlimited provider usage, guaranteed results, or unsupported universal provider coverage.

## Remaining actions that require a controlled live event or outside account

- Replace the Netlify token previously exposed in chat, privately.
- Deploy once when explicitly approved.
- Complete Jobber OAuth against the deployed callback.
- Supply TikTok client configuration and verify refresh.
- Complete one approved Retell call.
- Complete one low-dollar tenant invoice payment.
- Certify one full Golden Business Loop.
- Configure a status service outside Netlify and an external uptime monitor.
