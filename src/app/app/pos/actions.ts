"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { recordInvoiceRefundAcrossPaymentsWithClient } from "@/lib/billing/invoice-payment-adjustments";
import { withPostgresTransactionResult } from "@/lib/db/postgres";
import { calculatePosSale, posSaleSchema } from "@/lib/pos/sale";

function cents(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

export type PosActionState = { ok: boolean; error?: string };

function safePosError(error: Error, fallback: string) {
  const message = error.message;
  if (
    message === "Customer is unavailable." ||
    message === "A customer record could not be resolved." ||
    message === "The selected job does not belong to this customer." ||
    message === "Sale is unavailable for return." ||
    message === "Return quantity exceeds the remaining sold quantity." ||
    message === "No refundable balance remains." ||
    message.startsWith("Insufficient inventory for ")
  ) return message;
  return fallback;
}

export async function createPosSaleAction(
  _state: PosActionState,
  formData: FormData
): Promise<PosActionState> {
  const actor = await requirePermission("lead:manage");
  let items: unknown = [];
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { ok: false, error: "The sale items could not be read. Review them and try again." }; }
  const parsed = posSaleSchema.safeParse({
    customerId: String(formData.get("customerId") ?? "") || null,
    jobId: String(formData.get("jobId") ?? "") || null,
    title: String(formData.get("title") ?? "Point of sale"),
    tenderType: formData.get("tenderType"),
    externalReference: String(formData.get("externalReference") ?? "").trim() || null,
    discountCents: cents(formData.get("discount")),
    taxRateBps: Math.round(Number(formData.get("taxRate") ?? 0) * 100),
    idempotencyKey: formData.get("idempotencyKey"),
    items
  });
  if (!parsed.success) return { ok: false, error: "Check the sale items, amounts, discount, and tax rate." };
  const totals = calculatePosSale(parsed.data);
  const paid = parsed.data.tenderType !== "unpaid";
  const transaction = await withPostgresTransactionResult(async (client) => {
    const existing = await client.query<{ id: string; invoice_id: string }>(`select id,invoice_id from public.pos_sales where tenant_id=$1 and idempotency_key=$2`, [actor.workspace.id, parsed.data.idempotencyKey]);
    if (existing.rows[0]) return { id: existing.rows[0].id, invoiceId: existing.rows[0].invoice_id };
    let customerId = parsed.data.customerId;
    if (customerId) {
      const customer = await client.query(`select id from public.customers where tenant_id=$1 and id=$2 and status='active'`, [actor.workspace.id, customerId]);
      if (!customer.rowCount) throw new Error("Customer is unavailable.");
    } else {
      const walkIn = await client.query<{ id: string }>(`select id from public.customers where tenant_id=$1 and lower(name)='walk-in customer' and status='active' order by created_at limit 1`, [actor.workspace.id]);
      customerId = walkIn.rows[0]?.id ?? null;
      if (!customerId) {
        const inserted = await client.query<{ id: string }>(`insert into public.customers(tenant_id,name,customer_type,status,notes) values($1,'Walk-in customer','other','active','System customer for anonymous point-of-sale transactions.') returning id`, [actor.workspace.id]);
        customerId = inserted.rows[0]?.id ?? null;
      }
    }
    if (!customerId) throw new Error("A customer record could not be resolved.");
    if (parsed.data.jobId) {
      const job = await client.query(`select id from public.service_jobs where tenant_id=$1 and id=$2 and customer_id=$3 and status not in ('canceled','lost')`, [actor.workspace.id, parsed.data.jobId, customerId]);
      if (!job.rowCount) throw new Error("The selected job does not belong to this customer.");
    }
    const invoice = await client.query<{ id: string }>(`insert into public.service_invoices(tenant_id,customer_id,job_id,title,status,subtotal_cents,discount_cents,tax_cents,total_cents,amount_paid_cents,tax_rate_bps,internal_notes,manual_payment_notes)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Created through Ferocity POS.',$12) returning id`, [
      actor.workspace.id, customerId, parsed.data.jobId, parsed.data.title, paid ? "paid" : "draft",
      totals.subtotalCents, totals.discountCents, totals.taxCents, totals.totalCents, paid ? totals.totalCents : 0,
      parsed.data.taxRateBps, paid ? `Tender recorded as ${parsed.data.tenderType}; no card was charged by Ferocity.` : "Payment remains unpaid."
    ]);
    const invoiceId = invoice.rows[0]?.id;
    if (!invoiceId) throw new Error("Invoice creation failed.");
    const sale = await client.query<{ id: string }>(`insert into public.pos_sales(tenant_id,customer_id,invoice_id,job_id,status,tender_type,subtotal_cents,discount_cents,tax_cents,total_cents,idempotency_key,external_reference,created_by_user_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, [
      actor.workspace.id, customerId, invoiceId, parsed.data.jobId, paid ? "completed" : "open", parsed.data.tenderType,
      totals.subtotalCents, totals.discountCents, totals.taxCents, totals.totalCents, parsed.data.idempotencyKey,
      parsed.data.externalReference, actor.userId === "admin-token" ? null : actor.userId
    ]);
    const saleId = sale.rows[0]?.id;
    if (!saleId) throw new Error("POS sale creation failed.");
    for (const [position, item] of parsed.data.items.entries()) {
      let inventoryContext: { locationId: string; unitCostCents: number } | null = null;
      if (item.inventoryItemId) {
        const stock = await client.query<{ quantity: string; unit_cost_cents: number; location_id: string; reserved: string }>(
          `select b.quantity::text,i.unit_cost_cents,b.location_id,
                  coalesce((select sum(r.quantity-r.consumed_quantity-r.released_quantity)
                    from public.inventory_reservations r where r.tenant_id=b.tenant_id and r.inventory_item_id=b.inventory_item_id
                      and r.location_id=b.location_id and r.status in ('reserved','partially_consumed')),0)::text reserved
             from public.service_inventory_items i
             join public.inventory_location_balances b on b.tenant_id=i.tenant_id and b.inventory_item_id=i.id
             join public.inventory_locations l on l.tenant_id=b.tenant_id and l.id=b.location_id and l.active
            where i.tenant_id=$1 and i.id=$2 and i.status<>'retired'
            order by (b.location_id=i.inventory_location_id) desc,b.quantity desc for update of i,b`,
          [actor.workspace.id, item.inventoryItemId]
        );
        const stockRow = stock.rows.find((row) => Number(row.quantity)-Number(row.reserved) >= item.quantity);
        const available = Number(stockRow?.quantity ?? Number.NaN) - Number(stockRow?.reserved ?? 0);
        if (!Number.isFinite(available) || available < item.quantity) throw new Error(`Insufficient inventory for ${item.name}.`);
        inventoryContext = { locationId: stockRow!.location_id, unitCostCents: stockRow!.unit_cost_cents };
      }
      const line = await client.query<{ id: string }>(`insert into public.invoice_line_items(tenant_id,invoice_id,name,quantity,unit_price_cents,total_cents,position) values($1,$2,$3,$4,$5,$6,$7) returning id`, [actor.workspace.id, invoiceId, item.name, item.quantity, item.unitPriceCents, totals.lineTotals[position], position]);
      const unitCostCents = inventoryContext?.unitCostCents ?? 0;
      await client.query(`insert into public.pos_sale_items(tenant_id,pos_sale_id,invoice_line_item_id,inventory_item_id,name,quantity,unit_price_cents,total_cents,unit_cost_cents) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [actor.workspace.id, saleId, line.rows[0].id, item.inventoryItemId, item.name, item.quantity, item.unitPriceCents, totals.lineTotals[position], unitCostCents]);
      if (item.inventoryItemId) {
        await client.query(`update public.inventory_location_balances set quantity=quantity-$4,updated_at=now() where tenant_id=$1 and inventory_item_id=$2 and location_id=$3`, [actor.workspace.id,item.inventoryItemId,inventoryContext?.locationId,item.quantity]);
        await client.query(`update public.service_inventory_items set quantity=quantity-$3, updated_at=now() where tenant_id=$1 and id=$2`, [actor.workspace.id, item.inventoryItemId, item.quantity]);
        await client.query(`insert into public.inventory_transactions(tenant_id,inventory_item_id,from_location_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key,created_by_user_id) values($1,$2,$3,'consume',$4,$5,$6,'pos',$7,$8)`, [actor.workspace.id, item.inventoryItemId, inventoryContext?.locationId, -item.quantity, unitCostCents, `POS sale ${saleId}`, `${parsed.data.idempotencyKey}:inventory:${position}`, actor.userId === "admin-token" ? null : actor.userId]);
      }
    }
    await client.query(`insert into public.service_ledger_entries(tenant_id,customer_id,invoice_id,entry_type,direction,amount_cents,currency,description,provider,metadata_json) values($1,$2,$3,'invoice_issued','debit',$4,'usd',$5,'ferocity_pos',$6::jsonb)`, [actor.workspace.id, customerId, invoiceId, totals.totalCents, parsed.data.title, JSON.stringify({ posSaleId: saleId })]);
    if (paid) {
      const provider = parsed.data.tenderType === "card_external" || parsed.data.tenderType === "external" ? "external" : "manual";
      const payment = await client.query<{ id: string }>(`insert into public.service_invoice_payments(tenant_id,customer_id,invoice_id,provider,provider_payment_id,status,amount_cents,net_cents,currency,paid_at,idempotency_key,metadata_json)
        values($1,$2,$3,$4,$5,'succeeded',$6,$6,'usd',now(),$7,$8::jsonb) returning id`, [actor.workspace.id, customerId, invoiceId, provider, parsed.data.externalReference, totals.totalCents, `${parsed.data.idempotencyKey}:payment`, JSON.stringify({ posSaleId: saleId, tenderType: parsed.data.tenderType })]);
      await client.query(`insert into public.service_ledger_entries(tenant_id,customer_id,invoice_id,payment_id,entry_type,direction,amount_cents,currency,description,provider,metadata_json) values($1,$2,$3,$4,'payment_received','credit',$5,'usd',$6,$7,$8::jsonb)`, [actor.workspace.id, customerId, invoiceId, payment.rows[0].id, totals.totalCents, `POS ${parsed.data.tenderType} payment recorded.`, provider, JSON.stringify({ posSaleId: saleId })]);
    }
    return { id: saleId, invoiceId };
  });
  if (!transaction.ok) {
    return {
      ok: false,
      error: safePosError(transaction.error, "The sale could not be completed. No partial sale was saved; your entries are still here so you can correct and retry.")
    };
  }
  const result = transaction.value;
  revalidatePath("/app/pos"); revalidatePath("/app/service"); revalidatePath("/app/service/inventory"); revalidatePath("/app/cash-collection");
  redirect(`/app/pos/sales/${result.id}?created=1`);
}

