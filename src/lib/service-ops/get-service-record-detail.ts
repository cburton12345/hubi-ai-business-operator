import { queryPostgres } from "@/lib/db/postgres";
import { centsToDollars, formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceEstimateDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  total: string;
  paymentTerms: string;
  depositRequired: string;
  acceptanceNotes: string;
  customerDisplayMode: string;
  customerIntro: string;
  customerScopeSummary: string;
  customerExclusions: string;
  customerNextSteps: string;
  showLineItemPrices: boolean;
  showQuantities: boolean;
  showMaterialDetails: boolean;
  showLaborDetails: boolean;
  showOverheadDetails: boolean;
  showProfitDetails: boolean;
  estimatedCrewSize: string;
  estimatedTearoutHours: string;
  estimatedInstallHours: string;
  estimatedDurationHours: string;
  laborRate: string;
  laborNotes: string;
  marketPriceRange: string;
  marketPriceSource: string;
  marketPriceNotes: string;
  customerSummary: string;
  internalNotes: string;
  followUpDraft: string;
  shareLink: {
    id: string;
    publicToken: string;
    url: string;
    status: string;
    emailTo: string;
    sentAt: string;
    acceptedAt: string;
    expiresAt: string;
    deliveryStatus: string;
    deliveryError: string;
  } | null;
  linkedJobs: { id: string; title: string; status: string; schedule: string }[];
  pricebookItems: { id: string; name: string; category: string; price: string }[];
  lineItems: { id: string; name: string; description: string; quantity: string; unitPrice: string; unitPriceValue: string; total: string }[];
};

export type ServiceJobDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  schedule: string;
  serviceArea: string;
  estimateId: string;
  estimateTitle: string;
  estimateTotal: string;
  dispatcherNotes: string;
  completionNotes: string;
  nextAction: string;
  linkedInvoices: { id: string; title: string; status: string; total: string; balanceDue: string }[];
  proofRequests: { id: string; publicToken: string; requestType: string; status: string; createdAt: string; url: string }[];
  proofSubmissions: { id: string; title: string; status: string; assetCount: number; createdAt: string }[];
  authorityBundle: { id: string; status: string; title: string; draftCount: number; queueCount: number } | null;
};

export type ServiceInvoiceDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string;
  internalNotes: string;
  paymentNotes: string;
  lineItems: { id: string; name: string; description: string; quantity: string; unitPrice: string; unitPriceValue: string; total: string }[];
  paymentLinks: {
    id: string;
    provider: string;
    status: string;
    amount: string;
    paymentUrl: string;
    paymentMode: string;
    createdAt: string;
    emailTo: string;
    deliveryStatus: string;
    deliveryError: string;
  }[];
  payments: { id: string; provider: string; status: string; amount: string; receivedAt: string; note: string }[];
  ledgerEntries: { id: string; entryType: string; direction: string; amount: string; description: string; occurredAt: string }[];
};

function formatDateTime(start: Date | null, end: Date | null) {
  if (!start) return "Unscheduled";
  const first = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(start);
  const second = end ? new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(end) : "";
  return second ? `${first} - ${second}` : first;
}

