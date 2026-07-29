import Link from "next/link";
import { Gauge, PackagePlus, ReceiptText, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAiUsageDashboard } from "@/lib/usage/get-ai-usage-dashboard";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function percent(used: number, included: number) {
  if (included <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / included) * 100));
}

export default async function AiUsagePage() {
  const dashboard = await getAiUsageDashboard();

  return (
    <QueuePageShell
      eyebrow="AI Usage"
      title="Included Usage, Overage, And Premium AI"
      description="Normal AI should feel easy. Expensive calls, voice, video, images, and provider usage are tracked so nobody gets surprised."
    >
      <section className="grid section-actions">
        <Metric icon={<Gauge size={18} />} label="Estimated charges" value={money(dashboard.totals.estimatedChargesCents)} />
        <Metric icon={<ReceiptText size={18} />} label="Customer charge" value={money(dashboard.totals.customerChargeCents)} />
        <Metric icon={<ShieldCheck size={18} />} label="Provider cost tracked" value={money(dashboard.totals.providerCostCents)} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Current Period</h2>
            <p className="muted">{dashboard.period.start} through {dashboard.period.end}</p>
          </div>
          <div className="inline-actions">
            <Link className="button secondary-button" href="/app/billing">Billing</Link>
            <Link className="button secondary-button" href="/app/ai-control">AI controls</Link>
            <Link className="button secondary-button" href="/app/receptionist-setup">Receptionist setup</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Usage Allowances</h2>
        <ul className="list">
          {dashboard.rows.map((row) => (
            <li className="list-row" key={`${row.featureKey}-${row.unitType}`}>
              <div>
                <h3>{label(row.featureKey)}</h3>
                <p className="muted">
                  {row.usedQuantity.toLocaleString()} {label(row.unitType)} used
                  {row.includedQuantity > 0 ? ` / ${row.includedQuantity.toLocaleString()} included` : " / no included allowance configured"}
                </p>
                <div className="progress-track" aria-label={`${label(row.featureKey)} usage`}>
                  <span style={{ width: `${percent(row.usedQuantity, row.includedQuantity)}%` }} />
                </div>
              </div>
              <div className="status-card">
                <span>{label(row.status)}</span>
                <strong>{row.remainingQuantity === null ? "metered" : `${row.remainingQuantity.toLocaleString()} left`}</strong>
                <span>{row.overageQuantity.toLocaleString()} overage</span>
                <span>{money(row.estimatedChargeCents)}</span>
                <span>{label(row.overageMode)}</span>
              </div>
            </li>
          ))}
          {dashboard.rows.length === 0 ? (
            <li className="list-row">
              <span className="muted">Usage limits have not been configured. Set them before enabling metered AI or voice billing.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Spend And Safety Limits</h2>
        <p className="muted">
          These are the rails that keep normal AI feeling easy while expensive provider usage stays controlled.
        </p>
        <ul className="list">
          {dashboard.spendLimits.map((limit) => (
            <li className="list-row" key={`${limit.scopeType}-${limit.scopeKey ?? "default"}`}>
              <div>
                <h3>{label(limit.scopeType)}{limit.scopeKey ? ` / ${label(limit.scopeKey)}` : ""}</h3>
                <p className="muted">
                  Failed payment behavior: {label(limit.failedPaymentBehavior)}
                  {limit.maxCallDurationSeconds ? ` / max call ${Math.round(limit.maxCallDurationSeconds / 60)} min` : ""}
                </p>
              </div>
              <div className="status-card">
                <span>{label(limit.status)}</span>
                <strong>{limit.emergencyPaused ? "paused" : "running"}</strong>
                <span>provider cap {limit.monthlyProviderCostCapCents === null ? "none" : money(limit.monthlyProviderCostCapCents)}</span>
                <span>charge cap {limit.monthlyCustomerChargeCapCents === null ? "none" : money(limit.monthlyCustomerChargeCapCents)}</span>
                <span>calls {limit.concurrentCallLimit ?? "not set"}</span>
              </div>
            </li>
          ))}
          {dashboard.spendLimits.length === 0 ? (
            <li className="list-row">
              <span className="muted">No spend limits found. Keep live premium AI disabled until defaults are configured.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><PackagePlus size={18} /> Bundles</h2>
            <p className="muted">Bundles are ready as a billing model, but prices stay planned until provider costs are confirmed.</p>
          </div>
          <span className="pill medium">prices tbd</span>
        </div>
        <ul className="list">
          {dashboard.bundles.map((bundle) => (
            <li className="list-row" key={`${bundle.displayName}-${bundle.featureKey}-${bundle.unitType}`}>
              <div>
                <h3>{bundle.displayName}</h3>
                <p className="muted">{label(bundle.featureKey)} / {label(bundle.unitType)}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{label(bundle.status)}</span>
                <span className="pill">{bundle.remainingQuantity.toLocaleString()} left</span>
              </div>
            </li>
          ))}
          {dashboard.bundles.length === 0 ? (
            <li className="list-row">
              <span className="muted">No purchased bundles yet. Planned bundles are configured in the billing catalog.</span>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{icon} {label}</span>
      <strong>{value}</strong>
    </section>
  );
}
