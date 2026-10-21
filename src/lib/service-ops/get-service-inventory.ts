import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceInventory = {
  metrics: {
    total: number;
    lowStock: number;
    inUse: number;
    maintenance: number;
  };
  items: {
    id: string;
    name: string;
    category: string;
    status: string;
    quantity: string;
    threshold: string;
    location: string;
    assignedJob: string;
    notes: string;
  }[];
  locations: { id: string; name: string; type: string; address: string; itemCount: number }[];
  balances: { itemId: string; itemName: string; locationId: string; locationName: string; onHand: string; reserved: string; available: string }[];
  reservations: { id: string; itemName: string; locationName: string; workOrder: string; reserved: string; consumed: string; remaining: string; status: string }[];
  workOrders: { id: string; label: string }[];
  jobs: { id: string; label: string; locationId: string | null }[];
  customerLocations: { id: string; label: string }[];
  consumptions: { id: string; itemName: string; consumed: string; allocated: string; remaining: string; cost: string; createdAt: string }[];
  materialAllocations: { id: string; itemName: string; target: string; quantity: string; cost: string; note: string }[];
  movements: { id: string; itemName: string; type: string; delta: string; reason: string; createdAt: string }[];
};

function formatQuantity(value: string | number | null) {
  const numberValue = Number(value ?? 0);
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}