export async function getServiceEstimateDetail(estimateId: string): Promise<ServiceEstimateDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [estimateResult, itemsResult, jobsResult, shareLinkResult, pricebookResult] = await Promise.all([
    queryPostgres<{
      id: string;
      customer_id: string;
      customer_name: string;
      title: string;
      status: string;
      total_cents: number;
      customer_summary: string | null;
      internal_notes: string | null;
      manual_follow_up_draft: string | null;
      payment_terms: string | null;
      deposit_required_cents: number | null;
      acceptance_notes: string | null;
      customer_display_mode: string | null;
      customer_intro: string | null;
      customer_scope_summary: string | null;
      customer_exclusions: string | null;
      customer_next_steps: string | null;
      show_line_item_prices: boolean | null;
      show_quantities: boolean | null;
      show_material_details: boolean | null;
      show_labor_details: boolean | null;
      show_overhead_details: boolean | null;
      show_profit_details: boolean | null;
      estimated_crew_size: string | null;
      estimated_tearout_hours: string | null;
      estimated_install_hours: string | null;
      estimated_duration_hours: string | null;
      labor_rate_cents: number | null;
      labor_notes: string | null;
      market_price_low_cents: number | null;
      market_price_high_cents: number | null;
      market_price_source: string | null;
      market_price_notes: string | null;
    }>(
      `
      select e.id, e.customer_id, c.name as customer_name, e.title, e.status, e.total_cents,
        e.customer_summary, e.internal_notes, e.manual_follow_up_draft,
        e.payment_terms, e.deposit_required_cents, e.acceptance_notes,
        e.customer_display_mode, e.customer_intro, e.customer_scope_summary,
        e.customer_exclusions, e.customer_next_steps,
        e.show_line_item_prices, e.show_quantities, e.show_material_details,
        e.show_labor_details, e.show_overhead_details, e.show_profit_details,
        e.estimated_crew_size::text, e.estimated_tearout_hours::text,
        e.estimated_install_hours::text, e.estimated_duration_hours::text,
        e.labor_rate_cents, e.labor_notes, e.market_price_low_cents,
        e.market_price_high_cents, e.market_price_source, e.market_price_notes
      from public.service_estimates e
      join public.customers c on c.id = e.customer_id
      where e.tenant_id = $1 and e.id = $2
      limit 1
      `,
      [workspaceId, estimateId]
    ),
    queryPostgres<{ id: string; name: string; description: string | null; quantity: string; unit_price_cents: number; total_cents: number }>(
      `
      select id, name, description, quantity::text, unit_price_cents, total_cents
      from public.estimate_line_items
      where tenant_id = $1 and estimate_id = $2
      order by position, name
      `,
      [workspaceId, estimateId]
    ),
    queryPostgres<{ id: string; title: string; status: string; scheduled_start: Date | null; scheduled_end: Date | null }>(
      `
      select id, title, status, scheduled_start, scheduled_end
      from public.service_jobs
      where tenant_id = $1 and estimate_id = $2
      order by created_at desc
      limit 5
      `,
      [workspaceId, estimateId]
    ),
    queryPostgres<{
      id: string;
      public_token: string;
      status: string;
      email_to: string | null;
      sent_at: Date | null;
      accepted_at: Date | null;
      expires_at: Date | null;
      metadata_json: { emailStatus?: string; emailError?: string } | null;
    }>(
      `
      select id, public_token, status, email_to, sent_at, accepted_at, expires_at, metadata_json
      from public.estimate_share_links
      where tenant_id = $1 and estimate_id = $2
      order by created_at desc
      limit 1
      `,
      [workspaceId, estimateId]
    ),
    queryPostgres<{ id: string; name: string; category_name: string | null; price_cents: number }>(
      `
      select i.id, i.name, c.name as category_name, i.price_cents
      from public.pricebook_items i
      left join public.pricebook_categories c on c.id = i.category_id and c.tenant_id = i.tenant_id
      where i.tenant_id = $1 and i.active = true
      order by c.position nulls last, c.name nulls last, i.name
      limit 300
      `,
      [workspaceId]
    )
  ]);
  const estimate = estimateResult?.rows[0];
  if (!estimate) return null;

  return {
    id: estimate.id,
    customerId: estimate.customer_id,
    customerName: estimate.customer_name,
    title: estimate.title,
    status: estimate.status,
    total: formatMoney(estimate.total_cents),
    paymentTerms: estimate.payment_terms ?? "",
    depositRequired: formatMoney(estimate.deposit_required_cents ?? 0),
    acceptanceNotes: estimate.acceptance_notes ?? "",
    customerDisplayMode: estimate.customer_display_mode ?? "grouped",
    customerIntro: estimate.customer_intro ?? "",
    customerScopeSummary: estimate.customer_scope_summary ?? estimate.customer_summary ?? "",
    customerExclusions: estimate.customer_exclusions ?? "",
    customerNextSteps: estimate.customer_next_steps ?? "",
    showLineItemPrices: estimate.show_line_item_prices ?? true,
    showQuantities: estimate.show_quantities ?? true,
    showMaterialDetails: estimate.show_material_details ?? false,
    showLaborDetails: estimate.show_labor_details ?? false,
    showOverheadDetails: estimate.show_overhead_details ?? false,
    showProfitDetails: estimate.show_profit_details ?? false,
    estimatedCrewSize: estimate.estimated_crew_size ?? "",
    estimatedTearoutHours: estimate.estimated_tearout_hours ?? "",
    estimatedInstallHours: estimate.estimated_install_hours ?? "",
    estimatedDurationHours: estimate.estimated_duration_hours ?? "",
    laborRate: centsToDollars(estimate.labor_rate_cents ?? 0),
    laborNotes: estimate.labor_notes ?? "",
    marketPriceRange:
      estimate.market_price_low_cents || estimate.market_price_high_cents
        ? `${formatMoney(estimate.market_price_low_cents ?? 0)} - ${formatMoney(estimate.market_price_high_cents ?? 0)}`
        : "",
    marketPriceSource: estimate.market_price_source ?? "",
    marketPriceNotes: estimate.market_price_notes ?? "",
    customerSummary: estimate.customer_summary ?? "",
    internalNotes: estimate.internal_notes ?? "",
    followUpDraft: estimate.manual_follow_up_draft ?? "",
    shareLink: shareLinkResult?.rows[0]
      ? {
          id: shareLinkResult.rows[0].id,
          publicToken: shareLinkResult.rows[0].public_token,
          url: `/estimate/${shareLinkResult.rows[0].public_token}`,
          status: shareLinkResult.rows[0].status,
          emailTo: shareLinkResult.rows[0].email_to ?? "",
          sentAt: shareLinkResult.rows[0].sent_at ? formatDateTime(shareLinkResult.rows[0].sent_at, null) : "",
          acceptedAt: shareLinkResult.rows[0].accepted_at ? formatDateTime(shareLinkResult.rows[0].accepted_at, null) : "",
          expiresAt: shareLinkResult.rows[0].expires_at ? formatDateTime(shareLinkResult.rows[0].expires_at, null) : "",
          deliveryStatus: shareLinkResult.rows[0].metadata_json?.emailStatus ?? "not sent",
          deliveryError: shareLinkResult.rows[0].metadata_json?.emailError ?? ""
        }
      : null,
    linkedJobs: (jobsResult?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      schedule: formatDateTime(job.scheduled_start, job.scheduled_end)
    })),
    pricebookItems: (pricebookResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category_name ?? "Uncategorized",
      price: formatMoney(item.price_cents)
    })),
    lineItems: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: formatMoney(item.unit_price_cents),
      unitPriceValue: centsToDollars(item.unit_price_cents),
      total: formatMoney(item.total_cents)
    }))
  };
}

