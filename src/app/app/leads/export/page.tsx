import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getLeadDashboardRows } from "@/lib/leads/get-lead-dashboard";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default async function LeadExportPage() {
  await requirePermission("lead:manage");

  const [rows, workspaceId, session] = await Promise.all([getLeadDashboardRows(), getCurrentWorkspaceId(), getCurrentAppSession()]);
  await queryPostgres(
    "insert into public.lead_exports (tenant_id, export_type, row_count, created_by_user_id) values ($1, 'csv', $2, $3)",
    [workspaceId, rows.length, session?.userId ?? null]
  );

  const csv = [
    ["Name", "Email", "Phone", "Brand", "Type", "Status", "Qualification", "Priority", "Score", "Grade", "Assigned", "Created"].join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.email,
        row.phone,
        row.brandName,
        row.leadType,
        row.status,
        row.qualificationStatus,
        row.priority,
        row.score,
        row.grade,
        row.assignedTo,
        row.createdAt
      ]
        .map(csvEscape)
        .join(",")
    )
  ].join("\n");

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Lead Export</p>
            <h1>CSV Export</h1>
            <p className="muted">Manual export for the selected workspace. No external destination is connected.</p>
          </div>
        </div>
        <section className="panel">
          <pre>{csv}</pre>
        </section>
      </section>
    </main>
  );
}
