import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { manualSmsHref } from "@/lib/communication/manual-sms";
import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type CashCollectionDashboard = {
  metrics: {
    openInvoices: number;
    overdueInvoices: number;
    balanceDue: string;
    collectedRevenue: string;
    paymentRequests: number;
    paymentsReceived: number;
    ledgerEntries: number;
  };
  readiness: {
    stripeStatus: "ready" | "needs_setup" | "blocked";
    detail: string;
  };
  nextActions: {
    title: string;
    detail: string;
    href: string;
    urgency: "high" | "medium" | "low";
  }[];
  invoices: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    paid: string;
    balance: string;
    dueDate: string;
    smsHref: string;
    canText: boolean;
    href: string;
  }[];
  paymentRequests: {
    id: string;
    invoiceTitle: string;
    customerName: string;
    provider: string;
    status: string;
    amount: string;
    hasLiveUrl: boolean;
    href: string;
  }[];
  payments: {
    id: string;
    invoiceTitle: string;
    customerName: string;
    provider: string;
    status: string;
    amount: string;
    receivedAt: string;
    href: string;
  }[];
  ledgerEntries: {
    id: string;
    invoiceTitle: string;
    entryType: string;
    direction: string;
    amount: string;
    occurredAt: string;
    href: string;
  }[];
};

function n(value: unknown) {
  return Number(value ?? 0);
}

function dateLabel(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(value) : "No due date";
}

function dateTimeLabel(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "No date";
}

