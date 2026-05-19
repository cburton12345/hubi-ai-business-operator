import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getBusinessWorkflowRows } from "@/lib/workflows/get-business-workflows";
import { updateBusinessWorkflowAction } from "./actions";

export default async function WorkflowsPage() {
  const rows = await getBusinessWorkflowRows();

  return (
    <QueuePageShell
      eyebrow="Business Workflows"
      title="Business-Type Operating Rules"
      description="Configure local service, rental, software, marketplace, and lead-generation workflows without connecting external routing or messaging."
    >
      <ul className="review-list">
        {rows.map((row) => (
          <li className="panel" key={row.id}>
            <form action={updateBusinessWorkflowAction} className="form-stack">
              <input name="workflowId" type="hidden" value={row.id} />
              <div className="list-row flush-row">
                <div>
                  <h3>{row.brandName}</h3>
                  <p className="muted">{row.businessModel}</p>
                </div>
                <label className="checkbox-row">
                  <input name="active" type="checkbox" defaultChecked={row.active} />
                  Active
                </label>
              </div>
              <label>
                Workflow JSON
                <textarea name="workflowJson" rows={10} defaultValue={JSON.stringify(row.workflow, null, 2)} />
              </label>
              <button className="button" type="submit">Save workflow</button>
            </form>
          </li>
        ))}
      </ul>
    </QueuePageShell>
  );
}
