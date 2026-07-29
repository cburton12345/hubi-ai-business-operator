import Link from "next/link";
import { Gauge, PlugZap, ShieldAlert, Video } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAiControlDashboard } from "@/lib/ai/get-ai-control-dashboard";

function dollars(cents: number | null) {
  if (cents === null) return "No cap";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AiControlPage() {
  const dashboard = await getAiControlDashboard();

  return (
    <QueuePageShell
      eyebrow="AI Control"
      title="AI Cost And Provider Controls"
      description="Keep normal AI help easy to use while separating expensive media generation, provider readiness, and budget protection."
    >
      <div className="grid section-actions">
        <Metric icon={<Gauge size={18} />} label="AI requests today" value={dashboard.summary.requestsToday.toLocaleString()} />
        <Metric icon={<PlugZap size={18} />} label="AI requests this month" value={dashboard.summary.requestsThisMonth.toLocaleString()} />
        <Metric icon={<ShieldAlert size={18} />} label="Estimated AI cost" value={dollars(dashboard.summary.estimatedCostCentsThisMonth)} />
        <Metric icon={<Video size={18} />} label="Premium media runs" value={dashboard.summary.premiumMediaRequestsThisMonth.toLocaleString()} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>How This Works</h2>
            <p className="muted">
              Core AI drafts, setup help, summaries, receipts, and recommendations use the normal AI lane. Video, large image batches, voice, and premium media models use the premium media lane.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/controls">Service controls</Link>
            <Link className="mini-button" href="/app/marketing-os">Marketing</Link>
            <Link className="mini-button" href="/app/ai-workforce">AI Workforce</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Providers</h2>
        <ul className="list">
          {dashboard.providers.map((provider) => (
            <li className="list-row" key={provider.providerKey}>
              <div>
                <h3>{provider.displayName}</h3>
                <p className="muted">
                  {provider.providerKey} / {provider.family} / {provider.defaultModel ?? "default model not set"}
                </p>
                <p>{provider.capabilities.length ? provider.capabilities.join(", ") : "No live capability enabled yet"}</p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${provider.status === "enabled" || provider.status === "configured" ? "" : "medium"}`}>{provider.status}</span>
                <span className={`pill ${provider.costCategory === "premium_media" ? "high" : ""}`}>{provider.costCategory}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Usage This Month</h2>
        {dashboard.usageByFeature.length ? (
          <ul className="list">
            {dashboard.usageByFeature.map((usage) => (
              <li className="list-row" key={usage.featureKey}>
                <div>
                  <h3>{usage.featureKey}</h3>
                  <p className="muted">{usage.requests.toLocaleString()} requests / {usage.fallbackCount.toLocaleString()} completed without the preferred model</p>
                </div>
                <span className="pill">{dollars(usage.estimatedCostCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No AI usage has been recorded for this business this month.</p>
        )}
      </section>

      <section className="panel section-actions">
        <h2>Budget Policies</h2>
        {dashboard.policies.length ? (
          <ul className="list">
            {dashboard.policies.map((policy) => (
              <li className="list-row" key={policy.id}>
                <div>
                  <h3>{policy.aiCategory}</h3>
                  <p className="muted">{policy.scopeType} / {policy.status}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${policy.emergencyPaused ? "high" : ""}`}>{policy.emergencyPaused ? "paused" : "active"}</span>
                  <span className="pill">{dollars(policy.monthlyCapCents)}</span>
                  <span className="pill">{policy.monthlyRequestCap === null ? "No request cap" : `${policy.monthlyRequestCap.toLocaleString()} requests`}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No workspace AI budget policy is configured yet. Service controls still protect individual features.</p>
        )}
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{icon} {label}</span>
      <strong>{value}</strong>
    </section>
  );
}
