import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPromiseAudit, type PromiseAuditStatus } from "@/lib/readiness/get-promise-audit";

function statusLabel(status: PromiseAuditStatus) {
  if (status === "strong") return "Strong";
  if (status === "watch") return "Watch";
  if (status === "needs_work") return "Needs work";
  return "Blocked";
}

function statusClass(status: PromiseAuditStatus) {
  if (status === "strong") return "status-included";
  if (status === "watch") return "status-draft_only";
  if (status === "needs_work") return "status-needs_setup";
  return "high";
}

function statusIcon(status: PromiseAuditStatus) {
  if (status === "strong") return <CheckCircle2 size={18} />;
  if (status === "watch") return <CircleDashed size={18} />;
  return <AlertTriangle size={18} />;
}

export default async function PromiseAuditPage() {
  const audit = await getPromiseAudit();

  return (
    <QueuePageShell
      eyebrow="Promise Audit"
      title="Are We Backing Up What Ferocity Says?"
      description="A launch truth check for the hard questions: what works, what needs setup, what is provider-gated, and what should not be oversold."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Launch Honesty Score</h2>
            <p className="muted">
              This is not a marketing score. It checks whether the product, copy, setup path, billing, AI, and provider gates match what customers are being told.
            </p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="grid">
          <Metric label="Score" value={`${audit.score}/100`} />
          <Metric label="Strong" value={audit.strong.toLocaleString()} />
          <Metric label="Watch" value={audit.watch.toLocaleString()} />
          <Metric label="Needs work" value={(audit.needsWork + audit.blocked).toLocaleString()} />
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>The Rule</h2>
            <p className="muted">
              Ferocity can promise organized operations, AI-prepared work, owner attention, and approved automation. It should not promise live sends,
              ad spend, public publishing, voice calls, managed payouts, or platform posting until the required provider is connected and tested.
            </p>
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/app/feature-readiness">Feature readiness</Link>
            <Link className="mini-button" href="/app/go-live">Go live</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Connected tools" value={audit.counts.connectedIntegrations.toLocaleString()} />
        <Metric label="Lead forms" value={audit.counts.activeForms.toLocaleString()} />
        <Metric label="AI workflows" value={audit.counts.aiWorkflows.toLocaleString()} />
        <Metric label="Owner events" value={audit.counts.ownerEvents.toLocaleString()} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Critical Questions</h2>
            <p className="muted">
              Use this before launch, after big feature work, and before changing public copy.
            </p>
          </div>
          <Link className="mini-button" href="/app/build-system">Fix with Ferocity</Link>
        </div>
        <ul className="list">
          {audit.questions.map((item) => (
            <li className="list-row" key={item.question}>
              <div className="inline-title">
                {statusIcon(item.status)}
                <div>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                  <p className="muted"><strong>Proof:</strong> {item.proof}</p>
                  <p className="muted"><strong>Next:</strong> {item.nextAction}</p>
                </div>
              </div>
              <div className="inline-actions">
                <span className={`pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                <Link className="mini-button" href={item.href}>Open</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}
