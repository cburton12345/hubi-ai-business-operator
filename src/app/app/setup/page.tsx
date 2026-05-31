import Link from "next/link";
import { CheckCircle2, Circle, PlugZap, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperatorSetupDashboard } from "@/lib/setup/get-operator-setup";
import { updateSetupStepStatusAction, updateVerticalStatusAction } from "./actions";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function statusIcon(status: string) {
  return status === "done" || status === "active" ? <CheckCircle2 size={16} /> : <Circle size={16} />;
}

export default async function OperatorSetupPage() {
  const dashboard = await getOperatorSetupDashboard();
  const plans = Array.from(new Map(dashboard.planFeatures.map((feature) => [feature.planKey, feature])).values());

  return (
    <QueuePageShell
      eyebrow="Setup"
      title="Choose What Ferocity Should Run"
      description="Turn on the parts the business needs now. Keep advanced tools and live integrations off until the plan, keys, and approval rules are ready."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Not sure what to choose?</h2>
            <p className="muted">Describe the business and Ferocity will prepare a reviewed setup plan before changing anything.</p>
          </div>
          <Link className="button" href="/app/build-system">
            Build My System
          </Link>
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
                  <p className="muted">Starts on {vertical.minimumPlanKey}</p>
                </div>
                <span className="pill">{vertical.status}</span>
              </div>
              <div className="two-col">
                <label>
                  Use this
                  <select name="status" defaultValue={vertical.status}>
                    <option value="not_started">not_started</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="not_needed">not_needed</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue={vertical.priority}>
                    <option value="low">low</option>
                    <option value="normal">normal</option>
                    <option value="high">high</option>
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
                          {step.minimumPlanKey} / {step.automationLevel}
                          {step.requiresProvider ? ` / needs ${step.providerKey}` : ""}
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
                        <option value="not_started">not_started</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                        <option value="blocked">blocked</option>
                        <option value="skipped">skipped</option>
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
          <p className="muted">These are not live switches. They show what must be true before Ferocity sends, publishes, syncs, or charges.</p>
          <Link className="mini-button" href="/app/controls">
            Service controls
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
                  <strong>Missing keys</strong>
                  <span className="pill">{provider.missingEnvVars.length}</span>
                </li>
                <li className="list-row">
                  <strong>Callback</strong>
                  <span className="muted">{provider.callbackPath ?? "None"}</span>
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
        <p className="muted">Simple tiers for later packaging. Smaller businesses can start with the basics; larger operators can add scheduling, reviews, attribution, and integrations.</p>
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
