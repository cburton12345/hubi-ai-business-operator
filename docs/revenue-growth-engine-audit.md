# Revenue Growth Engine Audit

## Existing Ferocity systems reused

- `leads`: source, source detail, qualification status, lead score, consent, priority, status, assignment, and metadata.
- `customers`: customer records connected back to source leads.
- `service_estimates`: proposal/signed-sale value, status, customer, brand, and source lead.
- `service_jobs`: scheduled/completed work, assignment, service area, estimate, customer, and source lead.
- `service_invoices`: invoiced revenue, amount paid, due dates, and outstanding balance.
- `service_invoice_payments`: collected payments, payment status, fees, and net amount.
- `operations_worker_payments` and `job_material_list_items`: job cost inputs for gross profit estimates.
- `growth_sources`, `growth_attribution_events`, `analytics_events`, `external_metric_snapshots`: existing marketing/source reporting.
- `marketing_ad_experiments`, `marketing_campaign_recommendations`, and Marketing OS: campaign planning and ad launch kit records.
- `operator_timeline_events`, `owner_command_events`, `activity_logs`: timeline, owner alerts, and audit history.
- `workspace_feature_entitlements`: feature availability and plan visibility.

## New foundation added

The Revenue Growth Engine adds focused tables instead of duplicating core CRM/service/payment records:

- `revenue_lead_scores`
- `revenue_attribution_records`
- `revenue_appointments`
- `revenue_appointment_reminders`
- `revenue_followup_sequences`
- `revenue_followup_steps`
- `revenue_followup_enrollments`
- `revenue_goals`
- `revenue_recommendations`
- `revenue_conversion_event_queue`
- `revenue_qualification_forms`
- `revenue_qualification_questions`
- `revenue_case_studies`
- `revenue_case_study_metrics`

## Phase 1 and Phase 2 scope

- Revenue Growth dashboard over existing live workspace data.
- Lead qualification scoring foundation.
- Appointment/show-rate tracking foundation.
- Source-to-payment attribution records.
- Follow-up sequence foundations.
- Revenue goals and backward forecast math.
- Revenue Advisor recommendations with approval/dismiss/snooze states.
- Owner alert/event output when the scan finds money leaks.

## Deferred Phase 3 and Phase 4

- Full visual landing-page and VSL editor.
- Transcript/call-recording analysis and objection library.
- Direct ad-platform conversion uploads.
- Advanced multi-touch attribution model tuning.
- Automated campaign recommendation loops that change live campaigns.

All direct customer messages, ad spend, publishing, and external conversion uploads remain approval-gated.
