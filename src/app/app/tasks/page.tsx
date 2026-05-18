import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { demoTaskRows } from "@/lib/queues/demo-queues";
import { getTaskQueueRows, type TaskQueueRow } from "@/lib/queues/get-queue-data";
import { queueWeeklyAiTasksAction } from "./actions";

export default async function TasksPage() {
  const rows = await getTaskQueueRows(demoTaskRows);

  return (
    <QueuePageShell
      eyebrow="AI Operator"
      title="AI Task Queue"
      description="Work the AI should perform or prepare, scoped by tenant and brand."
    >
      <form action={queueWeeklyAiTasksAction} className="button-row section-actions">
        <button className="button" type="submit">
          Queue weekly brand tasks
        </button>
      </form>
      <QueueTable<TaskQueueRow>
        rows={rows}
        columns={[
          {
            key: "title",
            label: "Task",
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <span className="muted">{row.type}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "priority", label: "Priority", render: (row) => row.priority },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.createdAt)) }
        ]}
      />
    </QueuePageShell>
  );
}