export async function getServiceInventory(): Promise<ServiceInventory> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricsResult, itemsResult, locationsResult, movementsResult, balancesResult, reservationsResult, workOrdersResult, jobsResult, customerLocationsResult, consumptionsResult, allocationsResult] = await Promise.all([
    queryPostgres<{ total: string; low_stock: string; in_use: string; maintenance: string }>(
      `
      select
        count(*) as total,
        count(*) filter (where quantity <= reorder_threshold and reorder_threshold > 0) as low_stock,
        count(*) filter (where status = 'in_use') as in_use,
        count(*) filter (where status = 'maintenance') as maintenance
      from public.service_inventory_items
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      category: string;
      status: string;
      quantity: string;
      reorder_threshold: string;
      unit: string | null;
      location: string | null;
      notes: string | null;
      job_title: string | null;
    }>(
      `
      select
        i.id,
        i.name,
        i.category,
        i.status,
        i.quantity::text,
        i.reorder_threshold::text,
        i.unit,
        i.location,
        i.notes,
        j.title as job_title
      from public.service_inventory_items i
      left join public.service_jobs j on j.id = i.assigned_job_id and j.tenant_id = i.tenant_id
      where i.tenant_id = $1
      order by i.updated_at desc, i.created_at desc
      limit 100
      `,
      [workspaceId]
    ),
    queryPostgres<{ id: string; name: string; location_type: string; address: string | null; item_count: string }>(
      `
      select l.id, l.name, l.location_type, l.address, count(i.id)::text as item_count
      from public.inventory_locations l
      left join public.service_inventory_items i on i.inventory_location_id = l.id and i.tenant_id = l.tenant_id
      where l.tenant_id = $1 and l.active = true
      group by l.id
      order by l.name
      `,
      [workspaceId]
    ),
    queryPostgres<{ id: string; item_name: string; transaction_type: string; quantity_delta: string; reason: string | null; created_at: Date }>(
      `
      select t.id, i.name as item_name, t.transaction_type, t.quantity_delta::text, t.reason, t.created_at
      from public.inventory_transactions t
      join public.service_inventory_items i on i.id = t.inventory_item_id and i.tenant_id = t.tenant_id
      where t.tenant_id = $1
      order by t.created_at desc
      limit 30
      `,
      [workspaceId]
    ),
    queryPostgres<{ item_id: string; item_name: string; location_id: string; location_name: string; on_hand: string; reserved: string }>(
      `select b.inventory_item_id item_id,i.name item_name,b.location_id,l.name location_name,b.quantity::text on_hand,
              coalesce(sum(r.quantity-r.consumed_quantity-r.released_quantity) filter (where r.status in ('reserved','partially_consumed')),0)::text reserved
         from public.inventory_location_balances b
         join public.service_inventory_items i on i.tenant_id=b.tenant_id and i.id=b.inventory_item_id
         join public.inventory_locations l on l.tenant_id=b.tenant_id and l.id=b.location_id
         left join public.inventory_reservations r on r.tenant_id=b.tenant_id and r.inventory_item_id=b.inventory_item_id and r.location_id=b.location_id
        where b.tenant_id=$1 and l.active
        group by b.inventory_item_id,i.name,b.location_id,l.name,b.quantity
        order by i.name,l.name`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; item_name: string; location_name: string; work_order: string; quantity: string; consumed_quantity: string; released_quantity: string; status: string }>(
      `select r.id,i.name item_name,l.name location_name,w.title work_order,r.quantity::text,
              r.consumed_quantity::text,r.released_quantity::text,r.status
         from public.inventory_reservations r
         join public.service_inventory_items i on i.tenant_id=r.tenant_id and i.id=r.inventory_item_id
         join public.inventory_locations l on l.tenant_id=r.tenant_id and l.id=r.location_id
         left join public.service_work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
        where r.tenant_id=$1 and r.status in ('reserved','partially_consumed')
        order by r.created_at desc limit 50`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; title: string; customer_name: string }>(
      `select w.id,w.title,c.name customer_name from public.service_work_orders w
       join public.customers c on c.tenant_id=w.tenant_id and c.id=w.customer_id
       where w.tenant_id=$1 and w.status not in ('completed','canceled','lost')
       order by w.updated_at desc limit 100`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; title: string; customer_name: string; location_id: string | null }>(
      `select j.id,j.title,c.name customer_name,j.location_id
         from public.service_jobs j join public.customers c on c.tenant_id=j.tenant_id and c.id=j.customer_id
        where j.tenant_id=$1 and j.status not in ('canceled','lost') order by j.updated_at desc limit 150`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; name: string; customer_name: string; address_line1: string | null; city: string | null; state: string | null }>(
      `select l.id,l.name,c.name customer_name,l.address_line1,l.city,l.state
         from public.customer_locations l join public.customers c on c.tenant_id=l.tenant_id and c.id=l.customer_id
        where l.tenant_id=$1 and l.active order by c.name,l.name limit 200`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; item_name: string; source_quantity: string; allocated_quantity: string; unit_cost_cents: number; created_at: Date }>(
      `select t.id,i.name item_name,abs(t.quantity_delta)::text source_quantity,
              coalesce(sum(a.quantity) filter (where a.status='active'),0)::text allocated_quantity,
              t.unit_cost_cents,t.created_at
         from public.inventory_transactions t
         join public.service_inventory_items i on i.tenant_id=t.tenant_id and i.id=t.inventory_item_id
         left join public.inventory_material_allocations a on a.tenant_id=t.tenant_id and a.source_transaction_id=t.id
        where t.tenant_id=$1 and t.transaction_type='consume' and t.quantity_delta<0 and t.source='inventory_control'
        group by t.id,i.name,t.quantity_delta,t.unit_cost_cents,t.created_at
        having abs(t.quantity_delta)>coalesce(sum(a.quantity) filter (where a.status='active'),0)
        order by t.created_at desc limit 100`,
      [workspaceId]
    ),
    queryPostgres<{ id: string; item_name: string; job_title: string | null; location_name: string | null; quantity: string; cost_cents: number; note: string | null }>(
      `select a.id,i.name item_name,j.title job_title,l.name location_name,a.quantity::text,a.cost_cents,a.note
         from public.inventory_material_allocations a
         join public.inventory_transactions t on t.tenant_id=a.tenant_id and t.id=a.source_transaction_id
         join public.service_inventory_items i on i.tenant_id=t.tenant_id and i.id=t.inventory_item_id
         left join public.service_jobs j on j.tenant_id=a.tenant_id and j.id=a.service_job_id
         left join public.customer_locations l on l.tenant_id=a.tenant_id and l.id=a.customer_location_id
        where a.tenant_id=$1 and a.status='active' order by a.created_at desc limit 100`,
      [workspaceId]
    )
  ]);

  const metrics = metricsResult?.rows[0];
  return {
    metrics: {
      total: Number(metrics?.total ?? 0),
      lowStock: Number(metrics?.low_stock ?? 0),
      inUse: Number(metrics?.in_use ?? 0),
      maintenance: Number(metrics?.maintenance ?? 0)
    },
    items: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      status: item.status,
      quantity: `${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`,
      threshold: `${formatQuantity(item.reorder_threshold)}${item.unit ? ` ${item.unit}` : ""}`,
      location: item.location ?? "No location",
      assignedJob: item.job_title ?? "Unassigned",
      notes: item.notes ?? ""
    })),
    locations: (locationsResult?.rows ?? []).map((location) => ({
      id: location.id,
      name: location.name,
      type: location.location_type,
      address: location.address ?? "",
      itemCount: Number(location.item_count)
    })),
    balances: (balancesResult?.rows ?? []).map((balance) => {
      const onHand = Number(balance.on_hand);
      const reserved = Number(balance.reserved);
      return {
        itemId: balance.item_id,
        itemName: balance.item_name,
        locationId: balance.location_id,
        locationName: balance.location_name,
        onHand: formatQuantity(onHand),
        reserved: formatQuantity(reserved),
        available: formatQuantity(Math.max(0, onHand - reserved))
      };
    }),
    reservations: (reservationsResult?.rows ?? []).map((reservation) => ({
      id: reservation.id,
      itemName: reservation.item_name,
      locationName: reservation.location_name,
      workOrder: reservation.work_order ?? "Work order",
      reserved: formatQuantity(reservation.quantity),
      consumed: formatQuantity(reservation.consumed_quantity),
      remaining: formatQuantity(Number(reservation.quantity) - Number(reservation.consumed_quantity) - Number(reservation.released_quantity)),
      status: reservation.status
    })),
    workOrders: (workOrdersResult?.rows ?? []).map((workOrder) => ({ id: workOrder.id, label: `${workOrder.title} — ${workOrder.customer_name}` })),
    jobs: (jobsResult?.rows ?? []).map((job) => ({ id: job.id, label: `${job.title} — ${job.customer_name}`, locationId: job.location_id })),
    customerLocations: (customerLocationsResult?.rows ?? []).map((location) => ({
      id: location.id,
      label: `${location.customer_name} — ${location.name}${location.address_line1 ? ` · ${location.address_line1}` : ""}${location.city ? `, ${location.city}` : ""}${location.state ? ` ${location.state}` : ""}`
    })),
    consumptions: (consumptionsResult?.rows ?? []).map((consumption) => {
      const consumed = Number(consumption.source_quantity);
      const allocated = Number(consumption.allocated_quantity);
      return {
        id: consumption.id,
        itemName: consumption.item_name,
        consumed: formatQuantity(consumed),
        allocated: formatQuantity(allocated),
        remaining: formatQuantity(consumed - allocated),
        cost: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((consumed * consumption.unit_cost_cents) / 100),
        createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(consumption.created_at)
      };
    }),
    materialAllocations: (allocationsResult?.rows ?? []).map((allocation) => ({
      id: allocation.id,
      itemName: allocation.item_name,
      target: [allocation.job_title, allocation.location_name].filter(Boolean).join(" · ") || "Target",
      quantity: formatQuantity(allocation.quantity),
      cost: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(allocation.cost_cents / 100),
      note: allocation.note ?? ""
    })),
    movements: (movementsResult?.rows ?? []).map((movement) => ({
      id: movement.id,
      itemName: movement.item_name,
      type: movement.transaction_type,
      delta: formatQuantity(movement.quantity_delta),
      reason: movement.reason ?? "",
      createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(movement.created_at)
    }))
  };
}
