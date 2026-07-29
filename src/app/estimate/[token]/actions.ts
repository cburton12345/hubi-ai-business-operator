"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { sendFerocityNotificationEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import {
  calculatePlatformFeeCents,
  getManagedPaymentAccount,
  managedPaymentsEnabled,
  stripeFormRequest
} from "@/lib/payments/stripe-connect";
import { ensureServiceKernelForJob } from "@/lib/service-ops/service-kernel";

const acceptEstimateSchema = z.object({
  token: z.string().min(8).max(120),
  acceptedName: z.string().min(1).max(180),
  acceptedEmail: z.string().email().optional().or(z.literal("")),
  acceptanceNote: z.string().max(1200).optional()
});

const estimateOptionsSchema = z.object({
  token: z.string().min(8).max(120),
  selectedItemIds: z.array(z.string().uuid()).max(100)
});

export async function updateEstimateOptionsAction(formData: FormData) {
  const parsed = estimateOptionsSchema.safeParse({
    token: formData.get("token"),
    selectedItemIds: formData.getAll("selectedItemId").map(String)
  });
  if (!parsed.success) return;
  const shareResult = await queryPostgres<{ tenant_id: string; estimate_id: string }>(
    `
    select tenant_id, estimate_id from public.estimate_share_links
    where public_token = $1 and status in ('ready','sent','viewed')
      and (expires_at is null or expires_at > now())
    limit 1
    `,
    [parsed.data.token]
  );
  const share = shareResult?.rows[0];
  if (!share) return;
  await queryPostgres(
    `
    update public.estimate_line_items
    set selected = case when id = any($3::uuid[]) then true else false end
    where tenant_id = $1 and estimate_id = $2 and optional = true
    `,
    [share.tenant_id, share.estimate_id, parsed.data.selectedItemIds]
  );
  await queryPostgres(
    `
    update public.service_estimates e
    set subtotal_cents = totals.subtotal,
      total_cents = greatest(0, totals.subtotal - e.discount_cents + e.tax_cents),
      updated_at = now()
    from (
      select coalesce(sum(total_cents), 0)::integer as subtotal
      from public.estimate_line_items
      where tenant_id = $1 and estimate_id = $2 and selected = true
    ) totals
    where e.tenant_id = $1 and e.id = $2
    `,
    [share.tenant_id, share.estimate_id]
  );
  redirect(`/estimate/${parsed.data.token}?options=updated`);
}

