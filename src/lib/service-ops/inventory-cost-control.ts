import "server-only";

import type pg from "pg";
import { withPostgresTransactionResult } from "@/lib/db/postgres";

type ControlResult = { status: "applied" | "existing" | "not_found" | "insufficient" | "invalid"; recordId: string | null };

async function run(operation: (client: pg.PoolClient) => Promise<ControlResult>) {
  const result = await withPostgresTransactionResult(operation);
  if (!result.ok) throw new Error("Ferocity could not update material records safely.", { cause: result.error });
  return result.value;
}

export async function recordSupplierReturn(input: { tenantId: string; receiptItemId: string; locationId: string; quantity: number; reason: string; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`supplier-return:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await client.query<{ id: string }>("select id from public.supplier_returns where tenant_id=$1 and idempotency_key=$2", [input.tenantId,input.idempotencyKey]);
    if (duplicate.rows[0]) return { status: "existing", recordId: duplicate.rows[0].id };
    if (input.quantity <= 0) return { status: "invalid", recordId: null };

    const source = await client.query<{
      receipt_item_id: string; receipt_id: string; purchase_order_id: string; supplier_id: string | null;
      inventory_item_id: string; unit_cost_cents: number; inventory_unit_cost_cents: number; total_quantity: string; received: string; returned: string; on_hand: string; reserved: string;
    }>(
      `select ri.id receipt_item_id,r.id receipt_id,r.purchase_order_id,po.supplier_id,ri.inventory_item_id,
              poi.unit_price_cents,i.unit_cost_cents inventory_unit_cost_cents,i.quantity::text total_quantity,ri.quantity_received::text received,
              coalesce((select sum(sri.quantity) from public.supplier_return_items sri
                join public.supplier_returns sr on sr.tenant_id=sri.tenant_id and sr.id=sri.supplier_return_id
                where sri.tenant_id=ri.tenant_id and sri.receipt_item_id=ri.id and sr.status<>'canceled'),0)::text returned,
              b.quantity::text on_hand,
              coalesce((select sum(ir.quantity-ir.consumed_quantity-ir.released_quantity)
                from public.inventory_reservations ir where ir.tenant_id=b.tenant_id and ir.inventory_item_id=b.inventory_item_id
                  and ir.location_id=b.location_id and ir.status in ('reserved','partially_consumed')),0)::text reserved
         from public.purchase_order_receipt_items ri
         join public.purchase_order_receipts r on r.tenant_id=ri.tenant_id and r.id=ri.receipt_id and r.status<>'reversed'
         join public.purchase_order_items poi on poi.tenant_id=ri.tenant_id and poi.id=ri.purchase_order_item_id
         join public.purchase_orders po on po.tenant_id=ri.tenant_id and po.id=r.purchase_order_id and po.status<>'cancelled'
         join public.service_inventory_items i on i.tenant_id=ri.tenant_id and i.id=ri.inventory_item_id and i.status<>'retired'
         join public.inventory_locations l on l.tenant_id=ri.tenant_id and l.id=$3 and l.active
         join public.inventory_location_balances b on b.tenant_id=ri.tenant_id and b.inventory_item_id=ri.inventory_item_id and b.location_id=l.id
        where ri.tenant_id=$1 and ri.id=$2
        for update of ri,i,b`,
      [input.tenantId,input.receiptItemId,input.locationId]
    );
    const row = source.rows[0];
    if (!row?.inventory_item_id) return { status: "not_found", recordId: null };
    if (Number(row.received) - Number(row.returned) < input.quantity) return { status: "insufficient", recordId: null };
    if (Number(row.on_hand) - Number(row.reserved) < input.quantity) return { status: "insufficient", recordId: null };
    const expectedCredit = Math.round(input.quantity * row.unit_cost_cents);
    const remainingQuantity = Number(row.total_quantity) - input.quantity;
    const remainingValue = Math.round(Number(row.total_quantity) * row.inventory_unit_cost_cents) - expectedCredit;
    if (remainingQuantity < 0 || remainingValue < 0) throw new Error("Inventory valuation is inconsistent; the supplier return was not recorded.");
    const remainingUnitCost = remainingQuantity === 0 ? 0 : Math.round(remainingValue / remainingQuantity);
    const header = await client.query<{ id: string }>(
      `insert into public.supplier_returns (
         tenant_id,supplier_id,purchase_order_id,purchase_receipt_id,source_location_id,status,credit_status,
         expected_credit_cents,reason,idempotency_key,shipped_at
       ) values ($1,$2,$3,$4,$5,'shipped','pending',$6,$7,$8,now()) returning id`,
      [input.tenantId,row.supplier_id,row.purchase_order_id,row.receipt_id,input.locationId,expectedCredit,input.reason,input.idempotencyKey]
    );
    const returnId = header.rows[0]?.id;
    if (!returnId) throw new Error("Supplier return was not recorded.");
    await client.query(
      `insert into public.supplier_return_items (
         tenant_id,supplier_return_id,receipt_item_id,inventory_item_id,quantity,unit_cost_cents,extended_cost_cents
       ) values ($1,$2,$3,$4,$5,$6,$7)`,
      [input.tenantId,returnId,row.receipt_item_id,row.inventory_item_id,input.quantity,row.unit_cost_cents,expectedCredit]
    );
    await client.query(
      `update public.inventory_location_balances set quantity=quantity-$4,updated_at=now()
        where tenant_id=$1 and inventory_item_id=$2 and location_id=$3`,
      [input.tenantId,row.inventory_item_id,input.locationId,input.quantity]
    );
    const total = await client.query<{ id: string }>(
      `update public.service_inventory_items set quantity=quantity-$3,unit_cost_cents=$4,updated_at=now()
        where tenant_id=$1 and id=$2 and quantity >= $3 returning id`,
      [input.tenantId,row.inventory_item_id,input.quantity,remainingUnitCost]
    );
    if (!total.rows[0]) throw new Error("Inventory totals are inconsistent; the supplier return was not recorded.");
    await client.query(
      `insert into public.inventory_transactions (
         tenant_id,inventory_item_id,from_location_id,purchase_order_id,supplier_return_id,transaction_type,
         quantity_delta,unit_cost_cents,reason,source,idempotency_key
       ) values ($1,$2,$3,$4,$5,'return',$6*-1,$7,$8,'supplier_return',$9)`,
      [input.tenantId,row.inventory_item_id,input.locationId,row.purchase_order_id,returnId,input.quantity,row.unit_cost_cents,input.reason,`supplier-return:${input.idempotencyKey}`]
    );
    return { status: "applied", recordId: returnId };
  });
}

export async function confirmSupplierReturnCredit(input: { tenantId: string; supplierReturnId: string; disposition: "confirmed" | "not_expected"; amountCents: number | null; reference: string | null; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`supplier-credit:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await client.query<{ id: string }>("select id from public.supplier_returns where tenant_id=$1 and credit_idempotency_key=$2", [input.tenantId,input.idempotencyKey]);
    if (duplicate.rows[0]) return { status: "existing", recordId: duplicate.rows[0].id };
    if (input.disposition === "confirmed" && (input.amountCents === null || input.amountCents < 0 || !input.reference)) return { status: "invalid", recordId: null };
    const updated = await client.query<{ id: string }>(
      `update public.supplier_returns
          set credit_status=$3,confirmed_credit_cents=case when $3='confirmed' then $4 else null end,
              vendor_credit_reference=case when $3='confirmed' then $5 else null end,
              credit_idempotency_key=$6,status=case when $3='confirmed' then 'credited' else status end,
              credited_at=case when $3='confirmed' then now() else null end,updated_at=now()
        where tenant_id=$1 and id=$2 and status='shipped' and credit_status='pending'
        returning id`,
      [input.tenantId,input.supplierReturnId,input.disposition,input.amountCents,input.reference,input.idempotencyKey]
    );
    return updated.rows[0] ? { status: "applied", recordId: updated.rows[0].id } : { status: "not_found", recordId: null };
  });
}

