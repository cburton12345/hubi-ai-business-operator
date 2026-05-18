import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { demoDraftRows } from "@/lib/queues/demo-queues";
import { getDraftQueueRows, type DraftQueueRow } from "@/lib/queues/get-queue-data";
import { processQueuedAiTasksAction } from "./actions";

export default async function DraftsPage() {
  const rows = await getDraftQueueRows(demoDraftRows);

  return (
    <QueuePageShell
      eyebrow="AI Drafts"
      title="Draft Queue"
      description="AI-generated content drafts waiting for review, approval, rejection, or later publishing."
    >
      <form action={processQueuedAiTasksAction} className="button-row section-actions">
        <button className="button" type="submit">
          Process queued AI tasks
        </button>
      </form>
      <QueueTable<DraftQueueRow>
        rows={rows}
        columns={[
          {
            key: "title",
            label: "Draft",
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <span className="muted">{row.contentType}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "risk", label: "Risk", render: (row) => <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.createdAt)) }
        ]}
      />
    </QueuePageShell>
  );
}