export async function acceptEstimateAction(formData: FormData) {
  const parsed = acceptEstimateSchema.safeParse({
    token: formData.get("token"),
    acceptedName: formData.get("acceptedName"),
    acceptedEmail: formData.get("acceptedEmail"),
    acceptanceNote: formData.get("acceptanceNote")
  });
  if (!parsed.success) return;

  const shareResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    estimate_id: string;
    customer_id: string;
    status: string;
    title: string;
    brand_id: string | null;
    customer_name: string;
    total_cents: number;
    deposit_required_cents: number;
  }>(
    `
    select
      s.id,
      s.tenant_id,
      s.estimate_id,
      s.customer_id,
      s.status,
      e.title,
      e.brand_id,
      c.name as customer_name,
      e.total_cents,
      coalesce(e.deposit_required_cents, 0) as deposit_required_cents
    from public.estimate_share_links s
    join public.service_estimates e on e.id = s.estimate_id and e.tenant_id = s.tenant_id
    join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
    where s.public_token = $1
      and s.status in ('ready', 'sent', 'viewed', 'accepted')
      and (s.expires_at is null or s.expires_at > now())
    limit 1
    `,
    [parsed.data.token]
  );
  const share = shareResult?.rows[0];
  if (!share) return;

  const requestHeaders = await headers();
  await queryPostgres(
    `
    insert into public.estimate_acceptances (
      tenant_id, estimate_share_link_id, estimate_id, customer_id,
      accepted_name, accepted_email, acceptance_note, ip_address, user_agent, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    on conflict (estimate_share_link_id) do nothing
    `,
    [
      share.tenant_id,
      share.id,
      share.estimate_id,
      share.customer_id,
      parsed.data.acceptedName.trim(),
      parsed.data.acceptedEmail?.trim() || null,
      parsed.data.acceptanceNote?.trim() || null,
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      requestHeaders.get("user-agent") ?? null,
      JSON.stringify({ source: "public_estimate_page" })
    ]
  );

  await queryPostgres(
    `
    update public.estimate_share_links
    set status = 'accepted', accepted_at = now(), updated_at = now()
    where id = $1
    `,
    [share.id]
  );

  await queryPostgres(
    `
    update public.service_estimates
    set status = 'approved', updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [share.tenant_id, share.estimate_id]
  );

  const jobResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_jobs (
      tenant_id, brand_id, customer_id, estimate_id, title, status, dispatcher_notes, ai_next_action
    )
    select $1, $2, $3, $4, $5, 'unscheduled', $6, $7
    where not exists (
      select 1 from public.service_jobs
      where tenant_id = $1 and estimate_id = $4 and status <> 'lost'
    )
    returning id
    `,
    [
      share.tenant_id,
      share.brand_id,
      share.customer_id,
      share.estimate_id,
      share.title,
      parsed.data.acceptanceNote?.trim() || "Customer accepted the estimate from the public estimate page.",
      "Customer accepted this estimate. Schedule the work, assign the crew, confirm materials, and prepare any deposit/payment request."
    ]
  );
  const jobId = jobResult?.rows[0]?.id ?? null;
  if (jobId) {
    await ensureServiceKernelForJob({ tenantId: share.tenant_id, jobId, eventSource: "customer" });
  }

  const depositLink = share.deposit_required_cents > 0
    ? await prepareDepositPaymentLink({
        tenantId: share.tenant_id,
        brandId: share.brand_id,
        customerId: share.customer_id,
        estimateId: share.estimate_id,
        publicToken: parsed.data.token,
        jobId,
        title: share.title,
        amountCents: share.deposit_required_cents,
        customerEmail: parsed.data.acceptedEmail?.trim() || null
      })
    : null;

  const now = new Date();
  const dueAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await queryPostgres(
    `
    insert into public.owner_reminders (
      tenant_id, title, body, reminder_type, priority, status, remind_at, next_due_at, action_url, metadata_json
    )
    values ($1,$2,$3,'follow_up','high','active',$4,$4,$5,$6::jsonb)
    `,
    [
      share.tenant_id,
      `Estimate accepted: ${share.title}`,
      `${share.customer_name} accepted ${share.title}. Schedule the job, confirm materials, and review any deposit/payment request.`,
      dueAt,
      `/app/service/estimates/${share.estimate_id}`,
      JSON.stringify({
        source: "public_estimate_acceptance",
        estimateId: share.estimate_id,
        jobId,
        depositPaymentLinkId: depositLink?.paymentLinkId ?? null,
        depositPaymentUrlReady: Boolean(depositLink?.paymentUrl)
      })
    ]
  );

  await sendFerocityNotificationEmail({
    subject: `Estimate accepted: ${share.title}`,
    text: [
      `${share.customer_name} accepted an estimate.`,
      "",
      `Estimate: ${share.title}`,
      `Total: $${(share.total_cents / 100).toFixed(2)}`,
      share.deposit_required_cents > 0 ? `Deposit: $${(share.deposit_required_cents / 100).toFixed(2)}` : "Deposit: none",
      depositLink?.paymentUrl ? `Deposit payment link prepared: ${depositLink.paymentUrl}` : "Deposit payment link: not prepared or not required",
      "",
      `Open Ferocity: ${(env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/$/, "")}/app/service/estimates/${share.estimate_id}`
    ].join("\n"),
    eventKey: `estimate-accepted-${share.estimate_id}`,
    tenantId: share.tenant_id,
    metadata: { estimateId: share.estimate_id, jobId, shareLinkId: share.id }
  });

  redirect(`/estimate/${parsed.data.token}?accepted=1`);
}

