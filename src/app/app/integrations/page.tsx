import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getIntegrationRows } from "@/lib/integrations/get-integrations";
import { updateIntegrationReadinessAction } from "./actions";

function ownerLabel(value: string) {
  return value === "ferocity_managed" ? "Ferocity managed" : "Customer owned";
}

export default async function IntegrationsPage() {
  const rows = await getIntegrationRows();
  const managed = rows.filter((row) => row.ownershipMode === "ferocity_managed");
  const customerOwned = rows.filter((row) => row.ownershipMode !== "ferocity_managed");
  const connected = rows.filter((row) => row.status === "connected" || row.accountStatus === "connected").length;
  const missingKeys = rows.filter((row) => row.missingEnvVars.length > 0).length;
  const liveActions = rows.filter((row) => row.liveActionsEnabled).length;

  return (
    <QueuePageShell
      eyebrow="Connect Tools"
      title="Connect The Outside Tools"
      description="Ferocity should route work to proven providers, not rebuild them. Use managed defaults when useful, then switch to customer-owned accounts when keys, permissions, and approval rules are ready."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Provider Readiness</h2>
            <p className="muted">Connect the tools in steps. Keys and OAuth can be added later; live actions stay off until reviewed.</p>
          </div>
          <a className="button" href="/app/build-system">
            Build My System
          </a>
        </div>
        <div className="grid section-actions">
          <section className="panel span-4 metric">
            <span className="muted">Connected</span>
            <strong>{connected}</strong>
          </section>
          <section className="panel span-4 metric">
            <span className="muted">Need keys</span>
            <strong>{missingKeys}</strong>
          </section>
          <section className="panel span-4 metric">
            <span className="muted">Live actions on</span>
            <strong>{liveActions}</strong>
          </section>
        </div>
      </section>

      <section className="panel span-12 section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <ShieldCheck size={18} /> Managed Defaults
            </h2>
            <p className="muted">Useful for early setup. These still flow through review, consent, and the Action Queue.</p>
          </div>
          <span className="pill">{managed.length} routes</span>
        </div>
        <div className="grid">
          {managed.map((row) => (
            <ProviderCard row={row} key={row.id} />
          ))}
        </div>
      </section>

      <section className="panel span-12 section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <KeyRound size={18} /> Bring Your Own Tools
            </h2>
            <p className="muted">Customer-owned accounts for billing, SMS, email, calendars, analytics, publishing, ads, and reviews.</p>
          </div>
          <span className="pill">{customerOwned.length} tools</span>
        </div>
        <div className="grid">
          {customerOwned.map((row) => (
            <ProviderCard row={row} key={row.id} />
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}

function ProviderCard({ row }: { row: Awaited<ReturnType<typeof getIntegrationRows>>[number] }) {
  const canMarkReady = row.missingEnvVars.length === 0;
  const activeRoutes = row.routeActions.length > 0 ? row.routeActions.join(", ") : "Not the default route";
  const fallbackRoutes = row.fallbackForActions.length > 0 ? row.fallbackForActions.join(", ") : "No fallback routes";

  return (
    <section className="span-4">
      <div className="list-row flush-row">
        <div>
          <h3>{row.displayName}</h3>
          <p className="muted">{row.provider}</p>
        </div>
        <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span>
      </div>
      <p>{row.notes}</p>
      <ul className="list section-actions">
        <li className="list-row">
          <strong>Owner</strong>
          <span className="pill">{ownerLabel(row.ownershipMode)}</span>
        </li>
        <li className="list-row">
          <strong>Status</strong>
          <span className="pill">{row.accountStatus ?? row.status}</span>
        </li>
        <li className="list-row">
          <strong>Keys</strong>
          <span className="pill">{row.envVars.length === 0 ? "No tenant key needed" : row.credentialsStatus}</span>
        </li>
        <li className="list-row">
          <strong>Default for</strong>
          <span className="muted">{activeRoutes}</span>
        </li>
        <li className="list-row">
          <strong>Fallback for</strong>
          <span className="muted">{fallbackRoutes}</span>
        </li>
      </ul>
      <div className="form-stack section-actions">
        <p className="muted">Setup steps</p>
        <ul className="list">
          {row.setupItems.map((item) => (
            <li className="list-row" key={item}>
              <ArrowRight size={14} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="muted">Missing keys: {row.missingEnvVars.length > 0 ? row.missingEnvVars.join(", ") : "None"}</p>
        <p className="muted">Callback: {row.callbackPath ?? "None"}</p>
        <form action={updateIntegrationReadinessAction} className="inline-actions">
          <input name="connectionId" type="hidden" value={row.id} />
          <input name="liveActionsEnabled" type="hidden" value="false" />
          <button className="mini-button" name="status" type="submit" value="planned">
            Plan
          </button>
          <button className="mini-button" name="status" type="submit" value="paused">
            Pause
          </button>
          <button className="mini-button" name="status" type="submit" value="connected" disabled={!canMarkReady}>
            Mark ready
          </button>
          <span className="muted">{row.liveActionsEnabled ? "Live actions on" : "Live actions off"}</span>
        </form>
      </div>
    </section>
  );
}
