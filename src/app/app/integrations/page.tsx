import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck, Unplug } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getIntegrationRows } from "@/lib/integrations/get-integrations";
import { updateIntegrationReadinessAction } from "./actions";

function ownerLabel(value: string) {
  return value === "ferocity_managed" ? "Ferocity managed" : "Customer owned";
}

function setupNotice(params: { setup?: string; provider?: string; missing?: string }) {
  if (!params.setup) return null;
  if (params.setup === "missing_credentials") {
    return {
      title: "Provider app keys are not added yet",
      body: `${params.provider ?? "This provider"} is ready in Ferocity, but it needs ${params.missing ?? "provider credentials"} before the account connection screen can open.`
    };
  }
  if (params.setup === "unsupported") {
    return {
      title: "Provider is not wired for OAuth yet",
      body: `${params.provider ?? "That provider"} can still be tracked manually or by API key, but it does not have a Ferocity OAuth setup path yet.`
    };
  }
  return null;
}

export default async function IntegrationsPage({
  searchParams
}: {
  searchParams: Promise<{ setup?: string; provider?: string; missing?: string }>;
}) {
  const params = await searchParams;
  const notice = setupNotice(params);
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
          <div className="inline-actions">
            <Link className="button" href="/app/build-system">
              Have AI Set This Up
            </Link>
            <Link className="button secondary-button" href="/app/marketing-os">
              Marketing OS
            </Link>
          </div>
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

      {notice ? (
        <section className="panel section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>
                <Unplug size={18} /> {notice.title}
              </h2>
              <p className="muted">{notice.body}</p>
            </div>
            <Link className="button secondary-button" href="/app/credentials">
              Add Keys Later
            </Link>
          </div>
        </section>
      ) : null}

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Customer Account Setup</h2>
            <p className="muted">
              Ferocity can help a business connect existing accounts or walk them through creating accounts. Ownership, billing, ad spend, and
              public publishing stay with the business unless they explicitly approve managed service work.
            </p>
          </div>
          <Link className="button" href="/app/build-system">
            Setup My Accounts
          </Link>
        </div>
        <div className="grid">
          <section className="span-3">
            <h3>1. Connect</h3>
            <p className="muted">Owner signs in to Google, Meta, Reddit, Microsoft, reviews, email, SMS, calendar, or payments.</p>
          </section>
          <section className="span-3">
            <h3>2. Read First</h3>
            <p className="muted">Ferocity pulls account status, sources, spend, leads, reviews, and reporting where permissions allow.</p>
          </section>
          <section className="span-3">
            <h3>3. Draft Work</h3>
            <p className="muted">AI prepares campaigns, posts, SEO updates, replies, follow-ups, and recommendations for review.</p>
          </section>
          <section className="span-3">
            <h3>4. Approve</h3>
            <p className="muted">Live sends, publishing, syncing, billing, and ad budget changes stay gated by tier and approval rules.</p>
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
          <strong>Setup</strong>
          <span className="pill">{row.setupMode.replaceAll("_", " ")}</span>
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
        <p className="muted">Rule: {row.liveActionRule}</p>
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
        <div className="button-row">
          {row.oauthStartPath ? (
            <Link className="mini-button" href={row.oauthStartPath}>
              Connect Account
            </Link>
          ) : null}
          <Link className="mini-button secondary-button" href="/app/credentials">
            Add Keys
          </Link>
        </div>
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
