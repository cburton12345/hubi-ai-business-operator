import { AlertTriangle, BatteryCharging, Gauge, ReceiptText, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { requirePermission } from "@/lib/auth/require-permission";
import { getProviderFundingDashboard, type ProviderFundingAccount } from "@/lib/usage/provider-funding";
import { reconcileProviderCostAction, saveProviderFundingAccountAction } from "./actions";

function money(cents: number | null) {
  if (cents === null) return "not synced";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function healthClass(status: string) {
  return ["critical", "depleted", "payment_issue"].includes(status)
    ? "high"
    : ["low", "needs_sync"].includes(status)
      ? "medium"
      : "";
}

function monthBounds() {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  };
}

export default async function ProviderCostsPage() {
  await requirePermission("platform:manage");
  const dashboard = await getProviderFundingDashboard();
  const period = monthBounds();

  return (
    <QueuePageShell
      eyebrow="Platform Owner"
      title="Provider Costs And Funding"
      description="Track what Ferocity pays, what customers are charged, how long balances should last, and which provider account needs attention. This page never moves money."
    >
      <section className="grid section-actions">
        <Metric icon={<BatteryCharging size={18} />} label="Known provider balance" value={money(dashboard.totals.availableProviderBalanceCents)} />
        <Metric icon={<ReceiptText size={18} />} label="Provider cost this month" value={money(dashboard.totals.monthlyProviderCostCents)} />
        <Metric icon={<Gauge size={18} />} label="Customer usage charges" value={money(dashboard.totals.monthlyCustomerChargeCents)} />
        <Metric icon={<ShieldCheck size={18} />} label="Gross margin tracked" value={money(dashboard.totals.grossMarginCents)} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Funding Alerts</h2>
            <p className="muted">Stale balances, low funds, reload failures, depleted accounts, and payment issues appear here.</p>
          </div>
          <span className={`pill ${dashboard.totals.activeAlertCount ? "high" : ""}`}>
            {dashboard.totals.activeAlertCount} active
          </span>
        </div>
        <ul className="list">
          {dashboard.activeAlerts.map((alert) => (
            <li className="list-row" key={alert.id}>
              <div>
                <h3><AlertTriangle size={16} /> {alert.title}</h3>
                <p className="muted">{alert.summary}</p>
              </div>
              <span className={`pill ${alert.severity === "high" ? "high" : "medium"}`}>{alert.severity}</span>
            </li>
          ))}
          {dashboard.activeAlerts.length === 0 ? <li className="list-row"><span className="muted">No funding alert is active.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Provider Accounts</h2>
        <p className="muted">
          Provider API balances are preferred. Manual balance snapshots remain available when a provider does not expose a safe read-only balance API.
          Customer-owned accounts stay isolated from Ferocity-managed accounts.
        </p>
        <div className="grid section-actions">
          {dashboard.accounts.map((account) => (
            <ProviderAccountCard account={account} period={period} key={account.id} />
          ))}
          {dashboard.accounts.length === 0 ? (
            <section className="panel span-12"><p className="muted">No provider funding account has been recorded yet. Add Google Veo first, then Retell, Twilio, and managed advertising accounts.</p></section>
          ) : null}
        </div>
      </section>

      <section className="panel section-actions">
        <details>
          <summary>Add a provider funding account</summary>
          <FundingAccountForm />
        </details>
      </section>

      <section className="panel section-actions">
        <h2>Managed Advertising Money</h2>
        <p className="muted">Customer prepaid media budgets remain separate from Ferocity&apos;s own provider balances.</p>
        <div className="grid">
          {dashboard.managedAds.map((budget) => (
            <section className="panel span-4" key={budget.providerKey}>
              <span className="eyebrow">{label(budget.providerKey)}</span>
              <h3>{money(budget.availableCents)} available</h3>
              <p className="muted">{money(budget.reservedCents)} reserved / {money(budget.spentCents)} recorded spend</p>
              <p className="muted">{money(budget.dailyCapCents)} combined daily caps / {money(budget.monthlyCapCents)} combined monthly caps</p>
              <span className="pill">{budget.tenantCount} workspace{budget.tenantCount === 1 ? "" : "s"}</span>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Untracked Ferocity-Paid Usage</h2>
        <p className="muted">Managed usage below has cost records but no Ferocity funding account. Create the account so balance and reload health can be monitored.</p>
        <ul className="list">
          {dashboard.untrackedProviders.map((provider) => (
            <li className="list-row" key={provider.providerKey}>
              <div><h3>{label(provider.providerKey)}</h3><p className="muted">{provider.quantity.toLocaleString()} units recorded</p></div>
              <div className="status-card">
                <span>provider cost {money(provider.providerCostCents)}</span>
                <span>customer charge {money(provider.customerChargeCents)}</span>
              </div>
            </li>
          ))}
          {dashboard.untrackedProviders.length === 0 ? <li className="list-row"><span className="muted">Every provider with current-month cost is connected to a funding account.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function ProviderAccountCard({ account, period }: { account: ProviderFundingAccount; period: { start: string; end: string } }) {
  return (
    <section className="panel span-6">
      <div className="list-row flush-row">
        <div>
          <span className="eyebrow">{label(account.providerKey)} / {label(account.ownershipMode)}</span>
          <h3>{account.displayName}</h3>
          <p className="muted">{account.tenantName ?? "Ferocity platform account"}</p>
        </div>
        <span className={`pill ${healthClass(account.health.status)}`}>{label(account.health.status)}</span>
      </div>
      <p>{account.health.reason}</p>
      <div className="grid compact-grid">
        <Metric label="Available" value={money(account.health.totalAvailableCents)} />
        <Metric label="Daily burn" value={money(Math.ceil(account.health.averageDailyBurnCents))} />
        <Metric label="Projected month" value={money(account.health.projectedMonthlyProviderCostCents)} />
        <Metric label="Runway" value={account.health.estimatedDaysRemaining === null ? "unknown" : `${account.health.estimatedDaysRemaining} days`} />
        <Metric label="Provider cost" value={money(account.health.monthlyProviderCostCents)} />
        <Metric label="Customer charge" value={money(account.health.monthlyCustomerChargeCents)} />
        <Metric label="Gross margin" value={account.health.grossMarginPercent === null ? money(account.health.grossMarginCents) : `${money(account.health.grossMarginCents)} / ${account.health.grossMarginPercent}%`} />
        <Metric label="Balance sync" value={account.lastBalanceSyncAt ? new Date(account.lastBalanceSyncAt).toLocaleString() : "never"} />
        <Metric label="Promotion expires" value={account.health.promotionalExpiresAt ? new Date(account.health.promotionalExpiresAt).toLocaleDateString() : "none recorded"} />
      </div>
      <ul className="list section-actions">
        <li className="list-row"><span>Auto-reload</span><strong>{account.reloadEnabled ? "on" : "off"}</strong></li>
        <li className="list-row"><span>Reload trigger / amount</span><strong>{money(account.reloadTriggerBalanceCents)} / {money(account.reloadAmountCents)}</strong></li>
        <li className="list-row"><span>Monthly reload / spend limits</span><strong>{money(account.monthlyReloadLimitCents)} / {money(account.monthlyProviderSpendCapCents)}</strong></li>
        <li className="list-row"><span>Payment / sync</span><strong>{label(account.paymentStatus)} / {label(account.syncStatus)}</strong></li>
      </ul>
      <details className="section-actions">
        <summary>Update funding and reload settings</summary>
        <FundingAccountForm account={account} />
      </details>
      <details className="section-actions">
        <summary>Reconcile a provider statement</summary>
        <form action={reconcileProviderCostAction} className="form-stack">
          <input name="accountId" type="hidden" value={account.id} />
          <label>Period start<input name="periodStart" type="date" defaultValue={period.start} required /></label>
          <label>Period end<input name="periodEnd" type="date" defaultValue={period.end} required /></label>
          <label>Provider statement total ($)<input name="providerStatementAmount" type="number" min="0" step="0.01" required /></label>
          <label>Statement or invoice reference<input name="providerStatementRef" maxLength={200} /></label>
          <label>Review notes<textarea name="notes" maxLength={1500} /></label>
          <button className="mini-button" type="submit">Compare statement to Ferocity</button>
        </form>
      </details>
    </section>
  );
}

function FundingAccountForm({ account }: { account?: ProviderFundingAccount }) {
  return (
    <form action={saveProviderFundingAccountAction} className="form-stack section-actions">
      <input name="accountId" type="hidden" value={account?.id ?? ""} />
      <label>Workspace ID (blank for a Ferocity platform account)<input name="tenantId" defaultValue={account?.tenantId ?? ""} /></label>
      <label>Provider key<input name="providerKey" defaultValue={account?.providerKey ?? ""} placeholder="google_veo" required /></label>
      <label>Account key<input name="accountKey" defaultValue={account?.accountKey ?? ""} placeholder="ferocity-google-ai-studio" required /></label>
      <label>Display name<input name="displayName" defaultValue={account?.displayName ?? ""} placeholder="Google Veo" required /></label>
      <label>Capability<input name="capabilityKey" defaultValue={account?.capabilityKey ?? "variable_cost"} required /></label>
      <label>Ownership
        <select name="ownershipMode" defaultValue={account?.ownershipMode ?? "ferocity_managed"}>
          <option value="ferocity_managed">Ferocity managed</option>
          <option value="customer_owned">Customer owned</option>
        </select>
      </label>
      <label>Account status
        <select name="configuredStatus" defaultValue={account?.configuredStatus ?? "needs_sync"}>
          {["setup_required", "needs_sync", "active", "low_balance", "critical", "depleted", "payment_issue", "paused"].map((value) => <option value={value} key={value}>{label(value)}</option>)}
        </select>
      </label>
      <label>Balance source
        <select name="balanceTrackingMode" defaultValue={account?.balanceTrackingMode ?? "manual"}>
          <option value="provider_api">Provider API</option>
          <option value="provider_webhook">Provider webhook</option>
          <option value="manual">Manual verified snapshot</option>
          <option value="inferred">Inferred from tracked usage</option>
        </select>
      </label>
      <div className="grid">
        <label className="span-6">Current balance ($)<input name="currentBalance" type="number" min="0" step="0.01" defaultValue={account?.health.balanceCents === null || account?.health.balanceCents === undefined ? "" : account.health.balanceCents / 100} /></label>
        <label className="span-6">Promotional balance ($)<input name="promotionalBalance" type="number" min="0" step="0.01" defaultValue={account ? account.health.promotionalBalanceCents / 100 : ""} /></label>
        <label className="span-6">Promotion expires<input name="promotionalExpiresAt" type="date" defaultValue={account?.health.promotionalExpiresAt?.slice(0, 10) ?? ""} /></label>
      </div>
      <label className="checkbox-row"><input name="reloadEnabled" type="checkbox" value="true" defaultChecked={account?.reloadEnabled ?? false} /><span>Provider auto-reload is enabled</span></label>
      <div className="grid">
        <label className="span-6">Reload trigger ($)<input name="reloadTrigger" type="number" min="0" step="0.01" defaultValue={account?.reloadTriggerBalanceCents === null || account?.reloadTriggerBalanceCents === undefined ? "" : account.reloadTriggerBalanceCents / 100} /></label>
        <label className="span-6">Reload amount ($)<input name="reloadAmount" type="number" min="0.01" step="0.01" defaultValue={account?.reloadAmountCents === null || account?.reloadAmountCents === undefined ? "" : account.reloadAmountCents / 100} /></label>
        <label className="span-6">Monthly reload limit ($)<input name="monthlyReloadLimit" type="number" min="0.01" step="0.01" defaultValue={account?.monthlyReloadLimitCents === null || account?.monthlyReloadLimitCents === undefined ? "" : account.monthlyReloadLimitCents / 100} /></label>
        <label className="span-6">Ferocity monthly spend cap ($)<input name="monthlyProviderSpendCap" type="number" min="0.01" step="0.01" defaultValue={account?.monthlyProviderSpendCapCents === null || account?.monthlyProviderSpendCapCents === undefined ? "" : account.monthlyProviderSpendCapCents / 100} /></label>
        <label className="span-6">Low-balance warning ($)<input name="lowBalanceThreshold" type="number" min="0" step="0.01" defaultValue={account?.lowBalanceThresholdCents === null || account?.lowBalanceThresholdCents === undefined ? "" : account.lowBalanceThresholdCents / 100} /></label>
        <label className="span-6">Critical warning ($)<input name="criticalBalanceThreshold" type="number" min="0" step="0.01" defaultValue={account?.criticalBalanceThresholdCents === null || account?.criticalBalanceThresholdCents === undefined ? "" : account.criticalBalanceThresholdCents / 100} /></label>
      </div>
      <label>Payment status
        <select name="paymentStatus" defaultValue={account?.paymentStatus ?? "unknown"}>
          {["unknown", "current", "action_required", "failed", "expired"].map((value) => <option value={value} key={value}>{label(value)}</option>)}
        </select>
      </label>
      <label>Balance sync status
        <select name="syncStatus" defaultValue={account?.syncStatus ?? "never"}>
          {["never", "current", "stale", "failed", "unsupported"].map((value) => <option value={value} key={value}>{label(value)}</option>)}
        </select>
      </label>
      <label>Notes<textarea name="notes" maxLength={1500} defaultValue={account?.notes ?? ""} /></label>
      <button className="button" type="submit">{account ? "Save funding snapshot" : "Add provider account"}</button>
    </form>
  );
}

function Metric({ icon, label: text, value }: { icon?: React.ReactNode; label: string; value: string | number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{icon} {text}</span>
      <strong>{value}</strong>
    </section>
  );
}
