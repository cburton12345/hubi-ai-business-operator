import Link from "next/link";
import { approveUsageChargeAction, voidUsageChargeAction } from "./actions";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { checkLeadIntakeLimits } from "@/lib/billing/plan-limits";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function percentLabel(bps: number) {
  if (bps <= 0) return "0%";
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function feeLabel(policy: { feeType: string; percentageBps: number; flatFeeCents: number }) {
  if (policy.feeType === "pass_through") return "Pass-through / no Ferocity markup";
  if (policy.feeType === "flat") return `$${(policy.flatFeeCents / 100).toFixed(0)}`;
  if (policy.feeType === "custom") return "Custom";
  return percentLabel(policy.percentageBps);
}

function capLabel(cents: number | null) {
  if (cents === null) return null;
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo cap`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function storage(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function providerLabel(providerKey: string) {
  const labels: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta/Facebook",
    tiktok_ads: "TikTok",
    reddit_ads: "Reddit",
    microsoft_ads: "Microsoft Ads"
  };
  return labels[providerKey] ?? providerKey.replaceAll("_", " ");
}

export default async function BillingPage() {
  const [billing, workspaceId] = await Promise.all([getBillingOverview(), getCurrentWorkspaceId()]);
  const leadLimits = await checkLeadIntakeLimits(workspaceId);
  const currentPlan = billing.subscription?.planKey ?? leadLimits.planKey ?? "free";
  const leadUsage =
    leadLimits.monthlyLeadLimit === null
      ? `${leadLimits.monthlyLeadsUsed.toLocaleString()} this month`
      : `${leadLimits.monthlyLeadsUsed.toLocaleString()} / ${leadLimits.monthlyLeadLimit.toLocaleString()}`;
  const formUsage =
    leadLimits.formsLimit === null
      ? `${leadLimits.activeForms.toLocaleString()} active`
      : `${leadLimits.activeForms.toLocaleString()} / ${leadLimits.formsLimit.toLocaleString()}`;

  return (
    <QueuePageShell
      eyebrow="Billing"
      title="Plan, Limits, And Upgrade Path"
      description="See what is included, what needs connection, what costs extra, and what changes when the business upgrades."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Current Plan</h2>
            <p className="muted">
              The workspace keeps its data when it upgrades. Email, app alerts, Stripe payment links, publishing, and provider sync stay governed by
              connected accounts and review rules.
            </p>
          </div>
          <div className="inline-actions">
            <span className="pill">{currentPlan}</span>
            <span className={`pill ${leadLimits.ok ? "" : "high"}`}>{leadLimits.ok ? "accepting leads" : "limit reached"}</span>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Leads this month" value={leadUsage} />
          <Metric label="Active forms" value={formUsage} />
          <Metric label="Seats" value={billing.subscription?.seats ?? 1} />
        </div>
        <div className="inline-actions">
          <Link className="button" href="/pricing">View public plans</Link>
          <Link className="button secondary-button" href="/start?source=billing_upgrade">Request upgrade help</Link>
          <Link className="button secondary-button" href="/app/ai-usage">AI usage</Link>
          <Link className="mini-button" href="/app/controls">Control limits</Link>
        </div>
        <details className="panel subtle-panel">
          <summary>Connect online invoice payments</summary>
          <p className="muted">
            This starts Stripe Connect onboarding. When finished, online invoice payments can route to the business account while Ferocity records
            payment state, platform fees if used, ledger entries, and follow-up.
          </p>
          <form action="/api/integrations/stripe-connect/onboard" method="post">
            <button className="mini-button" type="submit">Connect payment payouts</button>
          </form>
        </details>
        <details className="panel subtle-panel">
          <summary>Subscription account tools</summary>
          <p className="muted">
            Stripe handles card updates, invoices, plan changes, and cancellation. This keeps payment security outside Ferocity.
          </p>
          {billing.subscription?.hasStripeCustomer ? (
            <form action="/api/billing/portal" method="post">
              <button className="mini-button" type="submit">
                Open Stripe billing portal
              </button>
            </form>
          ) : (
            <p className="muted">No Stripe customer is attached to this workspace yet. Start checkout before portal tools appear.</p>
          )}
        </details>
      </section>

      <div className="grid section-actions">
        <Metric label="Brands" value={billing.usage.brands} />
        <Metric label="Users" value={billing.usage.users} />
        <Metric label="Leads this month" value={billing.usage.leadsThisMonth} />
        <Metric label="Active forms" value={billing.usage.activeForms} />
        <Metric label="AI runs this month" value={billing.usage.aiRunsThisMonth} />
        <Metric label="SEO drafts this month" value={billing.usage.seoDraftsThisMonth} />
        <Metric label="Publishing queue" value={billing.usage.publishingQueueItems} />
        <Metric label="Review requests" value={billing.usage.reviewRequestsThisMonth} />
        <Metric label="Worker requests" value={billing.usage.laborRequestsThisMonth} />
        <Metric label="Worker intake" value={billing.usage.workerIntakeThisMonth} />
        <Metric label="Labor matches" value={billing.usage.laborMatchesThisMonth} />
      </div>

      <section className="panel section-actions">
        <h2>Billing Readiness</h2>
        <p className="muted">This tells the operator why a paid or live action is allowed, blocked, or waiting on keys.</p>
        <ul className="list">
          {billing.readiness.map((item) => (
            <li className="list-row" key={item.label}>
              <div>
                <h3>{item.label}</h3>
                <p className="muted">{item.detail}</p>
              </div>
              <span className={`pill ${item.status === "blocked" ? "high" : item.status === "needs_setup" ? "medium" : ""}`}>{item.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Payment Collection Modes</h2>
            <p className="muted">
              Ferocity can track payments now and prepare Stripe payment links when configured. Stripe Connect managed payments and platform fees are
              a provider-gated path, not an enabled live payout system yet.
            </p>
          </div>
          <Link className="mini-button" href="/app/cash-collection">Open money board</Link>
        </div>
        <div className="grid">
          {[
            ["Manual payment tracking", "available", "Record payments made by cash, check, Zelle, outside Stripe, or other methods. No processing fee applies because Ferocity is only tracking the record."],
            ["Customer-owned Stripe", "configured by keys", "The business connects Stripe for online payment links. Stripe fees apply. Ferocity tracks invoice requests, payments, ledger entries, and follow-up."],
            ["Ferocity Managed Payments", "provider-gated", "Stripe Connect path with a Ferocity platform fee plus provider fees. Processor, refund, dispute, chargeback, bank-return, and instant-payout fees must be shown clearly before this is enabled."]
          ].map(([title, status, detail]) => (
            <section className="panel span-4" key={title}>
              <span className="pill">{status}</span>
              <h3>{title}</h3>
              <p className="muted">{detail}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Managed Services And Money Movement</h2>
            <p className="muted">
              Ferocity can use shared provider accounts for some managed services, but customer money is different. Do not offer Ferocity-held
              payments until Stripe Connect onboarding, fee disclosure, payout tracking, refund handling, dispute handling, and bank-return handling
              are live.
            </p>
          </div>
          <span className="pill high">not a live payout system</span>
        </div>
        <div className="grid">
          {[
            [
              "Managed SEO and marketing",
              "possible with controls",
              "Ferocity can prepare work using its own AI/search/email infrastructure, then bill for service, usage, or management. Publishing, ad spend, and customer sends still need approval and limits."
            ],
            [
              "Customer-owned payments",
              "preferred live path",
              "The business connects its own Stripe account or records manual payments. Ferocity can prepare payment links, track invoices, update ledgers, and show follow-up."
            ],
            [
              "Ferocity collects then pays out",
              "requires Stripe Connect",
              "This needs connected accounts, destination charges or transfers, application fees, payout status, refund/dispute/chargeback rules, bank-return rules, and reconciliation before launch."
            ]
          ].map(([title, status, detail]) => (
            <section className="panel span-4" key={title}>
              <span className={`pill ${status === "requires Stripe Connect" ? "high" : status === "possible with controls" ? "medium" : ""}`}>{status}</span>
              <h3>{title}</h3>
              <p className="muted">{detail}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Managed Ad Spend Controls</h2>
            <p className="muted">
              Customer-owned ad accounts are the default. If a business asks Ferocity to run ads through Ferocity-managed accounts, spend stays
              blocked until prepaid budget, customer approval, daily caps, monthly caps, and provider readiness are all recorded.
            </p>
          </div>
          <Link className="mini-button" href="/app/integrations">Open connections</Link>
        </div>
        <div className="grid section-actions">
          {billing.managedAdBudgets.map((budget) => (
            <section className="panel span-4" key={budget.id}>
              <div className="list-row flush-row">
                <div>
                  <span className="eyebrow">{providerLabel(budget.providerKey)}</span>
                  <h3>Ferocity-managed ads</h3>
                </div>
                <span className={`pill ${budget.readinessStatus === "allowed" ? "" : "medium"}`}>
                  {budget.readinessStatus.replaceAll("_", " ")}
                </span>
              </div>
              <p className="muted">{budget.readinessReason}</p>
              <ul className="list section-actions">
                <li className="list-row"><strong>Available prepaid budget</strong><span className="pill">{money(budget.availableCents)}</span></li>
                <li className="list-row"><strong>Daily cap</strong><span className="pill">{budget.dailyCapCents > 0 ? money(budget.dailyCapCents) : "not set"}</span></li>
                <li className="list-row"><strong>Monthly cap</strong><span className="pill">{budget.monthlyCapCents > 0 ? money(budget.monthlyCapCents) : "not set"}</span></li>
                <li className="list-row"><strong>Customer approval</strong><span className={`pill ${budget.approvedByCustomer ? "" : "medium"}`}>{budget.approvedByCustomer ? "yes" : "needed"}</span></li>
                <li className="list-row"><strong>Live spend</strong><span className={`pill ${budget.liveSpendEnabled ? "high" : ""}`}>{budget.liveSpendEnabled ? "on" : "off"}</span></li>
                <li className="list-row"><strong>Management fee</strong><span className="pill">{percentLabel(budget.managementFeeBps)}</span></li>
              </ul>
            </section>
          ))}
          {billing.managedAdBudgets.length === 0 ? (
            <section className="panel span-12">
              <p className="muted">Managed advertising is not ready yet. Finish its budget and safety setup before offering it.</p>
            </section>
          ) : null}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Rebilling And Markup Rules</h2>
            <p className="muted">
              Cheap plans can stay cheap because some optional or performance-tied work has a transparent fee. Higher plans reduce or remove
              required tracked-growth percentages so customers are not punished for upgrading.
            </p>
          </div>
          <span className="pill medium">disclose before live use</span>
        </div>
        <div className="grid section-actions">
          {billing.rebillingPolicies.map((policy) => (
            <section className="panel span-4" key={`${policy.planKey ?? "default"}-${policy.feeKey}`}>
              <div className="list-row flush-row">
                <div>
                  <span className="eyebrow">{policy.planKey?.replaceAll("_", " ") ?? "default"}</span>
                  <h3>{policy.feeLabel}</h3>
                </div>
                <span className={`pill ${policy.status === "planned" ? "medium" : policy.required ? "high" : ""}`}>
                  {feeLabel(policy)}
                </span>
              </div>
              <p className="muted">{policy.appliesWhen}</p>
              <p className="muted">{policy.disclosure}</p>
              <div className="inline-actions">
                <span className="pill">{policy.status}</span>
                <span className="pill">{policy.required ? "required on plan" : policy.included ? "included" : "optional"}</span>
                {capLabel(policy.monthlyCapCents) ? <span className="pill">{capLabel(policy.monthlyCapCents)}</span> : null}
              </div>
            </section>
          ))}
          {billing.rebillingPolicies.length === 0 ? (
            <section className="panel span-12">
              <p className="muted">Customer usage pricing has not been configured. Finish billing setup before launch.</p>
            </section>
          ) : null}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Usage Charges For Next Invoice</h2>
            <p className="muted">
              Pay-as-you-go fees should not force customers through checkout over and over. Approved charges are queued to the next Stripe
              subscription invoice. Pending charges stay in review until an owner/admin approves them.
            </p>
          </div>
          <form action="/api/billing/usage/sync" method="post">
            <button className="mini-button" type="submit">Sync approved charges</button>
          </form>
        </div>
        <div className="grid section-actions">
          <Metric label="Pending review" value={money(billing.usageCharges.pendingReviewCents)} />
          <Metric label="Approved to sync" value={money(billing.usageCharges.approvedCents)} />
          <Metric label="Queued in Stripe" value={money(billing.usageCharges.queuedCents)} />
          <Metric label="Storage used" value={`${storage(billing.storage.usedBytes)} / ${storage(billing.storage.maxBytes)}`} />
        </div>
        <ul className="list">
          {billing.usageCharges.recent.map((charge) => (
            <li className="list-row" key={charge.id}>
              <div>
                <h3>{charge.description}</h3>
                <p className="muted">
                  {charge.feeFamily.replaceAll("_", " ")} / {charge.chargeKey} / {charge.stripeInvoiceItemId ? `Stripe item ${charge.stripeInvoiceItemId}` : "not synced"}
                </p>
                {charge.lastError ? <p className="muted">{charge.lastError}</p> : null}
              </div>
              <div className="inline-actions">
                <span className="pill">{money(charge.amountCents)}</span>
                <span className={`pill ${charge.status === "failed" ? "high" : charge.status === "pending_review" ? "medium" : ""}`}>{charge.status.replaceAll("_", " ")}</span>
                {charge.status === "pending_review" ? (
                  <form action={approveUsageChargeAction}>
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <button className="mini-button" type="submit">Approve</button>
                  </form>
                ) : null}
                {["pending_review", "approved", "failed"].includes(charge.status) ? (
                  <form action={voidUsageChargeAction}>
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <button className="mini-button secondary-button" type="submit">Void</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {billing.usageCharges.recent.length === 0 ? (
            <li className="list-row">
              <span className="muted">No usage, tracked-growth, managed-payment, or managed-service charges have been recorded yet.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Feature Gates</h2>
            <p className="muted">Usage and limits are visible now so paid tiers can be enforced cleanly.</p>
          </div>
          <Link className="mini-button" href="/app/controls">Open controls</Link>
        </div>
        <ul className="list">
          {billing.featureGates.map((gate) => (
            <li className="list-row" key={gate.featureKey}>
              <div>
                <h3>{gate.label}</h3>
                <p className="muted">{gate.featureKey} / {gate.usagePeriod ?? "monthly"} / used {gate.currentUsage.toLocaleString()}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{gate.status}</span>
                <span className="pill">{gate.usageLimit === null ? "unlimited" : `${gate.remaining?.toLocaleString()} left`}</span>
              </div>
            </li>
          ))}
          {billing.featureGates.length === 0 ? <li className="list-row"><span className="muted">No feature gates configured yet.</span></li> : null}
        </ul>
      </section>

      <div className="grid">
        {billing.plans.map((plan) => (
          <section className="panel span-4" key={plan.id}>
            <h2>{plan.name}</h2>
            <p className="metric"><strong>{dollars(plan.monthlyPriceCents)}</strong></p>
            <ul className="list">
              <li className="list-row"><strong>Brands</strong><span className="pill">{plan.includedBrands}</span></li>
              <li className="list-row"><strong>Everyday AI assistance</strong><span className="pill">Included</span></li>
            </ul>
            <form action="/api/billing/checkout" method="post">
              <input name="plan" type="hidden" value={plan.planKey} />
              <input name="source" type="hidden" value="app_billing" />
              <button className="mini-button" disabled={plan.planKey === currentPlan} type="submit">
                {plan.planKey === currentPlan ? "Current plan" : "Choose plan"}
              </button>
            </form>
          </section>
        ))}
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}
