import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, PlugZap, ShieldCheck, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getBusinessGapScan, type BusinessGapItem } from "@/lib/business-gaps/get-business-gap-scan";

function tone(status: BusinessGapItem["status"]) {
  if (status === "blocked" || status === "needs_connection") return "high";
  if (status === "needs_review" || status === "needs_data") return "medium";
  return "";
}

function plain(status: BusinessGapItem["status"]) {
  return status.replaceAll("_", " ");
}

export default async function GapScanPage() {
  const scan = await getBusinessGapScan();

  return (
    <QueuePageShell
      eyebrow="Business Gap Scan"
      title="What Ferocity Can Run Next"
      description="A plain-English scan of what is ready, what needs setup, and what blocks deeper automation, posting, sending, and collection."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">{scan.workspaceName}</p>
            <h2>{scan.score}/100 hands-free readiness</h2>
            <p className="muted">
              Ferocity can handle more of the business when the right data, controls, approvals, and connected accounts are in place.
              This page shows the honest gap between dashboard mode and true AI-assisted operation.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">
              <Bot size={16} /> Build my system
            </Link>
            <Link className="button secondary-button" href="/app/controls">
              <ShieldCheck size={16} /> Controls
            </Link>
          </div>
        </div>
        <div className="grid">
          <Metric label="Ready areas" value={scan.readyCount} />
          <Metric label="Need review" value={scan.reviewCount} tone={scan.reviewCount ? "medium" : ""} />
          <Metric label="Need connection" value={scan.connectionCount} tone={scan.connectionCount ? "high" : ""} />
          <Metric label="Need data" value={scan.dataCount} tone={scan.dataCount ? "medium" : ""} />
          <Metric label="Blocked" value={scan.blockedCount} tone={scan.blockedCount ? "high" : ""} />
          <Metric label="Queued actions" value={scan.counts.actionQueue} tone={scan.counts.actionQueue ? "medium" : ""} />
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2><Sparkles size={18} /> Do These First</h2>
          <p className="muted">These gaps are most likely to unlock real hands-free value: more follow-up, more posting, more collection, or less owner babysitting.</p>
          <ul className="list">
            {scan.topGaps.map((gap) => (
              <li className="list-row" key={gap.key}>
                <div>
                  <h3>{gap.title}</h3>
                  <p className="muted">{gap.blocker}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(gap.status)}`}>{plain(gap.status)}</span>
                  <Link className="mini-button" href={gap.href}>{gap.nextAction}</Link>
                </div>
              </li>
            ))}
            {scan.topGaps.length === 0 ? (
              <li className="list-row"><span className="muted">No major setup gaps found. Keep using the automation timeline and action queue.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2><PlugZap size={18} /> Live Action Reality Check</h2>
          <p className="muted">This is the part that keeps Ferocity from becoming fake. Drafting can work before every account is connected. Live posting, sending, spending, and collection need the right lane.</p>
          <div className="stacked-list">
            {Object.entries(scan.liveSummary).map(([key, value]) => (
              <div className="list-row flush-row" key={key}>
                <strong>{key.replaceAll("_", " ")}</strong>
                <span className={`pill ${value.includes("Needs") ? "high" : value.includes("review") || value.includes("Manual") ? "medium" : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Full Gap List</h2>
            <p className="muted">Each row routes to an existing Ferocity tool. No duplicate CRM, duplicate marketing system, or duplicate automation engine.</p>
          </div>
          <Link className="mini-button" href="/app/feature-map">All tools</Link>
        </div>
        <div className="grid">
          {scan.gaps.map((gap) => (
            <Link className="panel span-6 status-card" href={gap.href} key={gap.key}>
              <div>
                <p className="eyebrow">{gap.area}</p>
                <h2>{gap.title}</h2>
                <p className="muted">{gap.whatFerocityCanDo}</p>
                <p>{gap.blocker}</p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${tone(gap.status)}`}>{plain(gap.status)}</span>
                <span className="pill">{gap.impact} impact</span>
                <span className="muted">{gap.metric}</span>
                <span className="mini-button">{gap.nextAction} <ArrowRight size={14} /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2><CheckCircle2 size={18} /> Guardrails Ferocity Is Using</h2>
        <div className="path-grid">
          {Object.entries(scan.controls).map(([key, value]) => (
            <div className="path-card" key={key}>
              <strong>{key}</strong>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
      <small className={`pill ${tone}`}>{value > 0 ? "check" : "clear"}</small>
    </section>
  );
}
