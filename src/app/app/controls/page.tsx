import Link from "next/link";
import { Gauge, PauseCircle, ShieldCheck, ToggleLeft } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceControls } from "@/lib/controls/get-service-controls";
import { updateServiceControlAction } from "./actions";

function usageText(limit: number | null, used: number, remaining: number | null) {
  if (limit === null) return `${used.toLocaleString()} used / no set limit`;
  return `${used.toLocaleString()} used / ${remaining?.toLocaleString()} left`;
}

function modeLabel(mode: string) {
  if (mode === "off") return "off";
  if (mode === "draft_only") return "draft only";
  if (mode === "review_required") return "needs review";
  return "enabled";
}

export default async function ControlsPage() {
  const dashboard = await getServiceControls();

  return (
    <QueuePageShell
      eyebrow="Controls"
      title="Service Controls And Limits"
      description="Choose what Ferocity can do, what stays draft-only, and where monthly limits stop paid provider usage."
    >
      <div className="grid section-actions">
        <Metric icon={<ToggleLeft size={18} />} label="Enabled" value={dashboard.summary.enabled} />
        <Metric icon={<ShieldCheck size={18} />} label="Needs review" value={dashboard.summary.reviewRequired} />
        <Metric icon={<PauseCircle size={18} />} label="Draft only" value={dashboard.summary.draftOnly} />
        <Metric icon={<Gauge size={18} />} label="Near limits" value={dashboard.summary.warnings} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Plain Rules</h2>
            <p className="muted">
              Off blocks the service. Draft only lets Ferocity prepare work. Needs review queues the action. Enabled still respects keys, provider setup, consent, and live-action policies.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/billing">Billing</Link>
            <Link className="mini-button" href="/app/integrations">Integrations</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Services</h2>
        <ul className="list">
          {dashboard.controls.map((control) => (
            <li className="list-row service-control-row" key={control.featureKey}>
              <form action={updateServiceControlAction} className="form-stack service-control-form">
                <input name="featureKey" type="hidden" value={control.featureKey} />
                <div className="list-row flush-row">
                  <div>
                    <h3>{control.label}</h3>
                    <p className="muted">
                      {control.category} / {control.featureKey} / {control.usagePeriod}
                    </p>
                    <p>{control.plainRule}</p>
                  </div>
                  <div className="inline-actions">
                    <span className={`pill ${control.mode === "off" ? "high" : control.mode === "review_required" ? "medium" : ""}`}>
                      {modeLabel(control.mode)}
                    </span>
                    {control.costed ? <span className="pill medium">costed</span> : null}
                    {control.publicFacing ? <span className="pill high">public</span> : null}
                  </div>
                </div>

                <div className="three-col">
                  <label>
                    Mode
                    <select name="mode" defaultValue={control.mode}>
                      <option value="off">off</option>
                      <option value="draft_only">draft only</option>
                      <option value="review_required">needs review</option>
                      <option value="enabled">enabled</option>
                    </select>
                  </label>
                  <label>
                    Monthly limit
                    <input name="usageLimit" type="number" min="0" step="1" defaultValue={control.usageLimit ?? ""} placeholder="No limit" />
                  </label>
                  <label>
                    After limit
                    <select name="overagePolicy" defaultValue={control.overagePolicy}>
                      <option value="block">block</option>
                      <option value="allow_with_review">allow with review</option>
                      <option value="allow">allow</option>
                    </select>
                  </label>
                </div>

                <div className="list-row flush-row">
                  <span className="muted">{usageText(control.usageLimit, control.currentUsage, control.remaining)}</span>
                  <button className="mini-button" type="submit">Save control</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{icon} {label}</span>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}
