# Phase 46 Future Automation Console

Phase 46 adds internal marketing automation rules and run history while keeping all external actions manual.

## What Changed

- Added `marketing_automation_rules` for recurring SEO post drafts, Google Business Profile post drafts, Facebook post drafts, review request campaigns, follow-up sequences, nurture messaging, and reporting summaries.
- Added `marketing_automation_runs` for auditable run history.
- Added `/app/automation` with rule visibility, recent runs, and a manual workspace automation runner.
- The runner queues and processes AI draft/recommendation work for the selected workspace and records automation runs.

## Guardrails

- Automations create draft/review work only.
- No public content is published automatically.
- No messages, review responses, ad budgets, billing actions, or external platform updates are sent.
- External integrations remain future placeholders.
