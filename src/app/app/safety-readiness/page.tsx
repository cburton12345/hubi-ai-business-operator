import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, Gauge, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getSafetyReadinessDashboard, type SafetyStatus } from "@/lib/safety-readiness/get-safety-readiness-dashboard";

const metricLabels = [
  ["ready", "Ready"],
  ["needsSetup", "Needs setup"],
  ["needsReview", "Needs review"],
  ["blocked", "Blocked"],
  ["missingEnvVars", "Missing env vars"],
  ["liveActions", "Live actions"],
  ["nearLimits", "Near limits"],
  ["pendingApprovals", "Approvals"]
] as const;

function statusClass(status: SafetyStatus) {
  if (status === "blocked") return "high";
  if (status === "needs_review" || status === "needs_setup") return "medium";
  if (status === "paused") return "medium";
  return "";
}

function statusLabel(status: SafetyStatus) {
  return status.replaceAll("_", " ");
}

function statusIcon(status: SafetyStatus) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <CircleAlert size={16} />;
  return <CircleDashed size={16} />;
}

export default async function SafetyReadinessPage() {
  const dashboard = await getSafetyReadinessDashboard();

  return (
    <QueuePageShell
      eyebrow="Safety & Readiness"
      title="What Is Safe, Blocked, Or Needs Review"
      description="One front door for connected accounts, approvals, live actions, launch checks, usage limits, billing readiness, webhooks, access, and app health."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Normal operator view</p>
            <h2>Do not make people hunt through admin pages to know if Ferocity is safe to run.</h2>
            <p className="muted">
              Advanced pages still exist. This board shows the short answer first, then sends you to the exact page that fixes the issue.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/go-live">
              <ShieldCheck size={16} /> Go Live Check
            </Link>
            <Link className="button secondary-button" href="/app/system-health">
              <Gauge size={16} /> System Health
            </Link>
          </div>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/credentials">Credentials</Link>
          <Link className="button secondary-button" href="/app/controls">Controls</Link>
          <Link className="button secondary-button" href="/app/actions">Actions</Link>
          <Link className="button secondary-button" href="/app/approvals">Approvals</Link>
          <Link className="button secondary-button" href="/app/integrations">Integrations</Link>
          <Link className="button secondary-button" href="/app/billing">Billing</Link>
        </div>
      </section>

      <section className="grid section-actions">
        {metricLabels.map(([key, label]) => (
          <section className="metric-card span-3" key={key}>
            <small className="pill">readiness</small>
            <strong>{dashboard.metrics[key]}</strong>
            <span>{label}</span>
          </section>
        ))}
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2><CircleAlert size={18} /> Fix These First</h2>
          <p className="muted">Blocked items and review items rise to the top.</p>
          <ul className="list">
            {dashboard.topNeeds.map((need) => (
              <li className="list-row" key={need.title}>
                <div>
                  <h3>{statusIcon(need.status)} {need.title}</h3>
                  <p className="muted">{need.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${statusClass(need.status)}`}>{statusLabel(need.status)}</span>
                  <Link className="mini-button" href={need.href}>{need.button}</Link>
                </div>
              </li>
            ))}
            {dashboard.topNeeds.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3><CheckCircle2 size={16} /> No urgent blockers</h3>
                  <p className="muted">Use Go Live and System Health for deeper checks before real customer volume.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-7">
          <h2><LockKeyhole size={18} /> Safety Rules</h2>
          <div className="path-grid">
            <Link className="path-card" href="/app/controls">
              <ShieldCheck size={18} />
              <strong>Draft, review, or live</strong>
              <span>Every customer-facing, costed, or public action should have a clear mode and limit.</span>
            </Link>
            <Link className="path-card" href="/app/credentials">
              <KeyRound size={18} />
              <strong>Keys are checked, not exposed</strong>
              <span>Ferocity can show whether keys exist without showing secret values back to users.</span>
            </Link>
            <Link className="path-card" href="/app/actions">
              <CircleDashed size={18} />
              <strong>Queues before surprise sends</strong>
              <span>Email, publishing, billing, reviews, and sync work should be visible before live action.</span>
            </Link>
            <Link className="path-card" href="/app/go-live">
              <CheckCircle2 size={18} />
              <strong>Launch checklist last</strong>
              <span>Run the launch checklist after setup, providers, limits, public/private safety, and approvals are reviewed.</span>
            </Link>
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        {dashboard.sections.map((section) => (
          <section className="panel span-6" key={section.title}>
            <div className="list-row flush-row">
              <div>
                <h2>{section.title}</h2>
                <p className="muted">{section.body}</p>
              </div>
              <Link className="mini-button" href={section.href}>Open details</Link>
            </div>
            <ul className="list">
              {section.items.map((item) => (
                <li className="list-row" key={item.title}>
                  <div>
                    <h3>{statusIcon(item.status)} {item.title}</h3>
                    <p className="muted">{item.detail}</p>
                  </div>
                  <div className="inline-actions">
                    <span className={`pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                    <Link className="mini-button" href={item.href}>{item.button}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </QueuePageShell>
  );
}
