"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { confirmSupplierReturnCredit, recordSupplierReturn } from "@/lib/service-ops/inventory-cost-control";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const receiveSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(1_000_000),
  locationId: z.string().uuid(),
  packingSlip: z.string().trim().max(120).optional(),
  receiptKey: z.string().min(16).max(120)
});

const supplierReturnSchema = z.object({
  receiptItemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(1_000_000),
  reason: z.string().trim().min(2).max(500),
  idempotencyKey: z.string().uuid()
});

const supplierCreditSchema = z.object({
  supplierReturnId: z.string().uuid(),
  disposition: z.enum(["confirmed", "not_expected"]),
  amount: z.string().trim().max(30).optional(),
  reference: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().uuid()
}).superRefine((value, context) => {
  if (value.disposition === "confirmed" && (!value.reference || !value.amount || Number(value.amount) < 0)) {
    context.addIssue({ code: "custom", message: "Confirmed credits require a nonnegative amount and vendor reference." });
  }
});

const billSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  billNumber: z.string().trim().min(1).max(120),
  billDate: z.string().date().optional().or(z.literal("")),
  dueDate: z.string().date().optional().or(z.literal("")),
  subtotalCents: z.coerce.number().int().min(0),
  taxCents: z.coerce.number().int().min(0),
  notes: z.string().trim().max(1000).optional()
});

const billStatusSchema = z.object({
  billId: z.string().uuid(),
  status: z.enum(["draft", "review", "approved", "exported", "paid", "void"])
});

function refresh() {
  revalidatePath("/app/purchasing");
  revalidatePath("/app/service/inventory");
  revalidatePath("/app/cash-collection");
  revalidatePath("/app");
}

function requireInventoryResult(status: string) {
  if (status === "applied" || status === "existing") return;
  if (status === "insufficient") throw new Error("The return exceeds received or currently available unreserved stock.");
  throw new Error("The supplier return could not be applied to the selected records.");
}

