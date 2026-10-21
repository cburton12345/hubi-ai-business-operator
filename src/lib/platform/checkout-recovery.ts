import { queryPostgres } from "@/lib/db/postgres";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

type CheckoutRecoveryRow = {
  id: string;
  checkout_status: string;
  requested_plan: string | null;
  minutes_stalled: number;
};

const ACTIVE_CHECKOUT_STATUSES = new Set(["creating", "checkout_failed", "redirected", "provisioning"]);

function alertFor(row: CheckoutRecoveryRow) {
  const plan = row.requested_plan ?? "unknown plan";
  if (row.checkout_status === "provisioning") {
    return {
      severity: "critical" as const,
      type: "paid_provisioning_stalled",
      title: "A paid Ferocity workspace is stuck during setup",
      body: `Payment reached provisioning for the ${plan} plan, but setup has not completed after ${row.minutes_stalled} minutes. The durable checkpoint is preserved for an idempotent retry.`,
      notify: true,
    };
  }
  if (row.checkout_status === "checkout_failed") {
    return {
      severity: "high" as const,
      type: "checkout_creation_failed",
      title: "A Ferocity checkout could not reach Stripe",
      body: `A customer selected the ${plan} plan, but the checkout session could not be created. Their signup details remain saved for recovery.`,
      notify: true,
    };
  }
  if (row.checkout_status === "creating") {
    return {
      severity: "high" as const,
      type: "checkout_creation_stalled",
      title: "A Ferocity checkout stalled before Stripe",
      body: `A customer selected the ${plan} plan, but checkout did not advance to Stripe after ${row.minutes_stalled} minutes. Their signup details remain saved for recovery.`,
      notify: true,
    };
  }
  return {
    severity: "warning" as const,
    type: "checkout_abandoned",
    title: "A consented Ferocity checkout may need follow-up",
    body: `A customer reached Stripe for the ${plan} plan but has not completed payment after ${row.minutes_stalled} minutes. No message was sent automatically.`,
    notify: false,
  };
}

export async function scanFerocityCheckoutRecovery() {
  const result = await queryPostgres<CheckoutRecoveryRow>(
    `select id,coalesce(metadata_json->>'checkoutStatus','unknown') checkout_status,requested_plan,
       greatest(0,floor(extract(epoch from (now()-updated_at))/60))::int minutes_stalled
     from public.access_requests
     where request_type='paid_checkout'
       and created_at >= now()-interval '30 days'
       and (
         (metadata_json->>'checkoutStatus' in ('creating','provisioning') and updated_at < now()-interval '15 minutes')
         or (metadata_json->>'checkoutStatus'='checkout_failed' and updated_at >= now()-interval '7 days')
         or (metadata_json->>'checkoutStatus'='redirected' and updated_at < now()-interval '1 hour')
       )
     order by updated_at asc
     limit 100`,
  );
  const rows = result?.rows ?? [];
  const activeFingerprints: string[] = [];

  for (const row of rows) {
    if (!ACTIVE_CHECKOUT_STATUSES.has(row.checkout_status)) continue;
    const fingerprint = `checkout-recovery:${row.id}`;
    activeFingerprints.push(fingerprint);
    const alert = alertFor(row);
    await raisePlatformAdminAlert({
      fingerprint,
      family: "checkout_recovery",
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      actionUrl: "/app/platform-activity",
      notify: alert.notify,
      metadata: {
        accessRequestId: row.id,
        checkoutStatus: row.checkout_status,
        requestedPlan: row.requested_plan,
        minutesStalled: row.minutes_stalled,
        automaticCustomerContact: false,
      },
    });
  }

  await queryPostgres(
    `update public.platform_admin_alerts
     set status='resolved',resolved_at=now(),updated_at=now()
     where alert_family='checkout_recovery' and status <> 'resolved'
       and not (fingerprint = any($1::text[]))`,
    [activeFingerprints],
  );

  return {
    checked: rows.length,
    stalledProvisioning: rows.filter((row) => row.checkout_status === "provisioning").length,
    failedOrStalledCheckout: rows.filter((row) => row.checkout_status === "checkout_failed" || row.checkout_status === "creating").length,
    abandonedCheckout: rows.filter((row) => row.checkout_status === "redirected").length,
  };
}
