import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getAccessRequestRows, getAccessRequestStats, type AccessRequestRow } from "@/lib/access-requests/get-access-requests";
import { createInviteFromAccessRequestAction, updateAccessRequestStatusAction } from "./actions";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AccessRequestsPage({
  searchParams
}: {
  searchParams: Promise<{ invite?: string; email?: string }>;
}) {
  const [rows, stats, params] = await Promise.all([getAccessRequestRows(), getAccessRequestStats(), searchParams]);
  const inviteUrl = params.invite ? `/invite/${params.invite}` : "";

  return (
    <QueuePageShell
      eyebrow="Public Signup"
      title="Access Requests"
      description="Review public setup requests from ferocity.live/start, choose the right next step, and create invite links when ready."
    >
      {inviteUrl ? (
        <section className="success-panel section-actions">
          Invite created for {params.email ?? "request"}. Share this link manually: <strong>{inviteUrl}</strong>
        </section>
      ) : null}

      <section className="grid section-actions">
        <Metric label="New" value={stats.newRequests} />
        <Metric label="Reviewing" value={stats.reviewing} />
        <Metric label="Invited" value={stats.invited} />
        <Metric label="High priority" value={stats.highPriority} />
      </section>

      <section className="panel section-actions">
        <h2>Requests</h2>
        <p className="muted">
          This is intentionally a review queue. It does not auto-create workspaces, charge cards, or turn on live sends.
        </p>
        <QueueTable<AccessRequestRow>
          rows={rows}
          emptyMessage="No public access requests yet."
          columns={[
            {
              key: "business",
              label: "Business",
              render: (row) => (
                <>
                  <strong>{row.companyName || row.name || "Unknown company"}</strong>
                  <span className="muted">{row.businessType || "No business type"} / {row.requestedPlan}</span>
                  {row.websiteUrl ? <a href={row.websiteUrl}>{row.websiteUrl}</a> : null}
                </>
              )
            },
            {
              key: "contact",
              label: "Contact",
              render: (row) => (
                <>
                  <strong>{row.email}</strong>
                  <span className="muted">{row.name || "No name"} {row.phone ? `/ ${row.phone}` : ""}</span>
                </>
              )
            },
            {
              key: "need",
              label: "Need",
              render: (row) => (
                <>
                  <span className="pill">{row.mainGoal || "not_sure"}</span>
                  <span className={`pill ${row.priority === "high" ? "high" : ""}`}>{row.priority}</span>
                  <span className="muted">{row.message || "No message"}</span>
                </>
              )
            },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <>
                  <span className="pill">{row.status}</span>
                  <span className="muted">{dateLabel(row.createdAt)}</span>
                  <span className="muted">{row.sourceDetail || row.source}</span>
                </>
              )
            },
            {
              key: "actions",
              label: "Next Step",
              render: (row) => (
                <div className="inline-actions">
                  <form action={updateAccessRequestStatusAction}>
                    <input name="requestId" type="hidden" value={row.id} />
                    <input name="status" type="hidden" value="reviewing" />
                    <button className="mini-button" type="submit">Reviewing</button>
                  </form>
                  <form action={createInviteFromAccessRequestAction}>
                    <input name="requestId" type="hidden" value={row.id} />
                    <input name="role" type="hidden" value="owner" />
                    <button className="mini-button" type="submit">Create invite</button>
                  </form>
                  <form action={updateAccessRequestStatusAction}>
                    <input name="requestId" type="hidden" value={row.id} />
                    <input name="status" type="hidden" value="closed" />
                    <button className="mini-button secondary-button" type="submit">Close</button>
                  </form>
                  <form action={updateAccessRequestStatusAction}>
                    <input name="requestId" type="hidden" value={row.id} />
                    <input name="status" type="hidden" value="spam" />
                    <button className="mini-button secondary-button" type="submit">Spam</button>
                  </form>
                </div>
              )
            }
          ]}
        />
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}
