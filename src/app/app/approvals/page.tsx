import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { decideApproval } from "@/app/app/approvals/actions";
import { demoApprovalRows } from "@/lib/queues/demo-queues";
import { getApprovalQueueRows, type ApprovalQueueRow } from "@/lib/queues/get-queue-data";

export default async function ApprovalsPage() {
  const rows = await getApprovalQueueRows(demoApprovalRows);

  return (
    <QueuePageShell
      eyebrow="Admin Approval"
      title="Approval Queue"
      description="High-impact, reputation-sensitive, or legal-sensitive changes that require human review."
    >
      <QueueTable<ApprovalQueueRow>
        rows={rows}
        columns={[
          {
            key: "target",
            label: "Approval",
            render: (row) => (
              <>
                <strong>{row.targetType}</strong>
                <span className="muted">{row.notes || "No notes provided."}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "risk", label: "Risk", render: (row) => <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.createdAt)) },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "pending" ? (
                <form action={decideApproval} className="inline-actions">
                  <input name="approvalId" type="hidden" value={row.id} />
                  <button className="mini-button" name="decision" type="submit" value="approved">
                    Approve
                  </button>
                  <button className="mini-button" name="decision" type="submit" value="changes_requested">
                    Changes
                  </button>
                  <button className="mini-button danger-button" name="decision" type="submit" value="rejected">
                    Reject
                  </button>
                </form>
              ) : (
                <span className="muted">Reviewed</span>
              )
          }
        ]}
      />
    </QueuePageShell>
  );
}
