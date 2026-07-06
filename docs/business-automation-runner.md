# Ferocity Business Automation Runner

Ferocity now has a protected tenant-safe runner for the core operating loop:

```text
POST /api/business-automation/run
Authorization: Bearer <AI_WORKFORCE_CRON_TOKEN>
```

The runner is designed for a scheduler such as Netlify Scheduled Functions, UptimeRobot, GitHub Actions, Render cron, or another trusted cron caller.

What it does:

- Finds active/trial tenants.
- Ensures default AI Monitoring sources exist.
- Scans the outbound action queue for customer drafts, follow-ups, review requests, publishing items, calendar sync items, and consent records.
- Reopens failed queue items for human review up to a safe retry limit.
- Generates tenant daily owner briefs.
- Runs due AI Workforce agent workflows.
- Logs the run to each tenant timeline.

What it does not do by itself:

- Send SMS.
- Send customer email.
- Publish content.
- Change ads.
- Move money.
- Sync calendars live.

Those actions still require plan tier, service controls, provider readiness, consent checks, and approval/live-action policies.

Useful local test:

```powershell
$headers = @{ Authorization = "Bearer $env:AI_WORKFORCE_CRON_TOKEN" }
Invoke-RestMethod -Method Post -Uri "http://localhost:3032/api/business-automation/run?tenantLimit=1&agentLimit=5" -Headers $headers
```

Recommended production cadence:

- Every 15 minutes: `tenantLimit=100&agentLimit=25`
- Daily morning brief check: same endpoint is acceptable because brief generation upserts one brief per tenant per day.
