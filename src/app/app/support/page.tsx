import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { submitWorkspaceSupportAction } from "./actions";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

function phoneHref(value: string) { return `tel:${value.replace(/[^+\d]/g, "")}`; }
function statusLabel(value: string) { return ({ open: "Received", reviewing: "In review", resolved: "Resolved", dismissed: "Closed", archived: "Archived" } as Record<string, string>)[value] ?? value; }

export default async function WorkspaceSupportPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; reference?: string; error?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getCurrentWorkspace();
  const cases = await queryPostgres<{ id: string; subject: string | null; issue_type: string; status: string; created_at: Date }>(
    `select id,subject,issue_type,status,created_at from public.support_issue_queue
     where tenant_id=$1 order by created_at desc limit 20`,
    [workspace.id]
  );
  const supportPhone = env.VOICE_PHONE_NUMBER;
  return (
    <QueuePageShell
      eyebrow="Help"
      title="Ferocity Support"
      description="Tell Ferocity what happened. Your workspace is attached automatically, the support team is alerted, and the request stays trackable."
    >
      {params.sent ? (
        <section className="success-panel section-actions">
          <h2>Support has your request.</h2>
          <p>Reference: <strong>{params.reference}</strong>. Ferocity also emailed a copy to you.</p>
        </section>
      ) : null}
      <section className="panel section-actions">
        <h2>Choose the easiest way to reach us</h2>
        <div className="button-row">
          {supportPhone ? <a className="button" href={phoneHref(supportPhone)}>Call AI support</a> : null}
          <a className="button secondary-button" href="mailto:support@ferocity.live">Email support</a>
        </div>
        <p className="muted">The Ferocity voice agent can troubleshoot, record a tracked case, and alert the platform administrator. Ask for human follow-up whenever you want it. Never share passwords, verification codes, or full card details.</p>
      </section>
      <form action={submitWorkspaceSupportAction} className="panel stacked-form section-actions">
        {params.error ? <p className="form-error">Ferocity could not create that request. Check the fields and try again, or email support@ferocity.live.</p> : null}
        <div className="form-grid two">
          <label>What do you need help with?
            <select name="issueType" defaultValue="technical">
              <option value="account">Account access</option>
              <option value="billing">Billing or payment</option>
              <option value="technical">Something is not working</option>
              <option value="workflow">Workflow or automation</option>
              <option value="integration">Connected service</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label>Subject<input name="subject" required minLength={4} maxLength={180} /></label>
        </div>
        <label>What happened, and what were you trying to do?
          <textarea name="message" required minLength={12} maxLength={5000} rows={8} />
        </label>
        <p className="muted">Your business and account email are attached automatically. Never send passwords, verification codes, or full card information.</p>
        <button className="button" type="submit">Send support request</button>
      </form>
      <section className="panel section-actions">
        <h2>Your recent support requests</h2>
        <ul className="list">
          {(cases?.rows ?? []).map((item) => (
            <li className="list-row" key={item.id}>
              <div>
                <h3>{item.subject || "Support request"}</h3>
                <p className="muted">Reference {item.id} · {item.issue_type.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString()}</p>
              </div>
              <span className="pill">{statusLabel(item.status)}</span>
            </li>
          ))}
          {(cases?.rows.length ?? 0) === 0 ? <li className="list-row"><span className="muted">No support requests yet.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}
