# Phase 18 Workspace Alerts

Phase 18 adds manual operator alerts for external customer workspaces. Alerts help the business see what needs attention without sending messages, changing budgets, publishing content, or connecting external platforms.

## Delivered

- Workspace-scoped `operator_alerts` table with severity, category, status, action link, and resolution tracking.
- Manual alert scan for stale leads, lead volume drops, pending approvals, public form errors, app errors, AI fallback usage, and pending export packages.
- `/app/alerts` dashboard where operators can refresh alerts, review linked work, and mark alerts resolved.
- Reports now show active alert count.
- Main app navigation and dashboard quick links include Alerts.

## Safety

- Alerts are internal review items only.
- No notifications are sent automatically.
- No external APIs are connected.
- Resolving an alert does not mutate the underlying lead, approval, form, AI run, or export data.
