import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { decideApproval } from "@/app/app/approvals/actions";
import { demoApprovalRows } from "@/lib/queues/demo-queues";
import { getApprovalQueueRows, type ApprovalQueueRow } from "@/lib/queues/get-queue-data";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ approval?: string }>;
}) {
  const rows = await getApprovalQueueRows(demoApprovalRows);
  const requestedApprovalId = (await searchParams).approval;
  const requestedApproval = requestedApprovalId
    ? rows.find((row) => row.id === requestedApprovalId)
    : undefined;
  const orderedRows = requestedApproval
    ? [requestedApproval, ...rows.filter((row) => row.id !== requestedApproval.id)]
    : rows;

  return (
    <QueuePageShell
      eyebrow="Admin Approval"
      title="Approval Queue"
      description="High-impact, reputation-sensitive, or legal-sensitive changes that require human review."
    >
      {requestedApproval ? (
        <p className="notice-banner">Ferocity opened the exact review item first.</p>
      ) : null}
      <QueueTable<ApprovalQueueRow>
        rows={orderedRows}
        columns={[
          {
            key: "target",
            label: "Approval",
            render: (row) => (
              <>
                <strong>{row.targetType}</strong>
                <span className="muted" style={{ whiteSpace: "pre-wrap" }}>{row.notes || "No notes provided."}</span>
                {row.targetType === "growth_action" ? <Link href="/app/growth">Review in Growth</Link> : null}
                {row.targetType === "office_manager_action_request" ? <Link href="/app/ferocity">Return to Ask Ferocity</Link> : null}
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
                <form action={decideApproval} className="inline-actions approval-actions">
                  <input name="approvalId" type="hidden" value={row.id} />
                  <textarea name="notes" placeholder="Optional approval, rejection, or change-request notes" rows={2} />
                  <PendingSubmitButton className="mini-button" name="decision" value="approved" pendingLabel="Saving…">Approve</PendingSubmitButton>
                  <PendingSubmitButton className="mini-button" name="decision" value="changes_requested" pendingLabel="Saving…">Changes</PendingSubmitButton>
                  <PendingSubmitButton className="mini-button danger-button" name="decision" value="rejected" pendingLabel="Saving…">Reject</PendingSubmitButton>
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
