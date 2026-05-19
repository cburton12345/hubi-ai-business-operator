import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketingCalendarRows } from "@/lib/marketing/get-phase2-dashboard";
import { updateCalendarItemAction } from "@/app/app/marketing/actions";

export default async function MarketingCalendarPage() {
  const rows = await getMarketingCalendarRows();

  return (
    <QueuePageShell
      eyebrow="Marketing Calendar"
      title="Drafts, Scheduled Work, and Upcoming AI Tasks"
      description="A simple list view for generated drafts, scheduled content, approved items, published items, rejected items, and upcoming operator work."
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Brand</th>
              <th>Status</th>
              <th>Schedule</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <span className="muted">
                    {row.itemType} · {row.notes}
                  </span>
                </td>
                <td>{row.brandName}</td>
                <td>
                  <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span>
                  <span className="pill">{row.status}</span>
                </td>
                <td>{row.scheduledFor ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.scheduledFor)) : "Not scheduled"}</td>
                <td>
                  <form action={updateCalendarItemAction} className="compact-form">
                    <input name="itemId" type="hidden" value={row.id} />
                    <select name="status" defaultValue={row.status}>
                      <option value="draft">draft</option>
                      <option value="scheduled">scheduled</option>
                      <option value="approved">approved</option>
                      <option value="published">published</option>
                      <option value="rejected">rejected</option>
                      <option value="upcoming">upcoming</option>
                    </select>
                    <input name="scheduledFor" type="datetime-local" />
                    <input name="notes" placeholder="Notes" defaultValue={row.notes} />
                    <button className="mini-button" type="submit">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QueuePageShell>
  );
}
