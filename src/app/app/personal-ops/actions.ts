"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  notes: z.string().trim().max(1000).optional(),
  category: z.enum(["today", "money", "paperwork", "people", "reminder", "project", "waiting", "personal"]),
  priority: z.enum(["low", "normal", "high", "critical"]),
  dueAt: z.string().trim().optional()
});

const updateSchema = z.object({
  itemId: z.string().uuid(),
  nextStatus: z.enum(["open", "watching", "ai_handled", "done", "archived"])
});

function parseDueAt(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function priorityToSeverity(priority: string) {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "normal") return "medium";
  return "low";
}

async function upsertOwnerCommandEvent(input: {
  tenantId: string;
  itemId: string;
  title: string;
  notes: string | null;
  category: string;
  priority: string;
  status: string;
  ownerAttention: boolean;
  recommendedAction: string;
}) {
  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
      money_cents, risk_type, confidence_score, metadata_json
    )
    values ($1, 'personal-ops', 'Personal Ops', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '/app/personal-ops', 0, $12, 82, $13::jsonb)
    on conflict (tenant_id, platform_key, external_event_id)
    do update set
      title = excluded.title,
      summary = excluded.summary,
      severity = excluded.severity,
      status = excluded.status,
      owner_attention = excluded.owner_attention,
      ai_handled = excluded.ai_handled,
      ai_summary = excluded.ai_summary,
      recommended_action = excluded.recommended_action,
      risk_type = excluded.risk_type,
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      input.tenantId,
      `personal-ops:${input.itemId}`,
      `personal.${input.category}`,
      input.title,
      input.notes || "Private owner task recorded in Personal Ops.",
      priorityToSeverity(input.priority),
      input.status === "done" ? "resolved" : input.ownerAttention ? "needs_owner" : "watching",
      input.ownerAttention,
      input.status === "ai_handled",
      input.status === "ai_handled" ? "Marked handled from Personal Ops." : null,
      input.recommendedAction,
      input.category === "money" ? "financial" : input.priority === "critical" ? "approval" : null,
      JSON.stringify({
        source: "personal_ops_items",
        personalOpsItemId: input.itemId,
        category: input.category,
        privateOwnerLayer: true
      })
    ]
  );
}

export async function createPersonalOpsItemAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    dueAt: formData.get("dueAt")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const dueAt = parseDueAt(parsed.data.dueAt);
  const recommendedAction =
    parsed.data.priority === "critical"
      ? "Review this personally before letting AI or automation handle anything."
      : "Decide whether to handle now, watch it, or let AI prepare the next step.";

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.personal_ops_items (
      tenant_id, owner_user_id, category, title, notes, priority, due_at, recommended_action, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    returning id
    `,
    [
      tenantId,
      session?.userId ?? null,
      parsed.data.category,
      parsed.data.title,
      parsed.data.notes || null,
      parsed.data.priority,
      dueAt,
      recommendedAction,
      JSON.stringify({ createdBy: session?.email ?? "admin-token" })
    ]
  );

  const itemId = result?.rows[0]?.id;
  if (itemId) {
    await upsertOwnerCommandEvent({
      tenantId,
      itemId,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: "open",
      ownerAttention: true,
      recommendedAction
    });
  }

  revalidatePath("/app/personal-ops");
  revalidatePath("/app/owner-command-center");
}

export async function updatePersonalOpsItemAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = updateSchema.safeParse({
    itemId: formData.get("itemId"),
    nextStatus: formData.get("nextStatus")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const nextStatus = parsed.data.nextStatus;
  const result = await queryPostgres<{
    id: string;
    category: string;
    title: string;
    notes: string | null;
    priority: string;
    owner_attention: boolean;
    recommended_action: string | null;
  }>(
    `
    update public.personal_ops_items
    set status = $3,
      owner_attention = case when $3 in ('watching', 'ai_handled', 'done', 'archived') then false else owner_attention end,
      ai_summary = case when $3 = 'ai_handled' then coalesce(ai_summary, 'AI or automation review handled this private owner item.') else ai_summary end
    where tenant_id = $1 and id = $2
    returning id, category, title, notes, priority, owner_attention, recommended_action
    `,
    [tenantId, parsed.data.itemId, nextStatus]
  );

  const item = result?.rows[0];
  if (item) {
    await upsertOwnerCommandEvent({
      tenantId,
      itemId: item.id,
      title: item.title,
      notes: item.notes,
      category: item.category,
      priority: item.priority,
      status: nextStatus,
      ownerAttention: nextStatus === "open" ? item.owner_attention : false,
      recommendedAction: item.recommended_action ?? "Review this private owner item."
    });

    await queryPostgres(
      `
      insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
      values ($1, 'system', 'personal_ops_action', $2, $3, $4::jsonb)
      `,
      [
        tenantId,
        "Personal Ops item updated",
        `${item.title} moved to ${nextStatus.replaceAll("_", " ")}.`,
        JSON.stringify({ personalOpsItemId: item.id, status: nextStatus })
      ]
    );
  }

  revalidatePath("/app/personal-ops");
  revalidatePath("/app/owner-command-center");
}
