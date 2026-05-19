import Link from "next/link";
import { notFound } from "next/navigation";
import { assignLeadAction, calculateLeadScoreAction, generateLeadIntelligenceAction, updateLeadWorkflow } from "@/app/app/leads/actions";
import { leadPriorities, leadStatuses, qualificationStatuses } from "@/lib/leads/constants";
import { getLeadDetail } from "@/lib/leads/get-lead-detail";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = await getLeadDetail(leadId);

  if (!lead) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Lead Detail</p>
            <h1>{lead.name}</h1>
            <p className="muted">
              {lead.brandName} / {lead.leadType} / {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(lead.createdAt))}
            </p>
          </div>
          <Link className="button secondary-button" href="/app/leads">
            Back to Leads
          </Link>
        </div>

        <div className="grid">
          <section className="panel span-8">
            <h2>Lead Information</h2>
            <dl className="detail-grid">
              <Detail label="Email" value={lead.email || "Not provided"} />
              <Detail label="Phone" value={lead.phone || "Not provided"} />
              <Detail label="Status" value={lead.status} />
              <Detail label="Qualification" value={lead.qualificationStatus} />
              <Detail label="Priority" value={lead.priority} />
              <Detail label="Consent" value={lead.consentToContact ? "Yes" : "No"} />
              <Detail label="Lead Score" value={lead.score ? `${lead.score.score} / ${lead.score.grade}` : "Not scored"} />
              <Detail label="Assigned To" value={lead.assignment?.assignedTo ?? "Unassigned"} />
              <div className="detail-wide">
                <dt>Score Reasons</dt>
                <dd>{lead.score?.reasons.join(", ") || "No score reasons yet."}</dd>
              </div>
              <div className="detail-wide">
                <dt>Message</dt>
                <dd>{lead.message || "No message provided."}</dd>
              </div>
              <div className="detail-wide">
                <dt>Metadata</dt>
                <dd>
                  <pre>{JSON.stringify(lead.metadata, null, 2)}</pre>
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel span-4 form-stack">
            <h2>Update Workflow</h2>
            <form action={updateLeadWorkflow} className="form-stack">
              <input name="leadId" type="hidden" value={lead.id} />
              <label>
                Status
                <select name="status" defaultValue={lead.status}>
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Qualification
                <select name="qualificationStatus" defaultValue={lead.qualificationStatus}>
                  {qualificationStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={lead.priority}>
                  {leadPriorities.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <textarea name="note" placeholder="Optional internal note" rows={4} />
              </label>
              <button className="button" type="submit">Save update</button>
            </form>
            <form action={calculateLeadScoreAction}>
              <input name="leadId" type="hidden" value={lead.id} />
              <button className="button secondary-button" type="submit">Calculate score</button>
            </form>
            <form action={assignLeadAction} className="form-stack">
              <input name="leadId" type="hidden" value={lead.id} />
              <label>
                Assign to workspace user email
                <input name="assigneeEmail" type="email" placeholder="operator@example.com" />
              </label>
              <label>
                Assignment notes
                <textarea name="notes" rows={3} defaultValue={lead.assignment?.notes ?? ""} />
              </label>
              <button className="button secondary-button" type="submit">Save assignment</button>
            </form>
          </section>

          <section className="panel span-12">
            <div className="topbar">
              <div>
                <h2>AI Lead Intelligence</h2>
                <p className="muted">Summarize the lead, classify urgency, detect likely spam, suggest a service, and draft a reply for manual review.</p>
              </div>
              <form action={generateLeadIntelligenceAction}>
                <input name="leadId" type="hidden" value={lead.id} />
                <button className="button" type="submit">Generate intelligence</button>
              </form>
            </div>
            {lead.intelligence ? (
              <dl className="detail-grid">
                <div className="detail-wide">
                  <dt>Summary</dt>
                  <dd>{lead.intelligence.summary}</dd>
                </div>
                <Detail label="Urgency" value={lead.intelligence.urgency} />
                <Detail label="Likely spam" value={lead.intelligence.likelySpam ? "Yes" : "No"} />
                <Detail label="Suggested service" value={lead.intelligence.suggestedService || "Not classified"} />
                <Detail label="Category" value={lead.intelligence.suggestedCategory || "Not classified"} />
                <div className="detail-wide">
                  <dt>Next action</dt>
                  <dd>{lead.intelligence.suggestedNextAction}</dd>
                </div>
                <div className="detail-wide">
                  <dt>Manual reply draft</dt>
                  <dd><pre>{lead.intelligence.draftReply}</pre></dd>
                </div>
              </dl>
            ) : (
              <p className="muted">No lead intelligence generated yet.</p>
            )}
          </section>

          <section className="panel span-12">
            <h2>Event Timeline</h2>
            <ul className="list">
              {lead.events.map((event) => (
                <li className="list-row" key={event.id}>
                  <div>
                    <h3>{event.type}</h3>
                    <p className="muted">{event.body}</p>
                  </div>
                  <span className="pill">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(event.createdAt))}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
