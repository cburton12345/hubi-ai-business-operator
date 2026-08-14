import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";

export type PublicEstimate = {
  shareLinkId: string;
  tenantId: string;
  estimateId: string;
  customerId: string;
  organizationName: string;
  customerName: string;
  customerEmail: string;
  title: string;
  status: string;
  shareStatus: string;
  total: string;
  paymentTerms: string;
  depositRequired: string;
  acceptanceNotes: string;
  customerIntro: string;
  customerScopeSummary: string;
  customerExclusions: string;
  customerNextSteps: string;
  showLineItemPrices: boolean;
  showQuantities: boolean;
  depositPaymentUrl: string;
  depositPaymentStatus: string;
  acceptanceReceipt: {
    id: string;
    signedName: string;
    signedAt: string;
    documentVerification: string;
  } | null;
  lineItems: { id: string; name: string; description: string; quantity: string; unitPrice: string; total: string; optional: boolean; selected: boolean }[];
};

export async function getPublicEstimate(publicToken: string): Promise<PublicEstimate | null> {
  const result = await queryPostgres<{
    share_link_id: string;
    tenant_id: string;
    estimate_id: string;
    customer_id: string;
    organization_name: string;
    customer_name: string;
    customer_email: string | null;
    title: string;
    status: string;
    share_status: string;
    total_cents: number;
    payment_terms: string | null;
    deposit_required_cents: number | null;
    acceptance_notes: string | null;
    customer_intro: string | null;
    customer_scope_summary: string | null;
    customer_summary: string | null;
    customer_exclusions: string | null;
    customer_next_steps: string | null;
    show_line_item_prices: boolean | null;
    show_quantities: boolean | null;
  }>(
    `
    select
      s.id as share_link_id,
      s.tenant_id,
      e.id as estimate_id,
      c.id as customer_id,
      t.name as organization_name,
      c.name as customer_name,
      c.email as customer_email,
      e.title,
      e.status,
      s.status as share_status,
      e.total_cents,
      e.payment_terms,
      e.deposit_required_cents,
      e.acceptance_notes,
      e.customer_intro,
      e.customer_scope_summary,
      e.customer_summary,
      e.customer_exclusions,
      e.customer_next_steps,
      e.show_line_item_prices,
      e.show_quantities
    from public.estimate_share_links s
    join public.service_estimates e on e.id = s.estimate_id and e.tenant_id = s.tenant_id
    join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
    join public.tenants t on t.id = s.tenant_id
    where s.public_token = $1
      and s.status in ('ready', 'sent', 'viewed', 'accepted')
      and (s.expires_at is null or s.expires_at > now())
    limit 1
    `,
    [publicToken]
  );
  const estimate = result?.rows[0];
  if (!estimate) return null;

  await queryPostgres(
    `
    update public.estimate_share_links
    set status = case when status in ('ready', 'sent') then 'viewed' else status end,
        last_viewed_at = now(),
        updated_at = now()
    where id = $1
    `,
    [estimate.share_link_id]
  );

  const itemsResult = await queryPostgres<{
    id: string;
    name: string;
    description: string | null;
    quantity: string;
    unit_price_cents: number;
    total_cents: number;
    optional: boolean;
    selected: boolean;
  }>(
    `
    select id, coalesce(customer_label, name) as name, description, quantity::text,
      unit_price_cents, total_cents, optional, selected
    from public.estimate_line_items
    where tenant_id = $1 and estimate_id = $2 and customer_visible = true
    order by position, name
    `,
    [estimate.tenant_id, estimate.estimate_id]
  );
  const [paymentResult, acceptanceResult] = await Promise.all([
    queryPostgres<{ payment_url: string | null; status: string }>(
    `
    select l.payment_url, l.status
    from public.service_invoice_payment_links l
    join public.service_invoices i on i.id = l.invoice_id and i.tenant_id = l.tenant_id
    where i.tenant_id = $1
      and i.estimate_id = $2
      and i.title = $3
      and l.status in ('ready', 'sent', 'paid')
    order by l.created_at desc
    limit 1
    `,
    [estimate.tenant_id, estimate.estimate_id, `Deposit - ${estimate.title}`]
    ),
    queryPostgres<{
      id: string;
      accepted_name: string;
      created_at: Date;
      metadata_json: { documentSha256?: string } | null;
    }>(
      `select id, accepted_name, created_at, metadata_json
         from public.estimate_acceptances
        where tenant_id=$1 and estimate_share_link_id=$2
        order by created_at desc limit 1`,
      [estimate.tenant_id, estimate.share_link_id]
    )
  ]);
  const payment = paymentResult?.rows[0];
  const acceptance = acceptanceResult?.rows[0];

  return {
    shareLinkId: estimate.share_link_id,
    tenantId: estimate.tenant_id,
    estimateId: estimate.estimate_id,
    customerId: estimate.customer_id,
    organizationName: estimate.organization_name,
    customerName: estimate.customer_name,
    customerEmail: estimate.customer_email ?? "",
    title: estimate.title,
    status: estimate.status,
    shareStatus: estimate.share_status,
    total: formatMoney(estimate.total_cents),
    paymentTerms: estimate.payment_terms ?? "",
    depositRequired: formatMoney(estimate.deposit_required_cents ?? 0),
    acceptanceNotes: estimate.acceptance_notes ?? "",
    customerIntro: estimate.customer_intro ?? "",
    customerScopeSummary: estimate.customer_scope_summary ?? estimate.customer_summary ?? "",
    customerExclusions: estimate.customer_exclusions ?? "",
    customerNextSteps: estimate.customer_next_steps ?? "",
    showLineItemPrices: estimate.show_line_item_prices ?? true,
    showQuantities: estimate.show_quantities ?? true,
    depositPaymentUrl: payment?.payment_url ?? "",
    depositPaymentStatus: payment?.status ?? "",
    acceptanceReceipt: acceptance
      ? {
          id: acceptance.id,
          signedName: acceptance.accepted_name,
          signedAt: acceptance.created_at.toISOString(),
          documentVerification: acceptance.metadata_json?.documentSha256?.slice(0, 16) ?? ""
        }
      : null,
    lineItems: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: formatMoney(item.unit_price_cents),
      total: formatMoney(item.total_cents),
      optional: item.optional,
      selected: item.selected
    }))
  };
}
