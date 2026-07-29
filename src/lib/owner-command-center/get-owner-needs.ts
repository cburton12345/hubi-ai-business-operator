import { missingEnvVars } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OwnerNeedPriority = "critical" | "high" | "medium" | "low";

export type OwnerNeed = {
  id: string;
  title: string;
  detail: string;
  category: string;
  priority: OwnerNeedPriority;
  actionLabel: string;
  href: string;
  count: number;
};

function n(value: unknown) {
  return Number(value ?? 0);
}

function pushIf(needs: OwnerNeed[], condition: boolean, need: OwnerNeed) {
  if (condition) {
    needs.push(need);
  }
}

function envNeed(id: string, title: string, missing: string[], href: string, priority: OwnerNeedPriority = "high"): OwnerNeed | null {
  if (missing.length === 0) return null;
  return {
    id,
    title,
    detail: `Missing ${missing.join(", ")}. Ferocity can prepare the work, but this connection cannot run live until those values are set.`,
    category: "Connection",
    priority,
    actionLabel: "Add keys",
    href,
    count: missing.length
  };
}

export async function getOwnerNeeds(): Promise<OwnerNeed[]> {
  const tenantId = await getCurrentWorkspaceId();
  const needs: OwnerNeed[] = [];

  const [ops, ownerEvents, reports, integrationGaps, activeSmsRoute] = await Promise.all([
    queryPostgres<{
      ops_review: string;
      field_proof: string;
      receipt_review: string;
      customer_drafts: string;
      payroll_exports: string;
      location_alerts: string;
    }>(
      `
      select
        (
          (select count(*) from public.operations_expenses where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_mileage_entries where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_material_logs where tenant_id = $1 and status = 'needs_review')
        )::text as ops_review,
        (select count(*) from public.operations_field_media where tenant_id = $1 and status = 'needs_review')::text as field_proof,
        (select count(*) from public.operations_receipt_extractions where tenant_id = $1 and status in ('needs_review','failed'))::text as receipt_review,
        (select count(*) from public.operations_customer_update_drafts where tenant_id = $1 and send_status in ('draft','approved','failed'))::text as customer_drafts,
        (select count(*) from public.operations_payroll_exports where tenant_id = $1 and status in ('draft','ready','failed'))::text as payroll_exports,
        (select count(*) from public.operations_location_pings where tenant_id = $1 and alert_status <> 'normal')::text as location_alerts
      `,
      [tenantId]
    ),
    queryPostgres<{
      needs_owner: string;
      critical: string;
      low_confidence: string;
    }>(
      `
      select
        (select count(*) from public.owner_command_events where (tenant_id = $1 or tenant_id is null) and (owner_attention = true or status = 'needs_owner'))::text as needs_owner,
        (select count(*) from public.owner_command_events where (tenant_id = $1 or tenant_id is null) and (severity = 'critical' or status = 'critical'))::text as critical,
        (select count(*) from public.owner_command_events where (tenant_id = $1 or tenant_id is null) and confidence_score < 60 and status not in ('resolved','ai_handled'))::text as low_confidence
      `,
      [tenantId]
    ),
    queryPostgres<{
      new_reports: string;
      upgrade_requests: string;
    }>(
      `
      select
        (select count(*) from public.website_grader_reports where created_at >= now() - interval '14 days')::text as new_reports,
        (select count(*) from public.business_health_report_upgrades where upgrade_status in ('stripe_not_ready','one_time_requested','subscription_requested','included_with_starter','included_with_growth','manual_follow_up','unlocked'))::text as upgrade_requests
      `,
      []
    ),
    queryPostgres<{
      provider_gaps: string;
    }>(
      `
      select count(*)::text as provider_gaps
      from public.integration_connections
      where tenant_id = $1
        and (
          status in ('not_connected', 'planned', 'error')
          or credentials_status in ('not_configured', 'missing', 'error')
        )
      `,
      [tenantId]
    ),
    queryPostgres<{ active_sms_route: string }>(
      `
      select count(*)::text as active_sms_route
      from public.tenant_messaging_accounts
      where tenant_id = $1
        and connection_status = 'active'
        and credentials_status = 'configured'
        and live_sending_enabled = true
        and outbound_enabled = true
      `,
      [tenantId]
    )
  ]);

  const opsRow = ops?.rows[0];
  const ownerRow = ownerEvents?.rows[0];
  const reportRow = reports?.rows[0];
  const gaps = n(integrationGaps?.rows[0]?.provider_gaps);
  const hasActiveSmsRoute = n(activeSmsRoute?.rows[0]?.active_sms_route) > 0;

  pushIf(needs, n(ownerRow?.critical) > 0, {
    id: "critical-owner-events",
    title: "Critical issue needs a decision",
    detail: `${n(ownerRow?.critical)} critical owner event(s) are open. These are the items Ferocity should not bury in reports.`,
    category: "Owner Command",
    priority: "critical",
    actionLabel: "Open queue",
    href: "/app/owner-command-center",
    count: n(ownerRow?.critical)
  });

  pushIf(needs, n(ownerRow?.needs_owner) > 0, {
    id: "owner-events",
    title: "Ferocity needs owner input",
    detail: `${n(ownerRow?.needs_owner)} event(s) are waiting because AI cannot confidently finish the next step alone.`,
    category: "Owner Command",
    priority: "high",
    actionLabel: "Review",
    href: "/app/owner-command-center",
    count: n(ownerRow?.needs_owner)
  });

  pushIf(needs, n(ownerRow?.low_confidence) > 0, {
    id: "low-confidence-events",
    title: "AI confidence is low on a decision",
    detail: `${n(ownerRow?.low_confidence)} item(s) need a human call before Ferocity marks them handled.`,
    category: "AI",
    priority: "medium",
    actionLabel: "Check",
    href: "/app/owner-command-center",
    count: n(ownerRow?.low_confidence)
  });

  pushIf(needs, n(opsRow?.customer_drafts) > 0, {
    id: "customer-update-drafts",
    title: "Customer updates are waiting",
    detail: `${n(opsRow?.customer_drafts)} drafted customer update(s) need review, a recipient, or a send decision.`,
    category: "Operations",
    priority: "high",
    actionLabel: "Open drafts",
    href: "/app/operations-workforce",
    count: n(opsRow?.customer_drafts)
  });

  pushIf(needs, n(opsRow?.payroll_exports) > 0, {
    id: "payroll-exports",
    title: "Payroll export needs review",
    detail: `${n(opsRow?.payroll_exports)} payroll export(s) are draft, ready, or failed. Ferocity should not send payroll/accounting data without an owner check.`,
    category: "Workforce",
    priority: "high",
    actionLabel: "Review export",
    href: "/app/operations-workforce",
    count: n(opsRow?.payroll_exports)
  });

  pushIf(needs, n(opsRow?.receipt_review) > 0, {
    id: "receipt-extractions",
    title: "Receipt extraction needs a human check",
    detail: `${n(opsRow?.receipt_review)} receipt(s) need review because totals, vendor, or confidence are not ready for accounting.`,
    category: "Workforce",
    priority: "medium",
    actionLabel: "Check receipts",
    href: "/app/operations-workforce",
    count: n(opsRow?.receipt_review)
  });

  pushIf(needs, n(opsRow?.field_proof) > 0, {
    id: "field-proof",
    title: "Field photos or videos need approval",
    detail: `${n(opsRow?.field_proof)} field proof item(s) can become customer proof, SEO material, or job records after review.`,
    category: "Proof",
    priority: "medium",
    actionLabel: "Review proof",
    href: "/app/operations-workforce",
    count: n(opsRow?.field_proof)
  });

  pushIf(needs, n(opsRow?.ops_review) > 0, {
    id: "ops-cost-review",
    title: "Costs need review",
    detail: `${n(opsRow?.ops_review)} expense, mileage, or material item(s) need review before job costing and reporting are clean.`,
    category: "Operations",
    priority: "medium",
    actionLabel: "Review costs",
    href: "/app/operations-workforce",
    count: n(opsRow?.ops_review)
  });

  pushIf(needs, n(opsRow?.location_alerts) > 0, {
    id: "location-alerts",
    title: "Worker location issue needs attention",
    detail: `${n(opsRow?.location_alerts)} location ping(s) are flagged. Check late arrivals, jobsite mismatch, or safety context.`,
    category: "Safety",
    priority: "high",
    actionLabel: "Check crew",
    href: "/app/operations-workforce",
    count: n(opsRow?.location_alerts)
  });

  pushIf(needs, n(reportRow?.upgrade_requests) > 0, {
    id: "growth-report-requests",
    title: "Business Grader follow-up is waiting",
    detail: `${n(reportRow?.upgrade_requests)} Blueprint or subscription follow-up request(s) need a sales or onboarding step.`,
    category: "Sales",
    priority: "high",
    actionLabel: "Open reports",
    href: "/app/website-grader",
    count: n(reportRow?.upgrade_requests)
  });

  pushIf(needs, n(reportRow?.new_reports) > 0, {
    id: "new-business-grader-reports",
    title: "New Business Grader reports came in",
    detail: `${n(reportRow?.new_reports)} recent report${n(reportRow?.new_reports) === 1 ? "" : "s"} can become outreach, onboarding, or a follow-up sequence.`,
    category: "Lead Gen",
    priority: "medium",
    actionLabel: "Review leads",
    href: "/app/website-grader",
    count: n(reportRow?.new_reports)
  });

  pushIf(needs, gaps > 0, {
    id: "provider-gaps",
    title: "Connections are keeping actions manual",
    detail: `${gaps} provider connection${gaps === 1 ? "" : "s"} ${gaps === 1 ? "is missing or needs" : "are missing or need"} attention. Ferocity can plan work, but live sending, billing, publishing, or imports stay limited until ${gaps === 1 ? "it is" : "they are"} fixed.`,
    category: "Connection",
    priority: "high",
    actionLabel: "Connect",
    href: "/app/integrations",
    count: gaps
  });

  const envNeeds = [
    envNeed("email-env", "Email sending needs keys", missingEnvVars(["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM_ADDRESS"]), "/app/credentials"),
    hasActiveSmsRoute
      ? null
      : envNeed("optional-sms-env", "Optional SMS is not connected", missingEnvVars(["ENABLE_TWILIO_SMS_SENDS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]), "/app/credentials", "low"),
    envNeed("stripe-env", "Checkout and paid reports need Stripe keys", missingEnvVars(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]), "/app/billing"),
    envNeed("owner-intake-env", "Connected platform intake needs a token", missingEnvVars(["OWNER_COMMAND_CENTER_TOKEN"]), "/app/lifeops-connections"),
    envNeed("workforce-intake-env", "Worker app intake needs a token", missingEnvVars(["WORKFORCE_INTAKE_TOKEN"]), "/app/operations-workforce")
  ].filter((need): need is OwnerNeed => Boolean(need));

  needs.push(...envNeeds);

  return needs.sort((a, b) => {
    const order: Record<OwnerNeedPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority] || b.count - a.count || a.title.localeCompare(b.title);
  });
}
