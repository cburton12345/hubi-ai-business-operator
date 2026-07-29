import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function csvEscape(value: string | number | Date | null | undefined) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dollars(cents: number | string | null | undefined) {
  const amount = Number(cents ?? 0);
  return (Number.isFinite(amount) ? amount / 100 : 0).toFixed(2);
}

function csvResponse(name: string, headers: string[], rows: Array<Array<string | number | Date | null | undefined>>) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}

export async function GET(request: Request) {
  await requirePermission("billing:manage");
  const tenantId = await getCurrentWorkspaceId();
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "invoices";

  if (dataset === "invoices") {
    const result = await queryPostgres<{
      invoice_id: string;
      customer_name: string;
      invoice_date: Date;
      due_date: Date | null;
      item_name: string;
      item_description: string | null;
      quantity: string | number;
      unit_price_cents: number;
      item_amount_cents: number;
      status: string;
    }>(
      `
      select
        i.id as invoice_id,
        c.name as customer_name,
        i.created_at::date as invoice_date,
        i.due_date,
        coalesce(li.name, i.title) as item_name,
        li.description as item_description,
        coalesce(li.quantity, 1) as quantity,
        coalesce(li.unit_price_cents, i.total_cents) as unit_price_cents,
        coalesce(li.total_cents, i.total_cents) as item_amount_cents,
        i.status
      from public.service_invoices i
      join public.customers c on c.tenant_id = i.tenant_id and c.id = i.customer_id
      left join public.invoice_line_items li on li.tenant_id = i.tenant_id and li.invoice_id = i.id
      where i.tenant_id = $1 and i.status <> 'void'
      order by i.created_at, i.id, li.position, li.id
      `,
      [tenantId]
    );
    return csvResponse(
      `ferocity-quickbooks-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Invoice No", "Customer", "Invoice Date", "Due Date", "Item", "Description", "Quantity", "Rate", "Item Amount", "Status"],
      (result?.rows ?? []).map((row) => [
        `FER-${row.invoice_id.slice(0, 8).toUpperCase()}`,
        row.customer_name,
        new Date(row.invoice_date).toISOString().slice(0, 10),
        row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : "",
        row.item_name,
        row.item_description,
        row.quantity,
        dollars(row.unit_price_cents),
        dollars(row.item_amount_cents),
        row.status
      ])
    );
  }

  if (dataset === "vendor-bills") {
    const result = await queryPostgres<{
      bill_number: string | null;
      supplier_name: string | null;
      bill_date: Date | null;
      due_date: Date | null;
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
      status: string;
      notes: string | null;
    }>(
      `
      select b.bill_number, s.name as supplier_name, b.bill_date, b.due_date,
             b.subtotal_cents, b.tax_cents, b.total_cents, b.status, b.notes
      from public.vendor_bills b
      left join public.suppliers s on s.tenant_id = b.tenant_id and s.id = b.supplier_id
      where b.tenant_id = $1 and b.status <> 'void'
      order by coalesce(b.bill_date, b.created_at::date), b.created_at
      `,
      [tenantId]
    );
    return csvResponse(
      `ferocity-vendor-bills-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Bill No", "Vendor", "Bill Date", "Due Date", "Subtotal", "Tax", "Total", "Status", "Memo"],
      (result?.rows ?? []).map((row) => [
        row.bill_number,
        row.supplier_name,
        row.bill_date ? new Date(row.bill_date).toISOString().slice(0, 10) : "",
        row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : "",
        dollars(row.subtotal_cents),
        dollars(row.tax_cents),
        dollars(row.total_cents),
        row.status,
        row.notes
      ])
    );
  }

  if (dataset === "ledger") {
    const result = await queryPostgres<{
      occurred_at: Date;
      entry_type: string;
      direction: string;
      amount_cents: number;
      currency: string;
      customer_name: string | null;
      invoice_title: string | null;
      description: string | null;
      provider: string | null;
    }>(
      `
      select e.occurred_at, e.entry_type, e.direction, e.amount_cents, e.currency,
             c.name as customer_name, i.title as invoice_title, e.description, e.provider
      from public.service_ledger_entries e
      left join public.customers c on c.tenant_id = e.tenant_id and c.id = e.customer_id
      left join public.service_invoices i on i.tenant_id = e.tenant_id and i.id = e.invoice_id
      where e.tenant_id = $1
      order by e.occurred_at, e.created_at
      `,
      [tenantId]
    );
    return csvResponse(
      `ferocity-accounting-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Entry Type", "Direction", "Amount", "Currency", "Customer", "Invoice", "Description", "Provider"],
      (result?.rows ?? []).map((row) => [
        new Date(row.occurred_at).toISOString(),
        row.entry_type,
        row.direction,
        dollars(row.amount_cents),
        row.currency.toUpperCase(),
        row.customer_name,
        row.invoice_title,
        row.description,
        row.provider
      ])
    );
  }

  return Response.json({ ok: false, error: "Unknown accounting export dataset." }, { status: 400 });
}
