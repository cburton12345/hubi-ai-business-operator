import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck, Unplug } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getIntegrationRows } from "@/lib/integrations/get-integrations";
import { getProviderIntegrationRequests } from "@/lib/integrations/get-provider-requests";
import {
  getProviderCapabilityReadiness,
  providerLaneStatusLabel,
  providerLaneTone,
  type ProviderLane
} from "@/lib/integrations/provider-lane-readiness";
import { requestProviderIntegrationAction, updateIntegrationReadinessAction } from "./actions";
import { connectorExecutionLabel } from "@/lib/integrations/connector-runtime";

function ownerLabel(value: string) {
  return value === "ferocity_managed" ? "Ferocity managed" : "Customer owned";
}

function plainConnectionStatus(value: string | null | undefined) {
  if (!value) return "Not started";
  if (value === "configured" || value === "connected" || value === "ready") return "Ready";
  if (value === "missing" || value === "needs_setup" || value === "not_configured") return "Needs setup";
  return value.replaceAll("_", " ");
}

function setupNotice(params: { setup?: string; provider?: string; missing?: string }) {
  if (!params.setup) return null;
  if (params.setup === "missing_credentials") {
    return {
      title: "This connection needs one more setup step",
      body: `${params.provider ?? "This connection"} is listed in Ferocity, but the account connection is not ready yet.`
    };
  }
  if (params.setup === "unsupported") {
    return {
      title: "This connection is not available yet",
      body: `${params.provider ?? "That connection"} can still be tracked manually for now.`
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
  const [rows, capabilityLanes, providerRequests] = await Promise.all([
    getIntegrationRows(),
    getProviderCapabilityReadiness(),
    getProviderIntegrationRequests()
  ]);
  const managed = rows.filter((row) => row.ownershipMode === "ferocity_managed");
  const customerOwned = rows.filter((row) => row.ownershipMode !== "ferocity_managed");
  const connected = rows.filter((row) => row.status === "connected" || row.accountStatus === "connected").length;
  const missingKeys = rows.filter((row) => row.missingEnvVars.length > 0).length;
  const liveActions = rows.filter((row) => row.liveActionsEnabled).length;

  return (
    <QueuePageShell
      eyebrow="Connect Tools"
      title="Optional Outside Connections"
      description="Ferocity works without every outside account. Connect only the tools a business already uses or specifically wants synchronized."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Connection Readiness</h2>
            <p className="muted">These are optional capability upgrades, not a launch checklist. Ferocity&apos;s native operations remain available without them.</p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/build-system">
              Let Ferocity Set This Up
            </Link>
            <Link className="button secondary-button" href="/app/marketing-os">
              Marketing
            </Link>
            <Link className="button secondary-button" href="/docs/provider-account-setup">
              Provider Setup Packet
            </Link>
            <Link className="button secondary-button" href="/docs/ad-credit-promotion-tracker">
              Ad Credit Checklist
            </Link>
          </div>
        </div>
        <div className="grid section-actions">
          <section className="panel span-4 metric">
            <span className="muted">Connected</span>
            <strong>{connected}</strong>
          </section>
          <section className="panel span-4 metric">
            <span className="muted">Optional connections</span>
            <strong>{missingKeys}</strong>
          </section>
          <section className="panel span-4 metric">
            <span className="muted">Important actions on</span>
            <strong>{liveActions}</strong>
          </section>
        </div>
      </section>

      <section className="panel section-actions" id="request-provider">
        <div className="list-row flush-row">
          <div>
            <h2>Need A Different Provider?</h2>
            <p className="muted">
              Ferocity supports tested connections and practical native fallbacks. Advanced customers can request another provider without adding complexity to normal setup.
            </p>
          </div>
          <span className="pill">BYO provider</span>
        </div>
        <details className="panel subtle-panel section-actions">
          <summary>Advanced: request another provider</summary>
          <form action={requestProviderIntegrationAction} className="form-stack section-actions">
            <div className="three-col">
              <label>
                Provider name
                <input name="providerName" placeholder="Provider or service name" required />
              </label>
              <label>
                Category
                <select name="capabilityCategory" defaultValue="other">
                  <option value="ai_text">AI text / reasoning</option>
                  <option value="sms">SMS</option>
                  <option value="voice">Phone / voice AI</option>
                  <option value="video">AI video</option>
                  <option value="image">AI images</option>
                  <option value="email">Email</option>
                  <option value="storage">Storage</option>
                  <option value="payments">Payments</option>
                  <option value="accounting">Accounting</option>
                  <option value="calendar">Calendar</option>
                  <option value="advertising">Advertising</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Provider website
                <input name="providerUrl" type="url" placeholder="https://provider.example" />
              </label>
            </div>
            <label>
              How should Ferocity use your provider?
              <textarea name="useCase" placeholder="Example: use our existing number for the AI receptionist and preserve call recordings in Ferocity." required />
            </label>
            <label className="checkbox-row">
              <input name="currentlyUsing" type="checkbox" value="true" />
              <span>We already use and pay for this provider.</span>
            </label>
            <button className="button" type="submit">Request a BYO connection</button>
          </form>
        </details>
        {providerRequests.length ? (
          <ul className="list">
            {providerRequests.map((request) => (
              <li className="list-row" key={request.id}>
                <div>
                  <strong>{request.providerName}</strong>
                  <p className="muted">
                    {request.category.replaceAll("_", " ")}
                    {request.currentlyUsing ? " / already in use" : ""}
                    {request.requestCount > 1 ? ` / requested ${request.requestCount} times` : ""}
                  </p>
                </div>
                <span className="pill medium">{request.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        ) : null}
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
              Open credential setup
            </Link>
          </div>
        </section>
      ) : null}

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Customer Account Setup</h2>
              <p className="muted">
              Ferocity can help a business connect the accounts it already uses or walk through creating the right ones. The business stays in control
              of billing, ad spend, and public posts.
            </p>
          </div>
          <Link className="button" href="/app/build-system">
            Setup My Accounts
          </Link>
        </div>
        <div className="grid">
          <section className="span-3">
            <h3>1. Connect</h3>
              <p className="muted">Owner signs in to supported providers. Other services keep a native/manual fallback until their tested adapter is available.</p>
          </section>
          <section className="span-3">
            <h3>2. Read First</h3>
            <p className="muted">Ferocity reads what it is allowed to read: leads, reviews, spend, traffic, and reports.</p>
          </section>
          <section className="span-3">
            <h3>3. Draft Work</h3>
            <p className="muted">AI prepares campaigns, posts, SEO updates, replies, follow-ups, and recommendations for review.</p>
          </section>
          <section className="span-3">
            <h3>4. Approve</h3>
            <p className="muted">Messages, public posts, billing, and ad budget changes wait for approval.</p>
          </section>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Best Connection Path</h2>
            <p className="muted">
              Most owners should click Connect Account, sign in on the provider page, approve access, and return to Ferocity.
              Manual keys are for advanced accounts or providers that do not support a clean sign-in flow yet.
            </p>
          </div>
          <Link className="button secondary-button" href="/app/credentials">
            Advanced keys
          </Link>
        </div>
      </section>

      <section className="panel span-12 section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Connected Accounts</h2>
            <p className="muted">
              Each capability shows two lanes: the business&apos;s own connected account and Ferocity&apos;s managed option. These are tracked separately so
              one being connected never pretends the other one is ready.
            </p>
          </div>
          <span className="pill">{capabilityLanes.length} capabilities</span>
        </div>
        <div className="grid">
          {capabilityLanes.map((capability) => (
            <section className="span-6" key={capability.capabilityKey}>
              <div className="list-row flush-row">
                <div>
                  <h3>{capability.label}</h3>
                  <p className="muted">{capability.description}</p>
                </div>
              </div>
              <div className="two-col">
                <ProviderLaneCard lane={capability.customerOwned} title="Customer account" />
                <ProviderLaneCard lane={capability.ferocityManaged} title="Ferocity managed" />
              </div>
            </section>
          ))}
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
          <span className="pill">{managed.length} options</span>
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
              <KeyRound size={18} /> Connect Your Own Tools
            </h2>
            <p className="muted">Customer-owned accounts for billing, email, calendars, analytics, publishing, ads, reviews, and customer communication.</p>
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

function ProviderLaneCard({ lane, title }: { lane: ProviderLane; title: string }) {
  return (
    <div className="status-card">
      <div className="list-row flush-row">
        <div>
          <strong>{title}</strong>
          <p className="muted">{lane.displayName}</p>
        </div>
        <span className={`pill ${providerLaneTone(lane)}`}>{providerLaneStatusLabel(lane)}</span>
      </div>
      <p className="muted">{lane.plainLanguageStatus}</p>
      <ul className="list section-actions">
        <li className="list-row">
          <strong>Provider</strong>
          <span className="muted">{lane.providerKey}</span>
        </li>
        <li className="list-row">
          <strong>Credentials</strong>
          <span className="pill">{plainConnectionStatus(lane.credentialsStatus)}</span>
        </li>
        <li className="list-row">
          <strong>Live actions</strong>
          <span className={`pill ${lane.liveActionsEnabled ? "high" : ""}`}>{lane.liveActionsEnabled ? "on" : "off"}</span>
        </li>
      </ul>
    </div>
  );
}

function ProviderCard({ row }: { row: Awaited<ReturnType<typeof getIntegrationRows>>[number] }) {
  const canMarkReady = row.missingEnvVars.length === 0 && row.executionMode !== "setup_only";
  const activeRoutes = row.routeActions.length > 0 ? row.routeActions.join(", ") : "Not used by default";
  const fallbackRoutes = row.fallbackForActions.length > 0 ? row.fallbackForActions.join(", ") : "No backup use";

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
          <strong>Working path</strong>
          <span className={`pill ${row.executionMode === "setup_only" ? "medium" : ""}`}>
            {connectorExecutionLabel(row.executionMode)}
          </span>
        </li>
        <li className="list-row">
          <strong>Owner</strong>
          <span className="pill">{ownerLabel(row.ownershipMode)}</span>
        </li>
        <li className="list-row">
          <strong>Status</strong>
          <span className="pill">{plainConnectionStatus(row.accountStatus ?? row.status)}</span>
        </li>
        <li className="list-row">
          <strong>Connection</strong>
          <span className="pill">{row.envVars.length === 0 ? "No extra setup needed" : plainConnectionStatus(row.credentialsStatus)}</span>
        </li>
        <li className="list-row">
          <strong>Setup</strong>
          <span className="pill">{plainConnectionStatus(row.setupMode)}</span>
        </li>
        <li className="list-row">
          <strong>Used for</strong>
          <span className="muted">{activeRoutes}</span>
        </li>
        <li className="list-row">
          <strong>Backup for</strong>
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
        <p className="muted">Missing connection steps: {row.missingEnvVars.length > 0 ? row.missingEnvVars.length : "None"}</p>
        <p className="muted">Can receive updates: {row.callbackPath ? "Yes" : "Not yet"}</p>
        <div className="button-row">
          {row.oauthStartPath && row.executionMode !== "setup_only" ? (
            <Link className="mini-button" href={row.oauthStartPath}>
              Connect Account
            </Link>
          ) : null}
          {row.executionMode === "setup_only" ? (
            <Link className="mini-button secondary-button" href="#request-provider">
              Request adapter
            </Link>
          ) : null}
          <Link className="mini-button secondary-button" href="/app/credentials">
            Finish setup
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
          {row.executionMode === "setup_only" ? <span className="muted">Connection can be planned, but not marked ready until its adapter is built.</span> : null}
        </form>
      </div>
    </section>
  );
}