export async function getCashCollectionDashboard(): Promise<CashCollectionDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [billing, counts, invoices, paymentRequests, payments, ledgerEntries] = await Promise.all([
    getBillingOverview(),
    queryPostgres<{
      open_invoices: string;
      overdue_invoices: string;
      balance_due_cents: string;
      collected_revenue_cents: string;
      payment_requests: string;
      payments_received: string;
      ledger_entries: string;
    }>(
      `
      select
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('draft','sent_manually','partially_paid','overdue'))::text as open_invoices,
        (
          select count(*) from public.service_invoices
          where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue')
            and coalesce(due_date, created_at::date) <= current_date
            and amount_paid_cents < total_cents
        )::text as overdue_invoices,
        (
          select coalesce(sum(greatest(total_cents - amount_paid_cents, 0)), 0)
          from public.service_invoices
          where tenant_id = $1 and status in ('draft','sent_manually','partially_paid','overdue')
        )::text as balance_due_cents,
        (
          select coalesce(sum(amount_paid_cents), 0)
          from public.service_invoices
          where tenant_id = $1 and status in ('partially_paid','paid')
        )::text as collected_revenue_cents,
        (select count(*) from public.service_invoice_payment_links where tenant_id = $1)::text as payment_requests,
        (select count(*) from public.service_invoice_payments where tenant_id = $1 and status in ('succeeded','recorded'))::text as payments_received,
        (select count(*) from public.service_ledger_entries where tenant_id = $1)::text as ledger_entries
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      customer_phone: string | null;
      status: string;
      total_cents: number;
      amount_paid_cents: number;
      due_date: Date | null;
      created_at: Date;
    }>(
      `
      select i.id, i.title, c.name as customer_name, c.phone as customer_phone, i.status, i.total_cents, i.amount_paid_cents, i.due_date, i.created_at
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      where i.tenant_id = $1 and i.status in ('draft','sent_manually','partially_paid','overdue')
      order by
        case when i.status = 'overdue' then 0 else 1 end,
        coalesce(i.due_date, i.created_at::date) asc,
        i.created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      invoice_id: string;
      invoice_title: string;
      customer_name: string;
      provider: string;
      status: string;
      amount_cents: number;
      payment_url: string | null;
    }>(
      `
      select l.id, l.invoice_id, i.title as invoice_title, c.name as customer_name, l.provider, l.status, l.amount_cents, l.payment_url
      from public.service_invoice_payment_links l
      join public.service_invoices i on i.id = l.invoice_id
      join public.customers c on c.id = i.customer_id
      where l.tenant_id = $1
      order by l.created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      invoice_id: string;
      invoice_title: string;
      customer_name: string;
      provider: string;
      status: string;
      amount_cents: number;
      received_at: Date;
    }>(
      `
      select p.id, p.invoice_id, i.title as invoice_title, c.name as customer_name, p.provider, p.status, p.amount_cents, p.received_at
      from public.service_invoice_payments p
      join public.service_invoices i on i.id = p.invoice_id
      join public.customers c on c.id = i.customer_id
      where p.tenant_id = $1
      order by p.received_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      invoice_id: string | null;
      invoice_title: string | null;
      entry_type: string;
      direction: string;
      amount_cents: number;
      occurred_at: Date;
    }>(
      `
      select e.id, e.invoice_id, i.title as invoice_title, e.entry_type, e.direction, e.amount_cents, e.occurred_at
      from public.service_ledger_entries e
      left join public.service_invoices i on i.id = e.invoice_id
      where e.tenant_id = $1
      order by e.occurred_at desc
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const row = counts?.rows[0];
  const openInvoices = n(row?.open_invoices);
  const overdueInvoices = n(row?.overdue_invoices);
  const stripe = billing.readiness.find((item) => item.label === "Stripe connection");
  const invoiceRows = invoices?.rows ?? [];
  const nextActions = [
    overdueInvoices > 0
      ? {
          title: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`,
          detail: "Start here before chasing new work. Open the invoice, prepare a payment request, or record the payment if it already arrived.",
          href: "/app/cash-collection",
          urgency: "high" as const
        }
      : null,
    stripe?.status !== "ready"
      ? {
          title: "Stripe is not fully ready",
          detail: stripe?.detail ?? "Connect Stripe keys and webhook before live payment links are trusted.",
          href: "/app/billing",
          urgency: "high" as const
        }
      : null,
    openInvoices > 0
      ? {
          title: `${openInvoices} invoice${openInvoices === 1 ? "" : "s"} still open`,
          detail: "Use Cash Collection as the daily money checklist.",
          href: "/app/cash-collection",
          urgency: "medium" as const
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    metrics: {
      openInvoices,
      overdueInvoices,
      balanceDue: formatMoney(n(row?.balance_due_cents)),
      collectedRevenue: formatMoney(n(row?.collected_revenue_cents)),
      paymentRequests: n(row?.payment_requests),
      paymentsReceived: n(row?.payments_received),
      ledgerEntries: n(row?.ledger_entries)
    },
    readiness: {
      stripeStatus: stripe?.status ?? "needs_setup",
      detail: stripe?.detail ?? "Stripe connection status is not configured yet."
    },
    nextActions,
    invoices: invoiceRows.map((invoice) => {
      const balance = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
      const dueDate = dateLabel(invoice.due_date ?? invoice.created_at);
      return {
        id: invoice.id,
        title: invoice.title,
        customerName: invoice.customer_name,
        status: invoice.status,
        total: formatMoney(invoice.total_cents),
        paid: formatMoney(invoice.amount_paid_cents),
        balance: formatMoney(balance),
        dueDate,
        smsHref: manualSmsHref(
          invoice.customer_phone,
          `Hi ${invoice.customer_name}, this is a quick reminder that ${invoice.title} has a balance of ${formatMoney(balance)} due ${dueDate}. Please reply if you already paid or need the payment link resent.`
        ),
        canText: Boolean(invoice.customer_phone),
        href: `/app/service/invoices/${invoice.id}`
      };
    }),
    paymentRequests: (paymentRequests?.rows ?? []).map((request) => ({
      id: request.id,
      invoiceTitle: request.invoice_title,
      customerName: request.customer_name,
      provider: request.provider,
      status: request.status,
      amount: formatMoney(request.amount_cents),
      hasLiveUrl: Boolean(request.payment_url),
      href: `/app/service/invoices/${request.invoice_id}`
    })),
    payments: (payments?.rows ?? []).map((payment) => ({
      id: payment.id,
      invoiceTitle: payment.invoice_title,
      customerName: payment.customer_name,
      provider: payment.provider,
      status: payment.status,
      amount: formatMoney(payment.amount_cents),
      receivedAt: dateTimeLabel(payment.received_at),
      href: `/app/service/invoices/${payment.invoice_id}`
    })),
    ledgerEntries: (ledgerEntries?.rows ?? []).map((entry) => ({
      id: entry.id,
      invoiceTitle: entry.invoice_title ?? "Ledger entry",
      entryType: entry.entry_type,
      direction: entry.direction,
      amount: formatMoney(entry.amount_cents),
      occurredAt: dateTimeLabel(entry.occurred_at),
      href: entry.invoice_id ? `/app/service/invoices/${entry.invoice_id}` : "/app/cash-collection"
    }))
  };
}