export async function recordPosReturnAction(
  _state: PosActionState,
  formData: FormData
): Promise<PosActionState> {
  const actor = await requirePermission("lead:manage");
  const saleId = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const restock = formData.get("restock") === "on";
  let requested: { itemId: string; quantity: number }[] = [];
  try { requested = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { ok: false, error: "The return items could not be read. Review them and try again." }; }
  if (!z.string().uuid().safeParse(saleId).success || !z.string().uuid().safeParse(idempotencyKey).success || !reason || !requested.length) return { ok: false, error: "Choose at least one item and enter a return reason." };
  const transaction = await withPostgresTransactionResult(async (client) => {
    const existing = await client.query<{ id: string }>(`select id from public.pos_returns where tenant_id=$1 and idempotency_key=$2`, [actor.workspace.id, idempotencyKey]);
    if (existing.rows[0]) return existing.rows[0];
    const sale = await client.query<{ id: string; invoice_id: string; total_cents: number; subtotal_cents: number; status: string }>(`select id,invoice_id,total_cents,subtotal_cents,status from public.pos_sales where tenant_id=$1 and id=$2 and status not in ('refunded','void') for update`, [actor.workspace.id, saleId]);
    const current = sale.rows[0];
    if (!current) throw new Error("Sale is unavailable for return.");
    const saleItems = await client.query<{ id: string; inventory_item_id: string | null; quantity: string; unit_price_cents: number; unit_cost_cents: number; returned: string }>(`
      select i.id,i.inventory_item_id,i.quantity::text,i.unit_price_cents,i.unit_cost_cents,
        coalesce((select sum(ri.quantity) from public.pos_return_items ri where ri.pos_sale_item_id=i.id),0)::text as returned
      from public.pos_sale_items i where i.tenant_id=$1 and i.pos_sale_id=$2 for update`, [actor.workspace.id, saleId]);
    const requestedByItem = new Map<string, number>();
    for (const request of requested) {
      const quantity = Number(request.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Return quantity exceeds the remaining sold quantity.");
      requestedByItem.set(request.itemId, (requestedByItem.get(request.itemId) ?? 0) + quantity);
    }
    let rawReturnCents = 0;
    const accepted: { row: typeof saleItems.rows[number]; quantity: number; amount: number }[] = [];
    for (const [itemId, quantity] of requestedByItem) {
      const row = saleItems.rows.find((item) => item.id === itemId);
      if (!row || !Number.isFinite(quantity) || quantity <= 0 || quantity > Number(row.quantity) - Number(row.returned)) throw new Error("Return quantity exceeds the remaining sold quantity.");
      const amount = Math.round(quantity * row.unit_price_cents);
      rawReturnCents += amount;
      accepted.push({ row, quantity, amount });
    }
    const prior = await client.query<{ total: string }>(`select coalesce(sum(amount_cents),0)::text as total from public.pos_returns where tenant_id=$1 and pos_sale_id=$2`, [actor.workspace.id, saleId]);
    const remainingRefundable = Math.max(0, current.total_cents - Number(prior.rows[0]?.total ?? 0));
    const refundCents = Math.min(remainingRefundable, current.subtotal_cents > 0 ? Math.round(current.total_cents * rawReturnCents / current.subtotal_cents) : rawReturnCents);
    if (refundCents <= 0) throw new Error("No refundable balance remains.");
    let refundId: string | null = null;
    const paymentBalance = await client.query<{ refundable_cents: string }>(
      `select coalesce(sum(greatest(amount_cents-refunded_amount_cents,0)),0)::text as refundable_cents
       from public.service_invoice_payments
       where tenant_id=$1 and invoice_id=$2 and status in ('succeeded','manual','partially_refunded')`,
      [actor.workspace.id, current.invoice_id]
    );
    const hasRecordedPayment = Number(paymentBalance.rows[0]?.refundable_cents ?? 0) > 0;
    if (hasRecordedPayment) {
      const refund = await recordInvoiceRefundAcrossPaymentsWithClient(client, {
        tenantId: actor.workspace.id,
        invoiceId: current.invoice_id,
        amountCents: refundCents,
        idempotencyKey: `pos-return:${idempotencyKey}`,
        reason,
        source: "ferocity_pos",
        requestedByUserId: actor.userId === "admin-token" ? null : actor.userId,
        reduceInvoiceTotal: true,
        invoiceCreditCents: refundCents,
        metadata: { posSaleId: saleId, externallyRecorded: true }
      });
      if (refund.status !== "recorded") throw new Error("No refundable balance remains.");
      refundId = refund.refundIds[0] ?? null;
    }
    const returned = await client.query<{ id: string }>(`insert into public.pos_returns(tenant_id,pos_sale_id,payment_refund_id,amount_cents,reason,idempotency_key,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7) returning id`, [actor.workspace.id, saleId, refundId, refundCents, reason, idempotencyKey, actor.userId === "admin-token" ? null : actor.userId]);
    for (const item of accepted) {
      await client.query(`insert into public.pos_return_items(tenant_id,pos_return_id,pos_sale_item_id,quantity,amount_cents,restocked) values($1,$2,$3,$4,$5,$6)`, [actor.workspace.id, returned.rows[0].id, item.row.id, item.quantity, item.amount, restock && Boolean(item.row.inventory_item_id)]);
      if (restock && item.row.inventory_item_id) {
        const location = await client.query<{ id: string }>(`select l.id from public.service_inventory_items i join public.inventory_locations l on l.tenant_id=i.tenant_id and l.id=i.inventory_location_id and l.active where i.tenant_id=$1 and i.id=$2 for update of i,l`, [actor.workspace.id,item.row.inventory_item_id]);
        const locationId = location.rows[0]?.id;
        if (!locationId) throw new Error(`Insufficient inventory for returned item.`);
        await client.query(`insert into public.inventory_location_balances(tenant_id,inventory_item_id,location_id,quantity) values($1,$2,$3,$4) on conflict(tenant_id,inventory_item_id,location_id) do update set quantity=public.inventory_location_balances.quantity+excluded.quantity,updated_at=now()`, [actor.workspace.id,item.row.inventory_item_id,locationId,item.quantity]);
        await client.query(`update public.service_inventory_items set quantity=quantity+$3,updated_at=now() where tenant_id=$1 and id=$2`, [actor.workspace.id, item.row.inventory_item_id, item.quantity]);
        await client.query(`insert into public.inventory_transactions(tenant_id,inventory_item_id,to_location_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key,created_by_user_id) values($1,$2,$3,'return',$4,$5,$6,'pos',$7,$8)`, [actor.workspace.id, item.row.inventory_item_id, locationId, item.quantity, item.row.unit_cost_cents, reason, `${idempotencyKey}:inventory:${item.row.id}`, actor.userId === "admin-token" ? null : actor.userId]);
      }
    }
    const totalReturned = Number(prior.rows[0]?.total ?? 0) + refundCents;
    await client.query(`update public.pos_sales set status=$3,updated_at=now() where tenant_id=$1 and id=$2`, [actor.workspace.id, saleId, totalReturned >= current.total_cents ? "refunded" : "partially_refunded"]);
    if (!hasRecordedPayment) {
      await client.query(
        `update public.service_invoices set
           total_cents=greatest(total_cents-$3,0),credit_cents=credit_cents+$3,
           status=case when greatest(total_cents-$3,0)=0 then 'void' else 'draft' end,
           internal_notes=concat_ws(E'\n',nullif(internal_notes,''),$4),updated_at=now()
         where tenant_id=$1 and id=$2`,
        [actor.workspace.id, current.invoice_id, refundCents, `POS return ${returned.rows[0].id}: ${reason}`]
      );
      await client.query(
        `insert into public.service_ledger_entries(tenant_id,invoice_id,entry_type,direction,amount_cents,currency,description,provider,provider_event_id,metadata_json)
         values($1,$2,'adjustment','credit',$3,'usd',$4,'ferocity_pos',$5,$6::jsonb)
         on conflict (tenant_id,provider_event_id,entry_type) where provider_event_id is not null do nothing`,
        [actor.workspace.id, current.invoice_id, refundCents, reason, `pos-return:${idempotencyKey}`, JSON.stringify({ posSaleId: saleId, posReturnId: returned.rows[0].id, unpaidReturn: true })]
      );
    }
    return returned.rows[0];
  });
  if (!transaction.ok) {
    return {
      ok: false,
      error: safePosError(transaction.error, "The return could not be recorded. No partial return was saved; your entries are still here so you can correct and retry.")
    };
  }
  revalidatePath("/app/pos"); revalidatePath(`/app/pos/sales/${saleId}`); revalidatePath("/app/service/inventory"); revalidatePath("/app/cash-collection");
  redirect(`/app/pos/sales/${saleId}?returned=1`);
}
