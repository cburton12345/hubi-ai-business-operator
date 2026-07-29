import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type PricebookDashboard = {
  categories: { id: string; name: string; description: string; itemCount: number }[];
  items: {
    id: string;
    categoryId: string;
    categoryName: string;
    sku: string;
    type: string;
    name: string;
    description: string;
    unit: string;
    cost: string;
    price: string;
    costValue: string;
    priceValue: string;
    marginPercent: number | null;
    active: boolean;
  }[];
  packages: {
    id: string;
    name: string;
    tier: string;
    description: string;
    itemCount: number;
    total: string;
  }[];
  memberships: {
    id: string;
    name: string;
    description: string;
    frequency: string;
    price: string;
    priceValue: string;
    visitsPerYear: number;
    discountPercent: number;
    priorityService: boolean;
    active: boolean;
  }[];
  metrics: {
    activeItems: number;
    unpricedItems: number;
    lowMarginItems: number;
    activeMemberships: number;
  };
};

function centsInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function getPricebookDashboard(): Promise<PricebookDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [categoriesResult, itemsResult, packagesResult, membershipsResult] = await Promise.all([
    queryPostgres<{ id: string; name: string; description: string | null; item_count: string }>(
      `
      select c.id, c.name, c.description, count(i.id)::text as item_count
      from public.pricebook_categories c
      left join public.pricebook_items i on i.category_id = c.id and i.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.active = true
      group by c.id
      order by c.position, c.name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      category_id: string | null;
      category_name: string | null;
      sku: string | null;
      item_type: string;
      name: string;
      customer_description: string | null;
      unit: string;
      cost_cents: number;
      price_cents: number;
      active: boolean;
    }>(
      `
      select i.id, i.category_id, c.name as category_name, i.sku, i.item_type, i.name,
        i.customer_description, i.unit, i.cost_cents, i.price_cents, i.active
      from public.pricebook_items i
      left join public.pricebook_categories c on c.id = i.category_id and c.tenant_id = i.tenant_id
      where i.tenant_id = $1
      order by i.active desc, c.position nulls last, c.name nulls last, i.name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      tier: string;
      customer_description: string | null;
      item_count: string;
      total_cents: string;
    }>(
      `
      select p.id, p.name, p.tier, p.customer_description, count(pi.pricebook_item_id)::text as item_count,
        coalesce(sum(pi.quantity * coalesce(pi.price_override_cents, i.price_cents)), 0)::text as total_cents
      from public.pricebook_packages p
      left join public.pricebook_package_items pi on pi.package_id = p.id and pi.tenant_id = p.tenant_id
      left join public.pricebook_items i on i.id = pi.pricebook_item_id and i.tenant_id = p.tenant_id
      where p.tenant_id = $1 and p.active = true
      group by p.id
      order by p.position, p.tier, p.name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      customer_description: string | null;
      billing_frequency: string;
      price_cents: number;
      visits_per_year: number;
      discount_percent: string;
      priority_service: boolean;
      active: boolean;
    }>(
      `
      select id, name, customer_description, billing_frequency, price_cents, visits_per_year,
        discount_percent::text, priority_service, active
      from public.membership_programs
      where tenant_id = $1
      order by active desc, name
      `,
      [workspaceId]
    )
  ]);

  const items = (itemsResult?.rows ?? []).map((item) => ({
    id: item.id,
    categoryId: item.category_id ?? "",
    categoryName: item.category_name ?? "Uncategorized",
    sku: item.sku ?? "",
    type: item.item_type,
    name: item.name,
    description: item.customer_description ?? "",
    unit: item.unit,
    cost: formatMoney(item.cost_cents),
    price: formatMoney(item.price_cents),
    costValue: centsInput(item.cost_cents),
    priceValue: centsInput(item.price_cents),
    marginPercent: item.price_cents > 0 ? Math.round(((item.price_cents - item.cost_cents) / item.price_cents) * 100) : null,
    active: item.active
  }));
  const memberships = (membershipsResult?.rows ?? []).map((membership) => ({
    id: membership.id,
    name: membership.name,
    description: membership.customer_description ?? "",
    frequency: membership.billing_frequency,
    price: formatMoney(membership.price_cents),
    priceValue: centsInput(membership.price_cents),
    visitsPerYear: membership.visits_per_year,
    discountPercent: Number(membership.discount_percent),
    priorityService: membership.priority_service,
    active: membership.active
  }));

  return {
    categories: (categoriesResult?.rows ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      itemCount: Number(category.item_count)
    })),
    items,
    packages: (packagesResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      tier: item.tier,
      description: item.customer_description ?? "",
      itemCount: Number(item.item_count),
      total: formatMoney(Number(item.total_cents))
    })),
    memberships,
    metrics: {
      activeItems: items.filter((item) => item.active).length,
      unpricedItems: items.filter((item) => item.active && item.price === formatMoney(0)).length,
      lowMarginItems: items.filter((item) => item.active && item.marginPercent !== null && item.marginPercent < 20).length,
      activeMemberships: memberships.filter((item) => item.active).length
    }
  };
}
