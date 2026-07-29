import { queryPostgres } from "@/lib/db/postgres";
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
  movements: { id: string; itemName: string; type: string; delta: string; reason: string; createdAt: string }[];
};

function formatQuantity(value: string | number | null) {
  const numberValue = Number(value ?? 0);
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}

export async function getServiceInventory(): Promise<ServiceInventory> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricsResult, itemsResult, locationsResult, movementsResult] = await Promise.all([
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
      left join public.service_jobs j on j.id = i.assigned_job_id
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
