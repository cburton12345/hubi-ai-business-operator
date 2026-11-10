import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function normalizedSource(url: URL) {
  return readFileSync(url, "utf8").replace(/\r\n/g, "\n");
}

const leadAdvanceSource = normalizedSource(
  new URL("../leads/advance-incoming-leads.ts", import.meta.url),
);
const recoverySource = normalizedSource(
  new URL("../customer-lifecycle/prepare-context-aware-followups.ts", import.meta.url),
);
const revenueLoopSource = normalizedSource(
  new URL("./revenue-loop-automation.ts", import.meta.url),
);
const inboundSource = normalizedSource(
  new URL("../messaging/record-inbound-response.ts", import.meta.url),
);
const revenueDashboardSource = normalizedSource(
  new URL("./get-revenue-growth-dashboard.ts", import.meta.url),
);

describe("revenue contact safety contract", () => {
  it("does not create conversations or initial replies for linked duplicate leads", () => {
    expect(leadAdvanceSource.match(/not \(l\.metadata_json \? 'duplicateOfLeadId'\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("does not reactivate duplicate, opted-out, or already-responding leads", () => {
    expect(recoverySource).toContain("not (l.metadata_json ? 'duplicateOfLeadId')");
    expect(recoverySource).toContain("lead.consent_to_contact=true");
    expect(recoverySource).toContain("public.customer_response_stops stop");
    expect(revenueLoopSource.match(/public\.customer_response_stops stop/g)?.length).toBeGreaterThanOrEqual(3);
    expect(revenueLoopSource.match(/duplicateOfLeadId/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("cancels pending outreach through contact and authoritative record links", () => {
    expect(inboundSource).toContain("target_type = 'follow_up_workflow'");
    expect(inboundSource).toContain("target_type = 'communication_message'");
    expect(inboundSource).toContain("target_type = 'messaging_conversation'");
    expect(inboundSource).toContain("target_type = 'lead'");
    expect(inboundSource).toContain("target_type = 'customer'");
    expect(inboundSource).toContain("right(regexp_replace(coalesce(recipient_label, ''), '\\\\D', '', 'g'), 10)");
  });

  it("aggregates revenue and cost once per lead instead of multiplying joined records", () => {
    expect(revenueDashboardSource).toContain("left join lateral (\n        select coalesce(sum(greatest(payment.amount_cents-payment.refunded_amount_cents,0)), 0)::bigint as collected_cents");
    expect(revenueDashboardSource).toContain("coalesce(sum(appointment_count), 0)::text as appointments");
    expect(revenueDashboardSource).toContain("coalesce(sum(sale_count), 0)::text as sales");
    expect(revenueDashboardSource).not.toContain("left join public.service_invoice_payments p on p.tenant_id = l.tenant_id");
  });
});
