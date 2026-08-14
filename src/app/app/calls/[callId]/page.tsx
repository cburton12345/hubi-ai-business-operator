import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getCallDetail } from "@/lib/office-manager/get-call-inbox";

function label(value: string | null) { return (value ?? "unknown").replaceAll("_", " "); }

export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  const call = await getCallDetail(callId);
  if (!call) notFound();
  const transcript = call.redactedTranscriptText || call.transcriptText;
  return (
    <QueuePageShell eyebrow="Call record" title={call.callerNumber} description={call.summary}>
      <section className="panel section-actions">
        <div className="list-row flush-row"><div><h2>Outcome</h2><p className="muted">{label(call.status)} · {label(call.outcome)} · {call.durationSeconds}s · {new Date(call.startedAt).toLocaleString()}</p></div><Link className="button secondary-button" href="/app/calls">Back to calls</Link></div>
        <p>{call.screeningSummary || call.callerContext || "Ferocity has not added more caller context yet."}</p>
        {call.actionItems.length ? <p><strong>Next:</strong> {call.actionItems.join("; ")}</p> : null}
        <div className="button-row">
          {call.customerId ? <Link className="button secondary-button" href={`/app/service/customers/${call.customerId}`}>Open customer</Link> : null}
          {call.leadId ? <Link className="button secondary-button" href={`/app/leads/${call.leadId}`}>Open lead</Link> : null}
          {call.recordingStatus === "available" ? <a className="button secondary-button" href={`/api/calls/${call.id}/recording`}>Play recording</a> : null}
        </div>
      </section>
      <section className="panel section-actions"><h2>Conversation</h2>
        {call.turns.length ? <ul className="list">{call.turns.map((turn) => <li className="list-row" key={turn.id}><div><strong>{label(turn.speaker)}</strong><p>{turn.content}</p></div></li>)}</ul>
          : transcript ? <p style={{ whiteSpace: "pre-wrap" }}>{transcript}</p> : <p className="muted">No transcript is available.</p>}
      </section>
      <section className="panel section-actions"><h2>Call activity</h2><ul className="list">{call.events.map((event) => <li className="list-row" key={event.id}><span>{label(event.type)}</span><span className="muted">{new Date(event.occurredAt).toLocaleString()} · {label(event.status)}</span></li>)}</ul></section>
    </QueuePageShell>
  );
}
