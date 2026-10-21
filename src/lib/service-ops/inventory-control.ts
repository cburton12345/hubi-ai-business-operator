import "server-only";

import type pg from "pg";
import { withPostgresTransactionResult } from "@/lib/db/postgres";

type InventoryResult = { status: "applied" | "existing" | "not_found" | "insufficient" | "invalid"; recordId: string | null };

async function run(operation: (client: pg.PoolClient) => Promise<InventoryResult>) {
  const result = await withPostgresTransactionResult(operation);
  if (!result.ok) throw new Error("Ferocity could not update inventory safely.", { cause: result.error });
  return result.value;
}

async function existingMovement(client: pg.PoolClient, tenantId: string, idempotencyKey: string) {
  const result = await client.query<{ id: string }>(
    "select id from public.inventory_transactions where tenant_id=$1 and idempotency_key=$2 limit 1",
    [tenantId, idempotencyKey]
  );
  return result.rows[0]?.id ?? null;
}

export async function transferInventory(input: { tenantId: string; itemId: string; fromLocationId: string; toLocationId: string; quantity: number; reason: string; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`inventory:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await existingMovement(client, input.tenantId, input.idempotencyKey);
    if (duplicate) return { status: "existing", recordId: duplicate };
    if (input.quantity <= 0 || input.fromLocationId === input.toLocationId) return { status: "invalid", recordId: null };

    const context = await client.query<{ item_id: string; from_id: string; to_id: string }>(
      `select i.id item_id, f.id from_id, t.id to_id
         from public.service_inventory_items i
         join public.inventory_locations f on f.tenant_id=i.tenant_id and f.id=$3 and f.active
         join public.inventory_locations t on t.tenant_id=i.tenant_id and t.id=$4 and t.active
        where i.tenant_id=$1 and i.id=$2 and i.status<>'retired'
        for update of i, f, t`,
      [input.tenantId, input.itemId, input.fromLocationId, input.toLocationId]
    );
    if (!context.rows[0]) return { status: "not_found", recordId: null };
    const source = await client.query<{ quantity: string; reserved: string }>(
      `select b.quantity::text,
              coalesce((select sum(r.quantity-r.consumed_quantity-r.released_quantity)
                from public.inventory_reservations r
                where r.tenant_id=b.tenant_id and r.inventory_item_id=b.inventory_item_id
                  and r.location_id=b.location_id and r.status in ('reserved','partially_consumed')),0)::text reserved
         from public.inventory_location_balances b
        where b.tenant_id=$1 and b.inventory_item_id=$2 and b.location_id=$3
        for update`,
      [input.tenantId, input.itemId, input.fromLocationId]
    );
    const sourceRow = source.rows[0];
    if (!sourceRow) return { status: "not_found", recordId: null };
    if (Number(sourceRow.quantity) - Number(sourceRow.reserved) < input.quantity) return { status: "insufficient", recordId: null };

    await client.query(
      `update public.inventory_location_balances set quantity=quantity-$4, updated_at=now()
        where tenant_id=$1 and inventory_item_id=$2 and location_id=$3`,
      [input.tenantId, input.itemId, input.fromLocationId, input.quantity]
    );
    await client.query(
      `insert into public.inventory_location_balances (tenant_id,inventory_item_id,location_id,quantity)
       values ($1,$2,$3,$4)
       on conflict (tenant_id,inventory_item_id,location_id)
       do update set quantity=public.inventory_location_balances.quantity+excluded.quantity, updated_at=now()`,
      [input.tenantId, input.itemId, input.toLocationId, input.quantity]
    );
    const movement = await client.query<{ id: string }>(
      `insert into public.inventory_transactions (
         tenant_id,inventory_item_id,from_location_id,to_location_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key
       ) select $1,id,$3,$4,'transfer',0,unit_cost_cents,$5,'inventory_control',$6
           from public.service_inventory_items where tenant_id=$1 and id=$2 returning id`,
      [input.tenantId, input.itemId, input.fromLocationId, input.toLocationId, input.reason, input.idempotencyKey]
    );
    return { status: "applied", recordId: movement.rows[0]?.id ?? null };
  });
}

export async function reserveInventory(input: { tenantId: string; itemId: string; locationId: string; workOrderId: string; quantity: number; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`inventory:${input.tenantId}:${input.idempotencyKey}`]);
    const existing = await client.query<{ id: string }>("select id from public.inventory_reservations where tenant_id=$1 and idempotency_key=$2", [input.tenantId, input.idempotencyKey]);
    if (existing.rows[0]) return { status: "existing", recordId: existing.rows[0].id };
    if (input.quantity <= 0) return { status: "invalid", recordId: null };
    const balance = await client.query<{ quantity: string; reserved: string }>(
      `select b.quantity::text,
              coalesce((select sum(r.quantity-r.consumed_quantity-r.released_quantity)
                from public.inventory_reservations r where r.tenant_id=b.tenant_id
                  and r.inventory_item_id=b.inventory_item_id and r.location_id=b.location_id
                  and r.status in ('reserved','partially_consumed')),0)::text reserved
         from public.inventory_location_balances b
         join public.inventory_locations l on l.tenant_id=b.tenant_id and l.id=b.location_id and l.active
         join public.service_work_orders w on w.tenant_id=b.tenant_id and w.id=$4 and w.status not in ('completed','canceled','lost')
        where b.tenant_id=$1 and b.inventory_item_id=$2 and b.location_id=$3
        for update of b`,
      [input.tenantId, input.itemId, input.locationId, input.workOrderId]
    );
    const row = balance.rows[0];
    if (!row) return { status: "not_found", recordId: null };
    if (Number(row.quantity) - Number(row.reserved) < input.quantity) return { status: "insufficient", recordId: null };
    const reservation = await client.query<{ id: string }>(
      `insert into public.inventory_reservations (
         tenant_id,inventory_item_id,location_id,work_order_id,quantity,status,idempotency_key,metadata_json
       ) values ($1,$2,$3,$4,$5,'reserved',$6,'{"source":"inventory_control"}'::jsonb) returning id`,
      [input.tenantId, input.itemId, input.locationId, input.workOrderId, input.quantity, input.idempotencyKey]
    );
    const reservationId = reservation.rows[0]?.id;
    if (!reservationId) throw new Error("Reservation was not created.");
    await client.query(
      `insert into public.inventory_transactions (
         tenant_id,inventory_item_id,from_location_id,work_order_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key
       ) select $1,id,$3,$4,'reserve',$5*-1,unit_cost_cents,'Reserved for work order','inventory_control',$6
           from public.service_inventory_items where tenant_id=$1 and id=$2`,
      [input.tenantId, input.itemId, input.locationId, input.workOrderId, input.quantity, `reserve:${input.idempotencyKey}`]
    );
    return { status: "applied", recordId: reservationId };
  });
}

export async function consumeInventoryReservation(input: { tenantId: string; reservationId: string; quantity: number; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`inventory:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await existingMovement(client, input.tenantId, input.idempotencyKey);
    if (duplicate) return { status: "existing", recordId: duplicate };
    if (input.quantity <= 0) return { status: "invalid", recordId: null };
    const reservation = await client.query<{ id: string; inventory_item_id: string; location_id: string; work_order_id: string | null; quantity: string; consumed_quantity: string; released_quantity: string }>(
      `select id,inventory_item_id,location_id,work_order_id,quantity::text,consumed_quantity::text,released_quantity::text
         from public.inventory_reservations
        where tenant_id=$1 and id=$2 and status in ('reserved','partially_consumed')
        for update`,
      [input.tenantId, input.reservationId]
    );
    const row = reservation.rows[0];
    if (!row?.location_id) return { status: "not_found", recordId: null };
    const remaining = Number(row.quantity) - Number(row.consumed_quantity) - Number(row.released_quantity);
    if (remaining < input.quantity) return { status: "insufficient", recordId: null };
    const balance = await client.query<{ quantity: string }>(
      `select quantity::text from public.inventory_location_balances
        where tenant_id=$1 and inventory_item_id=$2 and location_id=$3 for update`,
      [input.tenantId, row.inventory_item_id, row.location_id]
    );
    if (!balance.rows[0]) return { status: "not_found", recordId: null };
    if (Number(balance.rows[0].quantity) < input.quantity) return { status: "insufficient", recordId: null };
    await client.query(`update public.inventory_location_balances set quantity=quantity-$4,updated_at=now() where tenant_id=$1 and inventory_item_id=$2 and location_id=$3`, [input.tenantId,row.inventory_item_id,row.location_id,input.quantity]);
    const itemUpdate = await client.query<{ id: string }>(
      `update public.service_inventory_items set quantity=quantity-$3,updated_at=now()
        where tenant_id=$1 and id=$2 and quantity >= $3 returning id`,
      [input.tenantId,row.inventory_item_id,input.quantity]
    );
    if (!itemUpdate.rows[0]) throw new Error("Inventory totals are inconsistent; the reservation was not consumed.");
    await client.query(
      `update public.inventory_reservations set consumed_quantity=consumed_quantity+$3,
         status=case when consumed_quantity+released_quantity+$3=quantity then 'consumed' else 'partially_consumed' end,updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId,row.id,input.quantity]
    );
    const movement = await client.query<{ id: string }>(
      `insert into public.inventory_transactions (tenant_id,inventory_item_id,from_location_id,work_order_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key)
       select $1,id,$3,$4,'consume',$5*-1,unit_cost_cents,'Consumed reservation','inventory_control',$6
       from public.service_inventory_items where tenant_id=$1 and id=$2 returning id`,
      [input.tenantId,row.inventory_item_id,row.location_id,row.work_order_id,input.quantity,input.idempotencyKey]
    );
    return { status: "applied", recordId: movement.rows[0]?.id ?? null };
  });
}

export async function releaseInventoryReservation(input: { tenantId: string; reservationId: string; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`inventory:${input.tenantId}:${input.idempotencyKey}`]);
    const duplicate = await existingMovement(client, input.tenantId, input.idempotencyKey);
    if (duplicate) return { status: "existing", recordId: duplicate };
    const reservation = await client.query<{ id: string; inventory_item_id: string; location_id: string; work_order_id: string | null; remaining: string }>(
      `select id,inventory_item_id,location_id,work_order_id,(quantity-consumed_quantity-released_quantity)::text remaining
         from public.inventory_reservations where tenant_id=$1 and id=$2 and status in ('reserved','partially_consumed') for update`,
      [input.tenantId,input.reservationId]
    );
    const row = reservation.rows[0];
    if (!row?.location_id) return { status: "not_found", recordId: null };
    const quantity = Number(row.remaining);
    if (quantity <= 0) return { status: "invalid", recordId: null };
    await client.query(`update public.inventory_reservations set released_quantity=released_quantity+$3,status='released',released_at=now(),updated_at=now() where tenant_id=$1 and id=$2`, [input.tenantId,row.id,quantity]);
    const movement = await client.query<{ id: string }>(
      `insert into public.inventory_transactions (tenant_id,inventory_item_id,from_location_id,work_order_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key)
       select $1,id,$3,$4,'release',$5,unit_cost_cents,'Released reservation','inventory_control',$6
       from public.service_inventory_items where tenant_id=$1 and id=$2 returning id`,
      [input.tenantId,row.inventory_item_id,row.location_id,row.work_order_id,quantity,input.idempotencyKey]
    );
    return { status: "applied", recordId: movement.rows[0]?.id ?? null };
  });
}

export async function recordInventoryCount(input: { tenantId: string; itemId: string; locationId: string; observedQuantity: number; reason: string; idempotencyKey: string }) {
  return run(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`inventory:${input.tenantId}:${input.idempotencyKey}`]);
    const existing = await client.query<{ id: string }>("select id from public.inventory_stock_counts where tenant_id=$1 and idempotency_key=$2", [input.tenantId,input.idempotencyKey]);
    if (existing.rows[0]) return { status: "existing", recordId: existing.rows[0].id };
    if (input.observedQuantity < 0) return { status: "invalid", recordId: null };
    const balance = await client.query<{ quantity: string; total_quantity: string }>(
      `select b.quantity::text,i.quantity::text total_quantity from public.inventory_location_balances b
       join public.inventory_locations l on l.tenant_id=b.tenant_id and l.id=b.location_id and l.active
       join public.service_inventory_items i on i.tenant_id=b.tenant_id and i.id=b.inventory_item_id and i.status<>'retired'
       where b.tenant_id=$1 and b.inventory_item_id=$2 and b.location_id=$3 for update of b,i`,
      [input.tenantId,input.itemId,input.locationId]
    );
    if (!balance.rows[0]) return { status: "not_found", recordId: null };
    const expected = Number(balance.rows[0].quantity);
    const delta = input.observedQuantity - expected;
    const updatedTotal = Number(balance.rows[0].total_quantity) + delta;
    if (updatedTotal < 0) throw new Error("Inventory totals are inconsistent; the stock count was not recorded.");
    const count = await client.query<{ id: string }>(
      `insert into public.inventory_stock_counts (tenant_id,inventory_item_id,location_id,expected_quantity,observed_quantity,adjustment_quantity,reason,idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [input.tenantId,input.itemId,input.locationId,expected,input.observedQuantity,delta,input.reason,input.idempotencyKey]
    );
    const countId = count.rows[0]?.id;
    if (!countId) throw new Error("Stock count was not recorded.");
    await client.query(`update public.inventory_location_balances set quantity=$4,updated_at=now() where tenant_id=$1 and inventory_item_id=$2 and location_id=$3`, [input.tenantId,input.itemId,input.locationId,input.observedQuantity]);
    await client.query(`update public.service_inventory_items set quantity=$3,updated_at=now() where tenant_id=$1 and id=$2`, [input.tenantId,input.itemId,updatedTotal]);
    await client.query(
      `insert into public.inventory_transactions (tenant_id,inventory_item_id,from_location_id,to_location_id,transaction_type,quantity_delta,unit_cost_cents,reason,source,idempotency_key)
       select $1,id,$3,$3,'adjust',$4,unit_cost_cents,$5,'physical_count',$6 from public.service_inventory_items where tenant_id=$1 and id=$2`,
      [input.tenantId,input.itemId,input.locationId,delta,input.reason,`count:${input.idempotencyKey}`]
    );
    return { status: "applied", recordId: countId };
  });
}