async function prepareDepositPaymentLink(input: {
  tenantId: string;
  brandId: string | null;
  customerId: string;
  estimateId: string;
  publicToken: string;
  jobId: string | null;
  title: string;
  amountCents: number;
  customerEmail: string | null;
}) {
  const existingInvoice = await queryPostgres<{ id: string }>(
    `
    select id
    from public.service_invoices
    where tenant_id = $1
      and estimate_id = $2
      and title = $3
      and status <> 'void'
    order by created_at desc
    limit 1
    `,
    [input.tenantId, input.estimateId, `Deposit - ${input.title}`]
  );

  const invoiceId = existingInvoice?.rows[0]?.id ?? (await queryPostgres<{ id: string }>(
    `
    insert into public.service_invoices (
      tenant_id, brand_id, customer_id, job_id, estimate_id, title, status,
      subtotal_cents, total_cents, due_date, internal_notes, manual_payment_notes
    )
    values ($1,$2,$3,$4,$5,$6,'sent_manually',$7,$7,current_date,$8,$9)
    returning id
    `,
    [
      input.tenantId,
      input.brandId,
      input.customerId,
      input.jobId,
      input.estimateId,
      `Deposit - ${input.title}`,
      input.amountCents,
      "Deposit invoice created automatically after public estimate acceptance.",
      "Review payment status before scheduling paid-only work."
    ]
  ))?.rows[0]?.id;

  if (!invoiceId) return null;

  await queryPostgres(
    `
    insert into public.invoice_line_items (tenant_id, invoice_id, name, quantity, unit_price_cents, total_cents)
    select $1, $2, 'Deposit', 1, $3, $3
    where not exists (
      select 1 from public.invoice_line_items where tenant_id = $1 and invoice_id = $2 and name = 'Deposit'
    )
    `,
    [input.tenantId, invoiceId, input.amountCents]
  );

  const existingLink = await queryPostgres<{ id: string; payment_url: string | null }>(
    `
    select id, payment_url
    from public.service_invoice_payment_links
    where tenant_id = $1 and invoice_id = $2 and status in ('ready', 'sent', 'paid')
    order by created_at desc
    limit 1
    `,
    [input.tenantId, invoiceId]
  );
  if (existingLink?.rows[0]) {
    return { paymentLinkId: existingLink.rows[0].id, paymentUrl: existingLink.rows[0].payment_url ?? "" };
  }

  const managedAccount = managedPaymentsEnabled() ? await getManagedPaymentAccount(input.tenantId) : null;
  const canUseConnectDirect =
    Boolean(managedAccount?.providerAccountId) &&
    managedAccount?.chargesEnabled === true &&
    managedAccount?.payoutsEnabled === true;
  const connectedAccountId = canUseConnectDirect ? managedAccount?.providerAccountId ?? null : null;
  const platformFeeCents = canUseConnectDirect ? calculatePlatformFeeCents(input.amountCents) : 0;
  const paymentMode = canUseConnectDirect ? "stripe_connect_direct" : "manual_tracking";

  const linkResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_invoice_payment_links (
      tenant_id, brand_id, customer_id, invoice_id, provider, status, amount_cents, currency,
      payment_mode, connected_account_id, platform_fee_cents, net_to_business_cents, metadata_json
    )
    values ($1,$2,$3,$4,'stripe','draft',$5,'usd',$6,$7,$8,$9,$10::jsonb)
    returning id
    `,
    [
      input.tenantId,
      input.brandId,
      input.customerId,
      invoiceId,
      input.amountCents,
      paymentMode,
      connectedAccountId,
      platformFeeCents,
      Math.max(input.amountCents - platformFeeCents, 0),
      JSON.stringify({
        source: "public_estimate_acceptance",
        estimateId: input.estimateId,
        payoutAccountReady: canUseConnectDirect,
        nextStep: canUseConnectDirect
          ? "Send the prepared deposit checkout link."
          : "Connect the business payout account, then prepare the payment request from the invoice."
      })
    ]
  );
  const paymentLinkId = linkResult?.rows[0]?.id;
  if (!paymentLinkId || !env.STRIPE_SECRET_KEY || !canUseConnectDirect || !connectedAccountId) {
    return paymentLinkId ? { paymentLinkId, paymentUrl: "" } : null;
  }

  const appUrl = env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `Deposit - ${input.title}`,
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][quantity]": "1",
    success_url: `${appUrl.replace(/\/$/, "")}/portal/payment-success?invoice=${encodeURIComponent(invoiceId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl.replace(/\/$/, "")}/estimate/${encodeURIComponent(input.publicToken)}`,
    "metadata[ferocity_kind]": "service_invoice_payment",
    "metadata[tenant_id]": input.tenantId,
    "metadata[invoice_id]": invoiceId,
    "metadata[estimate_id]": input.estimateId,
    "metadata[customer_id]": input.customerId,
    "metadata[payment_link_id]": paymentLinkId,
    "metadata[amount_cents]": String(input.amountCents),
    "metadata[currency]": "usd",
    "metadata[payment_mode]": paymentMode,
    "metadata[connected_account_id]": connectedAccountId,
    "metadata[platform_fee_cents]": String(platformFeeCents)
  });
  if (platformFeeCents > 0) {
    body.set("payment_intent_data[application_fee_amount]", String(platformFeeCents));
  }
  for (const [key, value] of [
    ["ferocity_kind", "service_invoice_payment"],
    ["tenant_id", input.tenantId],
    ["invoice_id", invoiceId],
    ["estimate_id", input.estimateId],
    ["customer_id", input.customerId],
    ["payment_link_id", paymentLinkId],
    ["amount_cents", String(input.amountCents)],
    ["currency", "usd"],
    ["payment_mode", paymentMode],
    ["connected_account_id", connectedAccountId],
    ["platform_fee_cents", String(platformFeeCents)]
  ] as const) {
    body.set(`payment_intent_data[metadata][${key}]`, value);
  }
  if (input.customerEmail) body.set("customer_email", input.customerEmail);

  let session: { id?: string; url?: string; payment_intent?: string };
  try {
    session = await stripeFormRequest<{ id?: string; url?: string; payment_intent?: string }>(
      "checkout/sessions",
      body,
      {
        connectedAccountId,
        idempotencyKey: `ferocity-estimate-deposit-checkout-${paymentLinkId}`
      }
    );
  } catch {
    return { paymentLinkId, paymentUrl: "" };
  }
  await queryPostgres(
    `
    update public.service_invoice_payment_links
    set status = $3,
        provider_checkout_session_id = $4,
        provider_payment_intent_id = $5,
        payment_url = $6,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [input.tenantId, paymentLinkId, session.url ? "ready" : "draft", session.id ?? null, session.payment_intent ?? null, session.url ?? null]
  );

  return { paymentLinkId, paymentUrl: session.url ?? "" };
}