export async function getServiceJobDetail(jobId: string): Promise<ServiceJobDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [result, requestsResult, submissionsResult, invoicesResult, authorityResult] = await Promise.all([
    queryPostgres<{
      id: string;
      customer_id: string;
      customer_name: string;
      title: string;
      status: string;
      scheduled_start: Date | null;
      scheduled_end: Date | null;
      service_area: string | null;
      estimate_id: string | null;
      estimate_title: string | null;
      estimate_total_cents: number | null;
      dispatcher_notes: string | null;
      completion_notes: string | null;
      ai_next_action: string | null;
    }>(
      `
      select
        j.id,
        j.customer_id,
        c.name as customer_name,
        j.title,
        j.status,
        j.scheduled_start,
        j.scheduled_end,
        j.service_area,
        j.estimate_id,
        e.title as estimate_title,
        e.total_cents as estimate_total_cents,
        j.dispatcher_notes,
        j.completion_notes,
        j.ai_next_action
      from public.service_jobs j
      join public.customers c on c.id = j.customer_id
      left join public.service_estimates e on e.id = j.estimate_id and e.tenant_id = j.tenant_id
      where j.tenant_id = $1 and j.id = $2
      limit 1
      `,
      [workspaceId, jobId]
    ),
    queryPostgres<{ id: string; public_token: string; request_type: string; status: string; created_at: Date }>(
      `
      select id, public_token, request_type, status, created_at
      from public.ugc_capture_requests
      where tenant_id = $1 and job_id = $2
      order by created_at desc
      limit 10
      `,
      [workspaceId, jobId]
    ),
    queryPostgres<{ id: string; title: string | null; status: string; created_at: Date; asset_count: string }>(
      `
      select
        s.id,
        s.title,
        s.status,
        s.created_at,
        (select count(*) from public.ugc_assets a where a.submission_id = s.id)::text as asset_count
      from public.ugc_submissions s
      where s.tenant_id = $1 and s.job_id = $2
      order by s.created_at desc
      limit 10
      `,
      [workspaceId, jobId]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; amount_paid_cents: number }>(
      `
      select id, title, status, total_cents, amount_paid_cents
      from public.service_invoices
      where tenant_id = $1 and job_id = $2
      order by created_at desc
      limit 5
      `,
      [workspaceId, jobId]
    ),
    queryPostgres<{ id: string; title: string; status: string; draft_count: number; queue_count: number }>(
      `
      select id, title, status, draft_count, queue_count
      from public.authority_content_bundles
      where tenant_id = $1 and job_id = $2 and bundle_type = 'completed_job'
      order by created_at desc
      limit 1
      `,
      [workspaceId, jobId]
    )
  ]);
  const job = result?.rows[0];
  if (!job) return null;

  return {
    id: job.id,
    customerId: job.customer_id,
    customerName: job.customer_name,
    title: job.title,
    status: job.status,
    schedule: formatDateTime(job.scheduled_start, job.scheduled_end),
    serviceArea: job.service_area ?? "",
    estimateId: job.estimate_id ?? "",
    estimateTitle: job.estimate_title ?? "",
    estimateTotal: formatMoney(job.estimate_total_cents ?? 0),
    dispatcherNotes: job.dispatcher_notes ?? "",
    completionNotes: job.completion_notes ?? "",
    nextAction: job.ai_next_action ?? "",
    linkedInvoices: (invoicesResult?.rows ?? []).map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      balanceDue: formatMoney(Math.max(invoice.total_cents - invoice.amount_paid_cents, 0))
    })),
    proofRequests: (requestsResult?.rows ?? []).map((request) => ({
      id: request.id,
      publicToken: request.public_token,
      requestType: request.request_type,
      status: request.status,
      createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(request.created_at),
      url: `/proof/${request.public_token}`
    })),
    proofSubmissions: (submissionsResult?.rows ?? []).map((submission) => ({
      id: submission.id,
      title: submission.title ?? "Customer proof submission",
      status: submission.status,
      assetCount: Number(submission.asset_count ?? 0),
      createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(submission.created_at)
    })),
    authorityBundle: authorityResult?.rows[0]
      ? {
          id: authorityResult.rows[0].id,
          title: authorityResult.rows[0].title,
          status: authorityResult.rows[0].status,
          draftCount: Number(authorityResult.rows[0].draft_count ?? 0),
          queueCount: Number(authorityResult.rows[0].queue_count ?? 0)
        }
      : null
  };
}

