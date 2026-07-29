create unique index if not exists idx_revenue_appointments_service_job_unique
  on public.revenue_appointments(tenant_id, service_job_id)
  where service_job_id is not null;

create unique index if not exists idx_revenue_appointment_reminders_unique
  on public.revenue_appointment_reminders(tenant_id, appointment_id, reminder_key)
  where appointment_id is not null;

create index if not exists idx_revenue_appointment_reminders_due
  on public.revenue_appointment_reminders(tenant_id, status, scheduled_for)
  where status in ('planned', 'needs_approval', 'queued', 'failed');

create unique index if not exists idx_revenue_followup_enrollment_lead_unique
  on public.revenue_followup_enrollments(tenant_id, sequence_id, lead_id)
  where sequence_id is not null and lead_id is not null;
