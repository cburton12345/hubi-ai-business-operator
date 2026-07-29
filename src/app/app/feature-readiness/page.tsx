import Link from "next/link";
import { CheckCircle2, CircleAlert, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getFeatureReadinessItems, type FeatureReadinessState } from "@/lib/readiness/feature-readiness";

function tone(state: FeatureReadinessState) {
  if (state === "live_now") return "";
  if (state === "needs_connection" || state === "approval_first") return "medium";
  return "high";
}

function icon(state: FeatureReadinessState) {
  if (state === "live_now") return <CheckCircle2 size={18} />;
  if (state === "needs_connection") return <PlugZap size={18} />;
  if (state === "approval_first") return <ShieldCheck size={18} />;
  if (state === "higher_plan") return <LockKeyhole size={18} />;
  return <PlugZap size={18} />;
}

export default async function FeatureReadinessPage() {
  const items = await getFeatureReadinessItems();
  const counts = {
    live: items.filter((item) => item.state === "live_now").length,
    approval: items.filter((item) => item.state === "approval_first").length,
    connection: items.filter((item) => item.state === "needs_connection").length,
    gated: items.filter((item) => item.state === "higher_plan").length
  };

  return (
    <QueuePageShell
      eyebrow="Feature Readiness"
      title="What Is Live, What Is Optional, And What Needs Review"
      description="A plain truth board for Ferocity. This keeps demos, customers, and internal decisions honest."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Launch Truth Board</h2>
            <p className="muted">
              Ferocity can do a lot now. This page separates usable tools from provider-gated or review-required work so nobody has to guess.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">Set up with AI</Link>
            <Link className="button secondary-button" href="/app/promise-audit">Promise audit</Link>
            <Link className="button secondary-button" href="/app/integrations">Connections</Link>
            <Link className="button secondary-button" href="/app/controls">Controls</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Live now" value={counts.live} />
          <Metric label="Review before action" value={counts.approval} />
          <Metric label="Optional connections" value={counts.connection} />
          <Metric label="Higher plan" value={counts.gated} />
        </div>
      </section>

      <section className="panel section-actions">
        <h2><CircleAlert size={18} /> The Rule</h2>
        <p>
          Internal organization, scans, drafts, reminders, owner alerts, source tracking, and setup can run automatically.
          Customer messages, public posts, website publishing, ad spend, payment requests, and managed payouts stay gated until connected and reviewed.
        </p>
      </section>

      <section className="grid section-actions">
        {items.map((item) => (
          <section className="panel span-6" key={`${item.area}-${item.title}`}>
            <div className="list-row flush-row">
              <div className="inline-title">
                {icon(item.state)}
                <div>
                  <p className="eyebrow">{item.area}</p>
                  <h2>{item.title}</h2>
                </div>
              </div>
              <span className={`pill ${tone(item.state)}`}>{item.plainStatus}</span>
            </div>
            <div className="status-grid compact-status-grid">
              <div className="status-card">
                <strong>What works</strong>
                <span className="muted">{item.whatWorks}</span>
              </div>
              <div className="status-card">
                <strong>What remains gated or optional</strong>
                <span className="muted">{item.whatIsBlocked}</span>
              </div>
            </div>
            <div className="list-row">
              <span>{item.nextStep}</span>
              <Link className="mini-button" href={item.href}>Open</Link>
            </div>
          </section>
        ))}
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