export async function recordSupplierReturnAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = supplierReturnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await recordSupplierReturn({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireInventoryResult(result.status);
  refresh();
}

export async function confirmSupplierReturnCreditAction(formData: FormData) {
  await requirePermission("billing:manage");
  const parsed = supplierCreditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await confirmSupplierReturnCredit({
    tenantId: await getCurrentWorkspaceId(),
    supplierReturnId: parsed.data.supplierReturnId,
    disposition: parsed.data.disposition,
    amountCents: parsed.data.disposition === "confirmed" ? Math.round(Number(parsed.data.amount) * 100) : null,
    reference: parsed.data.disposition === "confirmed" ? parsed.data.reference ?? null : null,
    idempotencyKey: parsed.data.idempotencyKey
  });
  requireInventoryResult(result.status);
  refresh();
}

export async function receivePurchaseOrderItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = receiveSchema.safeParse({
    purchaseOrderItemId: formData.get("purchaseOrderItemId"),
    inventoryItemId: formData.get("inventoryItemId"),
    quantity: formData.get("quantity"),
    locationId: String(formData.get("locationId") ?? ""),
    packingSlip: String(formData.get("packingSlip") ?? "") || undefined,
    receiptKey: formData.get("receiptKey")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with item as (
      select poi.id, poi.purchase_order_id, poi.product_name, poi.sku, poi.quantity, poi.unit_price_cents,
             po.supplier_id
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id and po.tenant_id = poi.tenant_id
      where poi.tenant_id = $1 and poi.id = $2
        and poi.status <> 'cancelled' and po.status not in ('cancelled','reconciled')
    ),
    received_before as (
      select coalesce(sum(pri.quantity_received), 0) as quantity
      from public.purchase_order_receipt_items pri
      join public.purchase_order_receipts pr on pr.id = pri.receipt_id and pr.tenant_id = pri.tenant_id
      where pri.tenant_id = $1 and pri.purchase_order_item_id = $2 and pr.status <> 'reversed'
    ),
    matched_inventory as (
      select inv.id
      from public.service_inventory_items inv,item i
      where inv.tenant_id=$1 and inv.id=$7 and inv.status <> 'retired'
        and ((i.sku is not null and inv.sku is not null and lower(inv.sku)=lower(i.sku)) or lower(inv.name)=lower(i.product_name))
    ),
    matched_location as (
      select l.id
      from public.inventory_locations l
      where l.tenant_id=$1 and l.id=$4::uuid and l.active
    ),
    receipt as (
      insert into public.purchase_order_receipts (
        tenant_id, purchase_order_id, destination_location_id, packing_slip_number,
        status, notes, idempotency_key
      )
      select $1, i.purchase_order_id, $4::uuid, nullif($5, ''),
             case when rb.quantity + $3 >= i.quantity then 'received' else 'partial' end,
             'Recorded from the Ferocity purchasing desk.', $6
      from item i cross join received_before rb cross join matched_inventory cross join matched_location
      where rb.quantity + $3 <= i.quantity
      on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
      returning id, purchase_order_id
    ),
    receipt_item as (
      insert into public.purchase_order_receipt_items (
        tenant_id, receipt_id, purchase_order_item_id, inventory_item_id, quantity_received
      )
      select $1, r.id, i.id, inventory.id, $3
      from receipt r
      join item i on i.purchase_order_id = r.purchase_order_id
      join matched_inventory inventory on true
      returning receipt_id, inventory_item_id
    ),
    movement as (
      insert into public.inventory_transactions (
        tenant_id, inventory_item_id, to_location_id, purchase_order_id,
        transaction_type, quantity_delta, unit_cost_cents, reason, source, idempotency_key
      )
      select $1, ri.inventory_item_id, $4::uuid, r.purchase_order_id,
             'receive', $3, i.unit_price_cents, 'Purchase order receipt', 'purchasing_desk', $6
      from receipt_item ri
      join receipt r on r.id = ri.receipt_id
      join item i on i.purchase_order_id=r.purchase_order_id
      on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
      returning inventory_item_id, quantity_delta
    ),
    location_stock as (
      insert into public.inventory_location_balances (tenant_id,inventory_item_id,location_id,quantity)
      select $1,inventory_item_id,$4::uuid,quantity_delta from movement
      on conflict (tenant_id,inventory_item_id,location_id)
      do update set quantity=public.inventory_location_balances.quantity+excluded.quantity,updated_at=now()
      returning inventory_item_id
    ),
    stock as (
      update public.service_inventory_items inv
      set quantity = inv.quantity + m.quantity_delta,
          unit_cost_cents = case when inv.quantity+m.quantity_delta=0 then m.unit_cost_cents
            else round((inv.quantity*inv.unit_cost_cents+m.quantity_delta*m.unit_cost_cents)/(inv.quantity+m.quantity_delta))::integer end,
          inventory_location_id = $4::uuid,
          updated_at = now()
      from movement m
      where inv.tenant_id = $1 and inv.id = m.inventory_item_id
        and exists (select 1 from location_stock ls where ls.inventory_item_id=inv.id)
    )
    update public.purchase_orders po
    set status = case
          when rb.quantity + $3 >= i.quantity
            and not exists (
              select 1
              from public.purchase_order_items other
              where other.tenant_id = $1 and other.purchase_order_id = po.id
                and other.id <> i.id and other.status <> 'cancelled'
                and coalesce((
                  select sum(other_ri.quantity_received)
                  from public.purchase_order_receipt_items other_ri
                  join public.purchase_order_receipts other_r
                    on other_r.id = other_ri.receipt_id and other_r.tenant_id = other_ri.tenant_id
                  where other_ri.tenant_id = $1 and other_ri.purchase_order_item_id = other.id
                    and other_r.status <> 'reversed'
                ), 0) < other.quantity
            )
          then 'delivered'
          else 'picked_up'
        end,
        updated_at = now()
    from item i cross join received_before rb
    where po.tenant_id = $1 and po.id = i.purchase_order_id
      and exists (select 1 from receipt)
    `,
    [
      tenantId,
      parsed.data.purchaseOrderItemId,
      parsed.data.quantity,
      parsed.data.locationId,
      parsed.data.packingSlip ?? "",
      parsed.data.receiptKey,
      parsed.data.inventoryItemId
    ]
  );
  refresh();
}

export async function createVendorBillAction(formData: FormData) {
  await requirePermission("billing:manage");
  const parsed = billSchema.safeParse({
    purchaseOrderId: formData.get("purchaseOrderId"),
    billNumber: formData.get("billNumber"),
    billDate: String(formData.get("billDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    subtotalCents: Math.round(Number(formData.get("subtotal") ?? 0) * 100),
    taxCents: Math.round(Number(formData.get("tax") ?? 0) * 100),
    notes: String(formData.get("notes") ?? "") || undefined
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with po_totals as (
      select po.tenant_id,po.id,po.supplier_id,
        coalesce(sum(poi.extended_price_cents) filter(where poi.status <> 'cancelled'),0)::integer as ordered_subtotal,
        coalesce(sum(round(poi.unit_price_cents * coalesce(received.quantity,0))) filter(where poi.status <> 'cancelled'),0)::integer as received_subtotal,
        coalesce(bool_and(coalesce(received.quantity,0) >= poi.quantity) filter(where poi.status <> 'cancelled'),false) as fully_received
      from public.purchase_orders po
      left join public.purchase_order_items poi on poi.tenant_id=po.tenant_id and poi.purchase_order_id=po.id
      left join lateral (
        select coalesce(sum(pri.quantity_received),0) as quantity
        from public.purchase_order_receipt_items pri
        join public.purchase_order_receipts pr on pr.tenant_id=pri.tenant_id and pr.id=pri.receipt_id
        where pri.tenant_id=po.tenant_id and pri.purchase_order_item_id=poi.id and pr.status <> 'reversed'
      ) received on true
      where po.tenant_id=$1 and po.id=$2 and po.status not in ('cancelled','reconciled')
      group by po.tenant_id,po.id,po.supplier_id
    )
    insert into public.vendor_bills (
      tenant_id, supplier_id, purchase_order_id, bill_number, status,
      bill_date, due_date, subtotal_cents, tax_cents, total_cents, notes,
      expected_subtotal_cents,variance_cents,reconciliation_status
    )
    select totals.tenant_id, totals.supplier_id, totals.id, $3, 'review',
           nullif($4, '')::date, nullif($5, '')::date, $6, $7, $6 + $7, nullif($8, ''),
           case when totals.fully_received then totals.ordered_subtotal else totals.received_subtotal end,
           $6-case when totals.fully_received then totals.ordered_subtotal else totals.received_subtotal end,
           case when $6=case when totals.fully_received then totals.ordered_subtotal else totals.received_subtotal end then 'matched' else 'mismatch' end
    from po_totals totals
    on conflict (tenant_id, supplier_id, bill_number)
      where supplier_id is not null and bill_number is not null
    do update set
      purchase_order_id = excluded.purchase_order_id,
      bill_date = excluded.bill_date,
      due_date = excluded.due_date,
      subtotal_cents = excluded.subtotal_cents,
      tax_cents = excluded.tax_cents,
      total_cents = excluded.total_cents,
      notes = excluded.notes,
      expected_subtotal_cents=excluded.expected_subtotal_cents,
      variance_cents=excluded.variance_cents,
      reconciliation_status=excluded.reconciliation_status,
      updated_at = now()
    where public.vendor_bills.status in ('draft','review')
      and public.vendor_bills.external_accounting_id is null
    `,
    [
      tenantId,
      parsed.data.purchaseOrderId,
      parsed.data.billNumber,
      parsed.data.billDate || "",
      parsed.data.dueDate || "",
      parsed.data.subtotalCents,
      parsed.data.taxCents,
      parsed.data.notes ?? ""
    ]
  );
  refresh();
}

export async function updateVendorBillStatusAction(formData: FormData) {
  await requirePermission("billing:manage");
  const parsed = billStatusSchema.safeParse({
    billId: formData.get("billId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `update public.vendor_bills
     set status = $3, updated_at = now()
     where tenant_id = $1 and id = $2
       and external_accounting_id is null
       and $3 not in ('exported','paid')
       and ($3 <> 'approved' or reconciliation_status='matched')
       and (
         (status='draft' and $3 in ('review','void'))
         or (status='review' and $3 in ('draft','approved','void'))
         or (status='approved' and $3='void')
         or status=$3
       )`,
    [tenantId, parsed.data.billId, parsed.data.status]
  );
  refresh();
}
