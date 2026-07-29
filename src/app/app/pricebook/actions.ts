"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { dollarsToCents } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).optional()
});

const itemSchema = z.object({
  itemId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  sku: z.string().trim().max(80).optional(),
  itemType: z.enum(["service", "material", "labor", "equipment", "fee", "discount"]),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1200).optional(),
  unit: z.string().trim().min(1).max(40),
  costCents: z.number().int().min(0),
  priceCents: z.number().int().min(0),
  taxable: z.boolean(),
  active: z.boolean()
});

const membershipSchema = z.object({
  membershipId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1200).optional(),
  frequency: z.enum(["monthly", "quarterly", "annual"]),
  priceCents: z.number().int().min(0),
  visitsPerYear: z.coerce.number().int().min(0).max(52),
  discountPercent: z.coerce.number().min(0).max(100),
  priorityService: z.boolean(),
  active: z.boolean()
});

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export async function createPricebookCategoryAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    description: optionalText(formData.get("description"))
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.pricebook_categories (tenant_id, name, description)
    values ($1, $2, $3)
    on conflict (tenant_id, name)
    do update set description = excluded.description, active = true, updated_at = now()
    `,
    [workspaceId, parsed.data.name, parsed.data.description ?? null]
  );
  revalidatePath("/app/pricebook");
}

export async function savePricebookItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const itemId = optionalText(formData.get("itemId"));
  const categoryId = optionalText(formData.get("categoryId"));
  const parsed = itemSchema.safeParse({
    itemId,
    categoryId,
    sku: optionalText(formData.get("sku")),
    itemType: formData.get("itemType"),
    name: formData.get("name"),
    description: optionalText(formData.get("description")),
    unit: formData.get("unit") || "each",
    costCents: dollarsToCents(formData.get("cost")),
    priceCents: dollarsToCents(formData.get("price")),
    taxable: formData.get("taxable") === "on",
    active: itemId ? formData.get("active") === "on" : true
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();

  if (parsed.data.itemId) {
    await queryPostgres(
      `
      update public.pricebook_items
      set category_id = $3, sku = $4, item_type = $5, name = $6,
        customer_description = $7, unit = $8, cost_cents = $9, price_cents = $10,
        taxable = $11, active = $12, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId, parsed.data.itemId, parsed.data.categoryId ?? null, parsed.data.sku ?? null,
        parsed.data.itemType, parsed.data.name, parsed.data.description ?? null, parsed.data.unit,
        parsed.data.costCents, parsed.data.priceCents, parsed.data.taxable, parsed.data.active
      ]
    );
  } else {
    await queryPostgres(
      `
      insert into public.pricebook_items (
        tenant_id, category_id, sku, item_type, name, customer_description, unit,
        cost_cents, price_cents, taxable
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        workspaceId, parsed.data.categoryId ?? null, parsed.data.sku ?? null, parsed.data.itemType,
        parsed.data.name, parsed.data.description ?? null, parsed.data.unit,
        parsed.data.costCents, parsed.data.priceCents, parsed.data.taxable
      ]
    );
  }
  revalidatePath("/app/pricebook");
}

export async function saveMembershipProgramAction(formData: FormData) {
  await requirePermission("lead:manage");
  const membershipId = optionalText(formData.get("membershipId"));
  const parsed = membershipSchema.safeParse({
    membershipId,
    name: formData.get("name"),
    description: optionalText(formData.get("description")),
    frequency: formData.get("frequency"),
    priceCents: dollarsToCents(formData.get("price")),
    visitsPerYear: formData.get("visitsPerYear"),
    discountPercent: formData.get("discountPercent"),
    priorityService: formData.get("priorityService") === "on",
    active: membershipId ? formData.get("active") === "on" : true
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const values = [
    workspaceId, parsed.data.membershipId ?? null, parsed.data.name, parsed.data.description ?? null,
    parsed.data.frequency, parsed.data.priceCents, parsed.data.visitsPerYear,
    parsed.data.discountPercent, parsed.data.priorityService, parsed.data.active
  ];
  await queryPostgres(
    `
    insert into public.membership_programs (
      tenant_id, id, name, customer_description, billing_frequency, price_cents,
      visits_per_year, discount_percent, priority_service, active
    )
    values ($1, coalesce($2::uuid, gen_random_uuid()), $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict (id)
    do update set name = excluded.name, customer_description = excluded.customer_description,
      billing_frequency = excluded.billing_frequency, price_cents = excluded.price_cents,
      visits_per_year = excluded.visits_per_year, discount_percent = excluded.discount_percent,
      priority_service = excluded.priority_service, active = excluded.active, updated_at = now()
    `,
    values
  );
  revalidatePath("/app/pricebook");
}
