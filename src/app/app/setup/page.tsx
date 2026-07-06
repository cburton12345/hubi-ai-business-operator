import Link from "next/link";
import { Bot, CheckCircle2, Circle, PlugZap, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperatorSetupDashboard } from "@/lib/setup/get-operator-setup";
import { updateSetupStepStatusAction, updateVerticalStatusAction } from "./actions";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function statusIcon(status: string) {
  return status === "done" || status === "active" ? <CheckCircle2 size={16} /> : <Circle size={16} />;
}

function plainAutomationLevel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function OperatorSetupPage() {
  const dashboard = await getOperatorSetupDashboard();
  const plans = Array.from(new Map(dashboard.planFeatures.map((feature) => [feature.planKey, feature])).values());

  return (
    <QueuePageShell
      eyebrow="Setup"
      title="Choose What Ferocity Should Run"
      description="Turn on what helps now, leave off what does not, and add connections later when they are useful."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Only Use What Helps</h2>
            <p className="muted">
              Ferocity should explain the benefit first, then let the owner choose: use it, pause it, skip it, or set it up later.
              No one should have to understand technical setup to get value.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/build-system">
              <Bot size={16} /> Let Ferocity guide me
            </Link>
            <Link className="button secondary-button" href="/app/role-views">
              Choose a view
            </Link>
            <span className="pill">
              <SlidersHorizontal size={14} /> Direct controls below
            </span>
          </div>
        </div>
      </section>

      <div className="grid section-actions">
        {dashboard.verticals.map((vertical) => (
          <section className="panel span-6" key={vertical.key}>
            <form action={updateVerticalStatusAction} className="form-stack">
              <input name="verticalKey" type="hidden" value={vertical.key} />
              <div className="list-row flush-row">
                <div>
                  <h2>
                    {statusIcon(vertical.status)} {vertical.name}
                  </h2>
                  <p className="muted">{vertical.description}</p>
                  <p className="muted">Available on {vertical.minimumPlanKey}</p>
                </div>
                <span className="pill">{vertical.status}</span>
              </div>
              <div className="two-col">
                <label>
                  Use this
                  <select name="status" defaultValue={vertical.status}>
                    <option value="not_started">Not yet</option>
                    <option value="active">Use this</option>
                    <option value="paused">Pause it</option>
                    <option value="not_needed">Not needed</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue={vertical.priority}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <textarea name="notes" rows={2} placeholder="Plain note for this business" />
              <button className="mini-button" type="submit">
                Save module
              </button>
            </form>

            <ul className="list section-actions">
              {vertical.steps.map((step) => (
                <li className="list-row" key={step.id}>
                  <form action={updateSetupStepStatusAction} className="form-stack compact-form">
                    <input name="verticalKey" type="hidden" value={vertical.key} />
                    <input name="stepKey" type="hidden" value={step.stepKey} />
                    <div className="list-row flush-row">
                      <div>
                        <h3>
                          {statusIcon(step.status)} {step.label}
                        </h3>
                        <p className="muted">{step.goal}</p>
                        <p className="muted">
                          {step.minimumPlanKey} / {plainAutomationLevel(step.automationLevel)}
                          {step.requiresProvider ? " / needs a connection" : ""}
                        </p>
                      </div>
                      {step.href ? (
                        <Link className="mini-button" href={step.href}>
                          Open
                        </Link>
                      ) : null}
                    </div>
                    <div className="two-col">
                      <select name="status" defaultValue={step.status}>
                        <option value="not_started">Not yet</option>
                        <option value="in_progress">Working on it</option>
                        <option value="done">Done</option>
                        <option value="blocked">Needs help</option>
                        <option value="skipped">Skip it</option>
                      </select>
                      <button className="mini-button" type="submit">
                        Save step
                      </button>
                    </div>
                    <input name="notes" placeholder="Short note" />
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="panel span-12 section-actions">
        <h2>
          <PlugZap size={18} /> Tool Connections
        </h2>
        <div className="list-row flush-row">
          <p className="muted">These show which outside tools still need to be connected before Ferocity can send, post, collect, or import automatically.</p>
          <Link className="mini-button" href="/app/controls">
            Approval rules
          </Link>
        </div>
        <div className="grid">
          {dashboard.providers.map((provider) => (
            <section className="span-4" key={`${provider.providerKey}-${provider.label}`}>
              <h3>{provider.label}</h3>
              <p className="muted">{provider.goal}</p>
              <ul className="list">
                <li className="list-row">
                  <strong>Risk</strong>
                  <span className={`pill ${provider.riskLevel}`}>{provider.riskLevel}</span>
                </li>
                <li className="list-row">
                  <strong>Missing connection steps</strong>
                  <span className="pill">{provider.missingEnvVars.length}</span>
                </li>
                <li className="list-row">
                  <strong>Status</strong>
                  <span className="muted">{provider.callbackPath ? "Can receive updates after setup" : "Manual for now"}</span>
                </li>
              </ul>
              <p>{provider.liveActionRule}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="panel span-12 section-actions">
        <h2>
          <ShieldCheck size={18} /> Paid Tiers
        </h2>
        <p className="muted">Simple plans for later packaging. Smaller businesses can start with the basics; larger companies can add scheduling, reviews, source tracking, and more connections.</p>
        <div className="grid">
          {plans.map((plan) => (
            <section className="span-4" key={plan.planKey}>
              <h3>{plan.planName}</h3>
              <p className="metric">
                <strong>{dollars(plan.monthlyPriceCents)}</strong>
              </p>
              <ul className="list">
                {dashboard.planFeatures
                  .filter((feature) => feature.planKey === plan.planKey)
                  .map((feature) => (
                    <li className="list-row" key={feature.featureLabel}>
                      <span>{feature.featureLabel}</span>
                      <span className="muted">{feature.limitLabel}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}
