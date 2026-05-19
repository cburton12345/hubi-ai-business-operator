import Link from "next/link";
import { notFound } from "next/navigation";
import { generateLeadIntelligenceAction, updateLeadWorkflow } from "@/app/app/leads/actions";
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
              {lead.brandName} · {lead.leadType} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(lead.createdAt))}
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
              <div>
                <dt>Email</dt>
                <dd>{lead.email || "Not provided"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{lead.phone || "Not provided"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="pill">{lead.status}</span>
                </dd>
              </div>
              <div>
                <dt>Qualification</dt>
                <dd>{lead.qualificationStatus}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span className={`pill ${lead.priority === "high" ? "high" : ""}`}>{lead.priority}</span>
                </dd>
              </div>
              <div>
                <dt>Consent</dt>
                <dd>{lead.consentToContact ? "Yes" : "No"}</dd>
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

          <section className="panel span-4">
            <h2>Update Workflow</h2>
            <form action={updateLeadWorkflow} className="form-stack">
              <input name="leadId" type="hidden" value={lead.id} />
              <label>
                Status
                <select name="status" defaultValue={lead.status}>
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qualification
                <select name="qualificationStatus" defaultValue={lead.qualificationStatus}>
                  {qualificationStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={lead.priority}>
                  {leadPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <textarea name="note" placeholder="Optional internal note" rows={4} />
              </label>
              <button className="button" type="submit">
                Save Update
              </button>
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
                <button className="button" type="submit">
                  Generate intelligence
                </button>
              </form>
            </div>
            {lead.intelligence ? (
              <dl className="detail-grid">
                <div className="detail-wide">
                  <dt>Summary</dt>
                  <dd>{lead.intelligence.summary}</dd>
                </div>
                <div>
                  <dt>Urgency</dt>
                  <dd>
                    <span className={`pill ${lead.intelligence.urgency === "high" ? "high" : ""}`}>{lead.intelligence.urgency}</span>
                  </dd>
                </div>
                <div>
                  <dt>Likely spam</dt>
                  <dd>{lead.intelligence.likelySpam ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Suggested service</dt>
                  <dd>{lead.intelligence.suggestedService || "Not classified"}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{lead.intelligence.suggestedCategory || "Not classified"}</dd>
                </div>
                <div className="detail-wide">
                  <dt>Next action</dt>
                  <dd>{lead.intelligence.suggestedNextAction}</dd>
                </div>
                <div className="detail-wide">
                  <dt>Manual reply draft</dt>
                  <dd>
                    <pre>{lead.intelligence.draftReply}</pre>
                  </dd>
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