export async function getServiceInvoiceDetail(invoiceId: string): Promise<ServiceInvoiceDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [invoiceResult, itemsResult, linksResult, paymentsResult, ledgerResult] = await Promise.all([
    queryPostgres<{
      id: string;
      customer_id: string;
      customer_name: string;
      title: string;
      status: string;
      total_cents: number;
      amount_paid_cents: number;
      due_date: Date | null;
      internal_notes: string | null;
      manual_payment_notes: string | null;
    }>(
      `
      select i.id, i.customer_id, c.name as customer_name, i.title, i.status, i.total_cents, i.amount_paid_cents, i.due_date, i.internal_notes, i.manual_payment_notes
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      where i.tenant_id = $1 and i.id = $2
      limit 1
      `,
      [workspaceId, invoiceId]
    ),
    queryPostgres<{ id: string; name: string; description: string | null; quantity: string; unit_price_cents: number; total_cents: number }>(
      `
      select id, name, description, quantity::text, unit_price_cents, total_cents
      from public.invoice_line_items
      where tenant_id = $1 and invoice_id = $2
      order by position, name
      `,
      [workspaceId, invoiceId]
    ),
    queryPostgres<{
      id: string;
      provider: string;
      status: string;
      amount_cents: number;
      payment_url: string | null;
      payment_mode: string;
      created_at: Date;
      metadata_json: { emailTo?: string; emailStatus?: string; emailError?: string } | null;
    }>(
      `
      select id, provider, status, amount_cents, payment_url, payment_mode, created_at, metadata_json
      from public.service_invoice_payment_links
      where tenant_id = $1 and invoice_id = $2
      order by created_at desc
      limit 10
      `,
      [workspaceId, invoiceId]
    ),
    queryPostgres<{
      id: string;
      provider: string;
      status: string;
      amount_cents: number;
      received_at: Date;
      metadata_json: { note?: string } | null;
    }>(
      `
      select id, provider, status, amount_cents, received_at, metadata_json
      from public.service_invoice_payments
      where tenant_id = $1 and invoice_id = $2
      order by received_at desc
      limit 10
      `,
      [workspaceId, invoiceId]
    ),
    queryPostgres<{
      id: string;
      entry_type: string;
      direction: string;
      amount_cents: number;
      description: string | null;
      occurred_at: Date;
    }>(
      `
      select id, entry_type, direction, amount_cents, description, occurred_at
      from public.service_ledger_entries
      where tenant_id = $1 and invoice_id = $2
      order by occurred_at desc
      limit 20
      `,
      [workspaceId, invoiceId]
    )
  ]);
  const invoice = invoiceResult?.rows[0];
  if (!invoice) return null;

  return {
    id: invoice.id,
    customerId: invoice.customer_id,
    customerName: invoice.customer_name,
    title: invoice.title,
    status: invoice.status,
    total: formatMoney(invoice.total_cents),
    amountPaid: formatMoney(invoice.amount_paid_cents),
    balanceDue: formatMoney(Math.max(invoice.total_cents - invoice.amount_paid_cents, 0)),
    dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date",
    internalNotes: invoice.internal_notes ?? "",
    paymentNotes: invoice.manual_payment_notes ?? "",
    lineItems: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: formatMoney(item.unit_price_cents),
      unitPriceValue: centsToDollars(item.unit_price_cents),
      total: formatMoney(item.total_cents)
    })),
    paymentLinks: (linksResult?.rows ?? []).map((link) => ({
      id: link.id,
      provider: link.provider,
      status: link.status,
      amount: formatMoney(link.amount_cents),
      paymentUrl: link.payment_url ?? "",
      paymentMode: link.payment_mode,
      createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(link.created_at),
      emailTo: link.metadata_json?.emailTo ?? "",
      deliveryStatus: link.metadata_json?.emailStatus ?? "not sent",
      deliveryError: link.metadata_json?.emailError ?? ""
    })),
    payments: (paymentsResult?.rows ?? []).map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: formatMoney(payment.amount_cents),
      receivedAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(payment.received_at),
      note: payment.metadata_json?.note ?? ""
    })),
    ledgerEntries: (ledgerResult?.rows ?? []).map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type,
      direction: entry.direction,
      amount: formatMoney(entry.amount_cents),
      description: entry.description ?? "",
      occurredAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(entry.occurred_at)
    }))
  };
}
