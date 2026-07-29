# QA Workspace Seed

Use this only for a safe QA workspace. It creates fake records under tenant slug `ferocity-qa-demo` and does not target customer workspaces.

## Seed Or Reseed

Set a QA password first:

```powershell
$env:QA_DEMO_PASSWORD="replace-with-a-local-test-password"
npm run db:seed:qa
```

To reset the QA workspace first:

```powershell
$env:QA_DEMO_PASSWORD="replace-with-a-local-test-password"
$env:CONFIRM_QA_SEED_RESET="YES"
node scripts/seed-qa-workspace.mjs --reset
```

## Seeded Coverage

- One new lead
- One scored lead
- One customer
- One estimate with line item
- One completed job
- One unpaid/partially paid invoice
- One payment request
- One recorded payment
- One ledger entry
- One review-ready completed job workflow
- One owner reminder as an automation action
- One deliberate non-production warning in `app_error_events`

The reset path deletes only the tenant named `Ferocity QA Demo` with slug `ferocity-qa-demo`.
