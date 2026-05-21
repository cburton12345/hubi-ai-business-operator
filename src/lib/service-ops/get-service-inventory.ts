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
};

function formatQuantity(value: string | number | null) {
  const numberValue = Number(value ?? 0);
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}

export async function getServiceInventory(): Promise<ServiceInventory> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricsResult, itemsResult] = await Promise.all([
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
    }))
  };
}
