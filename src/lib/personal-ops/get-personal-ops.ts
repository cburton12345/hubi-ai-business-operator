import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

export type PersonalOpsItem = {
  id: string;
  category: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  ownerAttention: boolean;
  dueAt: string | null;
  aiSummary: string | null;
  recommendedAction: string | null;
  createdAt: string;
};

export type PersonalOpsDashboard = {
  workspaceName: string;
  metrics: {
    open: number;
    needsOwner: number;
    critical: number;
    dueSoon: number;
    waiting: number;
    aiHandled: number;
  };
  items: PersonalOpsItem[];
  needsOwner: PersonalOpsItem[];
  dueSoon: PersonalOpsItem[];
  waiting: PersonalOpsItem[];
  aiHandled: PersonalOpsItem[];
};

function mapItem(row: {
  id: string;
  category: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  owner_attention: boolean;
  due_at: Date | null;
  ai_summary: string | null;
  recommended_action: string | null;
  created_at: Date;
}): PersonalOpsItem {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    ownerAttention: row.owner_attention,
    dueAt: row.due_at?.toISOString() ?? null,
    aiSummary: row.ai_summary,
    recommendedAction: row.recommended_action,
    createdAt: row.created_at.toISOString()
  };
}

export async function getPersonalOpsDashboard(): Promise<PersonalOpsDashboard> {
  const workspace = await getCurrentWorkspace();
  const result = await queryPostgres<{
    id: string;
    category: string;
    title: string;
    notes: string | null;
    status: string;
    priority: string;
    owner_attention: boolean;
    due_at: Date | null;
    ai_summary: string | null;
    recommended_action: string | null;
    created_at: Date;
  }>(
    `
    select id, category, title, notes, status, priority, owner_attention, due_at,
      ai_summary, recommended_action, created_at
    from public.personal_ops_items
    where tenant_id = $1 and status <> 'archived'
    order by
      case priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      owner_attention desc,
      due_at asc nulls last,
      created_at desc
    limit 100
    `,
    [workspace.id]
  );

  const items = (result?.rows ?? []).map(mapItem);
  const dueSoon = items.filter((item) => {
    if (!item.dueAt || item.status === "done") return false;
    const due = new Date(item.dueAt).getTime();
    return due <= Date.now() + 1000 * 60 * 60 * 48;
  });

  const needsOwner = items.filter((item) => item.ownerAttention && item.status !== "done");
  const waiting = items.filter((item) => item.category === "waiting" || item.status === "watching");
  const aiHandled = items.filter((item) => item.status === "ai_handled");

  return {
    workspaceName: workspace.name,
    metrics: {
      open: items.filter((item) => item.status !== "done").length,
      needsOwner: needsOwner.length,
      critical: items.filter((item) => item.priority === "critical" && item.status !== "done").length,
      dueSoon: dueSoon.length,
      waiting: waiting.length,
      aiHandled: aiHandled.length
    },
    items,
    needsOwner,
    dueSoon,
    waiting,
    aiHandled
  };
}
