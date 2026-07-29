"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const receiveSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(1_000_000),
  locationId: z.string().uuid().optional().or(z.literal("")),
  packingSlip: z.string().trim().max(120).optional(),
  receiptKey: z.string().min(16).max(120)
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

export async function receivePurchaseOrderItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = receiveSchema.safeParse({
    purchaseOrderItemId: formData.get("purchaseOrderItemId"),
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
      select poi.id, poi.purchase_order_id, poi.product_name, poi.sku, poi.quantity,
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
    receipt as (
      insert into public.purchase_order_receipts (
        tenant_id, purchase_order_id, destination_location_id, packing_slip_number,
        status, notes, idempotency_key
      )
      select $1, i.purchase_order_id, nullif($4, '')::uuid, nullif($5, ''),
             case when rb.quantity + $3 >= i.quantity then 'received' else 'partial' end,
             'Recorded from the Ferocity purchasing desk.', $6
      from item i cross join received_before rb
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
      left join lateral (
        select inv.id
        from public.service_inventory_items inv
        where inv.tenant_id = $1
          and (
            (i.sku is not null and inv.sku is not null and lower(inv.sku) = lower(i.sku))
            or lower(inv.name) = lower(i.product_name)
          )
        order by case when i.sku is not null and lower(coalesce(inv.sku, '')) = lower(i.sku) then 0 else 1 end
        limit 1
      ) inventory on true
      returning receipt_id, inventory_item_id
    ),
    movement as (
      insert into public.inventory_transactions (
        tenant_id, inventory_item_id, to_location_id, purchase_order_id,
        transaction_type, quantity_delta, reason, source, idempotency_key
      )
      select $1, ri.inventory_item_id, nullif($4, '')::uuid, r.purchase_order_id,
             'receive', $3, 'Purchase order receipt', 'purchasing_desk', $6
      from receipt_item ri
      join receipt r on r.id = ri.receipt_id
      where ri.inventory_item_id is not null
      on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
      returning inventory_item_id, quantity_delta
    ),
    stock as (
      update public.service_inventory_items inv
      set quantity = inv.quantity + m.quantity_delta,
          inventory_location_id = coalesce(nullif($4, '')::uuid, inv.inventory_location_id),
          updated_at = now()
      from movement m
      where inv.tenant_id = $1 and inv.id = m.inventory_item_id
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
      parsed.data.locationId || "",
      parsed.data.packingSlip ?? "",
      parsed.data.receiptKey
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
    insert into public.vendor_bills (
      tenant_id, supplier_id, purchase_order_id, bill_number, status,
      bill_date, due_date, subtotal_cents, tax_cents, total_cents, notes
    )
    select po.tenant_id, po.supplier_id, po.id, $3, 'review',
           nullif($4, '')::date, nullif($5, '')::date, $6, $7, $6 + $7, nullif($8, '')
    from public.purchase_orders po
    where po.tenant_id = $1 and po.id = $2
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
      updated_at = now()
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
    "update public.vendor_bills set status = $3, updated_at = now() where tenant_id = $1 and id = $2",
    [tenantId, parsed.data.billId, parsed.data.status]
  );
  refresh();
}

export async function queueAccountingSyncAction() {
  await requirePermission("billing:manage");
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with run as (
      insert into public.accounting_sync_runs (tenant_id, provider, direction, status)
      select $1, 'quickbooks_online', 'export', 'queued'
      where not exists (
        select 1 from public.accounting_sync_runs
        where tenant_id = $1 and provider = 'quickbooks_online' and status in ('queued','running')
      )
      returning id
    ),
    invoices as (
      insert into public.accounting_sync_records (
        tenant_id, sync_run_id, provider, entity_type, local_record_id, local_version, status
      )
      select $1, run.id, 'quickbooks_online', 'invoice', i.id, i.updated_at::text, 'pending'
      from run
      join public.service_invoices i on i.tenant_id = $1
      where i.accounting_status in ('not_synced','failed','conflict')
      on conflict (tenant_id, provider, entity_type, local_record_id)
        where local_record_id is not null
      do update set sync_run_id = excluded.sync_run_id, local_version = excluded.local_version,
                    status = 'pending', error_detail = null, updated_at = now()
      returning local_record_id
    ),
    bills as (
      insert into public.accounting_sync_records (
        tenant_id, sync_run_id, provider, entity_type, local_record_id, local_version, status
      )
      select $1, run.id, 'quickbooks_online', 'vendor_bill', b.id, b.updated_at::text, 'pending'
      from run
      join public.vendor_bills b on b.tenant_id = $1
      where b.status in ('approved','exported')
      on conflict (tenant_id, provider, entity_type, local_record_id)
        where local_record_id is not null
      do update set sync_run_id = excluded.sync_run_id, local_version = excluded.local_version,
                    status = 'pending', error_detail = null, updated_at = now()
      returning local_record_id
    )
    update public.accounting_sync_runs r
    set records_seen = (select count(*) from invoices) + (select count(*) from bills)
    from run
    where r.id = run.id
    `,
    [tenantId]
  );
  refresh();
}
