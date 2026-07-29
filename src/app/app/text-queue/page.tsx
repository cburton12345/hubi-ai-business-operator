import Link from "next/link";
import { MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getManualTextQueue } from "@/lib/manual-text-queue/get-manual-text-queue";
import {
  cancelManualTextAction,
  markManualTextOutcomeAction,
  markManualTextSentAction,
  prepareInvoiceTextQueueAction,
  prepareLeadTextQueueAction
} from "./actions";
import { CommunicationMethodControl } from "@/app/app/actions/CommunicationMethodControl";

export default async function TextQueuePage() {
  const dashboard = await getManualTextQueue();

  return (
    <QueuePageShell
      eyebrow="Manual Text Queue"
      title="Prepare Follow-Up Texts Without Group Blasts"
      description="Ferocity prepares separate one-to-one text drafts for leads and unpaid invoices. You open each text in your phone app, review it, send it, then mark it sent."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><MessageSquareText size={18} /> Batch prep, one-to-one sending</h2>
            <p className="muted">
              These are not group texts and not live Twilio sends. Ferocity caps normal no-reply follow-ups at 3 attempts and waits before recommending the next one.
            </p>
          </div>
          <div className="inline-actions">
            <form action={prepareLeadTextQueueAction}>
              <button className="button" type="submit"><RefreshCw size={16} /> Prepare lead texts</button>
            </form>
            <form action={prepareInvoiceTextQueueAction}>
              <button className="button secondary-button" type="submit">Prepare bill reminders</button>
            </form>
          </div>
        </div>
      </section>

      <div className="grid section-actions">
        <Metric label="Ready texts" value={dashboard.metrics.readyTexts} />
        <Metric label="Lead follow-ups" value={dashboard.metrics.leadTexts} />
        <Metric label="Bill reminders" value={dashboard.metrics.invoiceTexts} />
        <Metric label="Capped at 3" value={dashboard.metrics.cappedItems} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ShieldCheck size={18} /> Texts Ready To Send</h2>
            <p className="muted">Open one text, send it from your device, then mark it sent so Ferocity knows not to keep bothering them.</p>
          </div>
          <Link className="mini-button" href="/app/actions">Full action queue</Link>
        </div>
        <ul className="list">
          {dashboard.rows.map((row) => (
            <li className="list-row" key={row.id}>
              <div>
                <h3>{row.subject}</h3>
                <p className="muted">{row.targetType.replaceAll("_", " ")} / attempt {row.attempt} of 3 / {row.scheduledFor}</p>
                <p className="muted">{row.recipient || "No phone number"}</p>
                <p>{row.body}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{row.status}</span>
                <form action={markManualTextSentAction}>
                  <input name="id" type="hidden" value={row.id} />
                  <button className="mini-button secondary-button" type="submit">Mark sent</button>
                </form>
                <form action={markManualTextOutcomeAction} className="inline-actions">
                  <input name="id" type="hidden" value={row.id} />
                  <select name="outcome" defaultValue="replied" aria-label={`Outcome for ${row.subject}`}>
                    <option value="replied">Replied</option>
                    <option value="paid">Paid</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="not_interested">Not interested</option>
                    <option value="stop_follow_up">Stop follow-up</option>
                    <option value="no_answer">No answer</option>
                  </select>
                  <button className="mini-button secondary-button" type="submit">Save outcome</button>
                </form>
                <form action={cancelManualTextAction}>
                  <input name="id" type="hidden" value={row.id} />
                  <button className="mini-button secondary-button" type="submit">Cancel</button>
                </form>
              </div>
              <CommunicationMethodControl
                actionId={row.id}
                body={row.body}
                currentMethod={row.resolvedMethod}
                email={row.email}
                phone={row.recipient || null}
                resolvedScope={row.resolvedScope}
                subject={row.subject}
              />
            </li>
          ))}
          {dashboard.rows.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No manual texts queued</h3>
                <p className="muted">Use the buttons above to prepare recommended lead follow-ups or bill reminders.</p>
              </div>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}