export async function allocateConsumedMaterial(input: { tenantId: string; sourceTransactionId: string; serviceJobId: string | null; customerLocationId: string | null; quantity: number; note: string | null; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`material-allocation:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await client.query<{ id: string }>("select id from public.inventory_material_allocations where tenant_id=$1 and idempotency_key=$2", [input.tenantId,input.idempotencyKey]);
    if (duplicate.rows[0]) return { status: "existing", recordId: duplicate.rows[0].id };
    if (input.quantity <= 0 || (!input.serviceJobId && !input.customerLocationId)) return { status: "invalid", recordId: null };
    const source = await client.query<{ id: string; inventory_item_id: string; item_name: string; unit: string | null; source_quantity: string; unit_cost_cents: number; allocated_quantity: string; allocated_cost_cents: string }>(
      `with t as (
         select * from public.inventory_transactions
          where tenant_id=$1 and id=$2 and transaction_type='consume' and quantity_delta<0 and source='inventory_control'
          for update
       )
       select t.id,t.inventory_item_id,i.name item_name,i.unit,abs(t.quantity_delta)::text source_quantity,t.unit_cost_cents,
              coalesce(sum(a.quantity) filter (where a.status='active'),0)::text allocated_quantity,
              coalesce(sum(a.cost_cents) filter (where a.status='active'),0)::text allocated_cost_cents
         from t
         join public.service_inventory_items i on i.tenant_id=t.tenant_id and i.id=t.inventory_item_id
         left join public.inventory_material_allocations a on a.tenant_id=t.tenant_id and a.source_transaction_id=t.id
        group by t.id,t.inventory_item_id,i.name,i.unit,t.quantity_delta,t.unit_cost_cents`,
      [input.tenantId,input.sourceTransactionId]
    );
    const row = source.rows[0];
    if (!row) return { status: "not_found", recordId: null };
    const target = await client.query<{ job_id: string | null; location_id: string | null }>(
      `select j.id job_id,l.id location_id
         from (select 1) seed
         left join public.service_jobs j on j.tenant_id=$1 and j.id=$2::uuid and j.status not in ('canceled','lost')
         left join public.customer_locations l on l.tenant_id=$1 and l.id=$3::uuid and l.active
        where ($2::uuid is null or j.id is not null) and ($3::uuid is null or l.id is not null)
          and (j.id is null or l.id is null or j.location_id is null or j.location_id=l.id)`,
      [input.tenantId,input.serviceJobId,input.customerLocationId]
    );
    if (!target.rows[0]) return { status: "not_found", recordId: null };
    const sourceQuantity = Number(row.source_quantity);
    const allocatedQuantity = Number(row.allocated_quantity);
    const remainingQuantity = sourceQuantity - allocatedQuantity;
    if (remainingQuantity + 0.000001 < input.quantity) return { status: "insufficient", recordId: null };
    const totalCost = Math.round(sourceQuantity * row.unit_cost_cents);
    const remainingCost = totalCost - Number(row.allocated_cost_cents);
    const costCents = Math.abs(remainingQuantity - input.quantity) < 0.000001
      ? remainingCost
      : Math.min(remainingCost, Math.round((totalCost * input.quantity) / sourceQuantity));
    const allocation = await client.query<{ id: string }>(
      `insert into public.inventory_material_allocations (
         tenant_id,source_transaction_id,service_job_id,customer_location_id,quantity,cost_cents,note,idempotency_key
       ) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [input.tenantId,row.id,input.serviceJobId,input.customerLocationId,input.quantity,costCents,input.note,input.idempotencyKey]
    );
    const allocationId = allocation.rows[0]?.id;
    if (!allocationId) throw new Error("Material allocation was not recorded.");
    const material = await client.query<{ id: string }>(
      `insert into public.job_material_list_items (
         tenant_id,service_job_id,material_name,quantity,unit,actual_cost_cents,status,source,notes,metadata_json
       ) values ($1,$2,$3,$4,$5,$6,'used','field',$7,jsonb_build_object(
         'inventoryAllocationId',$8::text,'sourceInventoryTransactionId',$9::text,'customerLocationId',$10::text
       )) returning id`,
      [input.tenantId,input.serviceJobId,row.item_name,input.quantity,row.unit,costCents,input.note,allocationId,row.id,input.customerLocationId]
    );
    const materialId = material.rows[0]?.id;
    if (!materialId) throw new Error("Allocated job material was not recorded.");
    await client.query("update public.inventory_material_allocations set material_list_item_id=$3,updated_at=now() where tenant_id=$1 and id=$2", [input.tenantId,allocationId,materialId]);
    return { status: "applied", recordId: allocationId };
  });
}

export async function cancelMaterialAllocation(input: { tenantId: string; allocationId: string; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`material-allocation-cancel:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await client.query<{ id: string }>("select id from public.inventory_material_allocations where tenant_id=$1 and cancellation_idempotency_key=$2", [input.tenantId,input.idempotencyKey]);
    if (duplicate.rows[0]) return { status: "existing", recordId: duplicate.rows[0].id };
    const canceled = await client.query<{ id: string; material_list_item_id: string | null }>(
      `update public.inventory_material_allocations
          set status='canceled',cancellation_idempotency_key=$3,canceled_at=now(),updated_at=now()
        where tenant_id=$1 and id=$2 and status='active'
        returning id,material_list_item_id`,
      [input.tenantId,input.allocationId,input.idempotencyKey]
    );
    const row = canceled.rows[0];
    if (!row) return { status: "not_found", recordId: null };
    if (row.material_list_item_id) {
      await client.query("update public.job_material_list_items set status='cancelled',updated_at=now() where tenant_id=$1 and id=$2", [input.tenantId,row.material_list_item_id]);
    }
    return { status: "applied", recordId: row.id };
  });
}
