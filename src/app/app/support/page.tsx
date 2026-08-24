import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { submitWorkspaceSupportAction } from "./actions";

export default async function WorkspaceSupportPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; reference?: string; error?: string }>;
}) {
  const params = await searchParams;
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
    </QueuePageShell>
  );
}
