import Link from "next/link";
import { ArrowRight, CalendarDays, KeyRound, MapPin, ShieldCheck, Unplug } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { getAdapterBuildsForTenant } from "@/lib/integrations/adapter-factory";
import { connectorExecutionLabel } from "@/lib/integrations/connector-runtime";
import {
  getProviderCapabilityTruth,
  providerApprovalIsBlocked,
  providerTruthLabel
} from "@/lib/integrations/capability-truth";
import { getIntegrationRows } from "@/lib/integrations/get-integrations";
import { getProviderIntegrationRequests } from "@/lib/integrations/get-provider-requests";
import {
  getProviderCapabilityReadiness,
  providerLaneStatusLabel,
  providerLaneTone,
  type ProviderLane
} from "@/lib/integrations/provider-lane-readiness";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { queryPostgres } from "@/lib/db/postgres";
import { onboardingOAuthStartPath } from "@/lib/onboarding/oauth-return";
import {
  disconnectCustomerIntegrationAction,
  releaseAdapterBuildAction,
  requestProviderIntegrationAction,
  reviewAdapterBuildAction,
  selectProviderAccountAction,
  updateProviderCertificationAction,
  updateIntegrationReadinessAction
} from "./actions";

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
  if (params.setup === "connected") {
    return {
      title: "Connection verified",
      body: "Ferocity can now read and monitor this account for business context. Sending, publishing, spending, provider writes, and moving money are still off until separately authorized."
    };
  }
  if (params.setup === "missing_credentials") {
    return {
      title: "This connection needs one more setup step",
      body: `${params.provider ?? "This connection"} is listed in Ferocity, but the account connection is not ready yet.`
    };
  }
  if (params.setup === "scope_reconnect_required") {
    const missing = (params.missing ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);
    return {
      title: "Reconnect and approve the required read access",
      body: missing.length
        ? `${params.provider ?? "This connection"} did not grant ${missing.join(", ")}. Ferocity will not treat the account as ready until that read access is approved.`
        : `${params.provider ?? "This connection"} did not return enough permission evidence. Reconnect it so Ferocity can verify the required read access.`,
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
  searchParams: Promise<{ setup?: string; provider?: string; missing?: string; onboarding?: string; focus?: string }>;
}) {
  const params = await searchParams;
  const notice = setupNotice(params);
  const actor = await getCurrentActor();
  const tenantId = await getCurrentWorkspaceId();
  const [rows, capabilityLanes, providerRequests, adapterBuilds, authorityResult] = await Promise.all([
    getIntegrationRows(),
    getProviderCapabilityReadiness(),
    getProviderIntegrationRequests(),
    getAdapterBuildsForTenant(tenantId),
    queryPostgres<{ provider_key: string; read_allowed: boolean; monitor_allowed: boolean; protected_actions_off: boolean }>(`
      select provider_key,
        bool_or(capability='read' and decision in ('granted_once','granted_until_revoked')) as read_allowed,
        bool_or(capability='monitor' and decision in ('granted_once','granted_until_revoked')) as monitor_allowed,
        bool_and(case when capability in ('write','communicate','publish','spend','move_money') then decision in ('denied','revoked') else true end) as protected_actions_off
      from public.integration_authority_grants where tenant_id=$1 group by provider_key order by provider_key`, [tenantId])
  ]);
  const managed = rows.filter((row) => row.ownershipMode === "ferocity_managed");
  const customerOwned = rows.filter((row) => row.ownershipMode !== "ferocity_managed");
  const connected = rows.filter((row) => row.status === "connected" || row.accountStatus === "connected").length;
  const missingKeys = rows.filter((row) => row.missingEnvVars.length > 0).length;
  const liveActions = rows.filter((row) => row.liveActionsEnabled).length;
  const onboardingFocusProviders: Record<string, string[]> = {
    mailbox: ["gmail_mailbox", "microsoft_mailbox"],
    "service-platform": ["jobber", "housecall_pro", "servicetitan", "hubspot"],
    phone: ["retell", "twilio", "ferocity_connect", "voice_ai"],
  };
  const onboardingFocus = params.onboarding === "1" && params.focus
    ? onboardingFocusProviders[params.focus] ?? []
    : [];
  const focusedConnections = onboardingFocus.length
    ? customerOwned.filter((row) => onboardingFocus.includes(row.provider))
    : [];

  if (params.onboarding === "1" && params.focus) {
    return (
      <QueuePageShell
        eyebrow="Guided setup"
        title="Connect one useful source"
        description="Choose an account the business already uses. Ferocity starts read-only, discovers useful context, and returns you to the setup conversation."
      >
        <section className="panel section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>{params.focus === "mailbox" ? "Customer inbox" : params.focus === "phone" ? "Calls and texts" : "Customers and jobs"}</h2>
              <p className="muted">Connecting is optional. It does not authorize Ferocity to send, publish, spend, change provider records, or move money.</p>
            </div>
            <Link className="button secondary-button" href="/app/ferocity?onboarding=1">Back to guided setup</Link>
          </div>
        </section>

        {notice ? (
          <section className="panel section-actions">
            <h2>{notice.title}</h2>
            <p className="muted">{notice.body}</p>
          </section>
        ) : null}

        {focusedConnections.length ? (
          <section className="panel section-actions">
            <div className="grid">
              {focusedConnections.map((row) => (
                <ProviderCard row={row} isPlatformAdmin={actor.platformRole === "super_admin"} onboardingMode key={row.id} />
              ))}
            </div>
          </section>
        ) : (
          <section className="panel section-actions">
            <h2>No direct connection is available for this category yet.</h2>
            <p className="muted">Ferocity can still begin with a customer, job, document, or task you provide in the conversation.</p>
          </section>
        )}

        <section className="panel section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>Prefer not to connect an outside account?</h2>
              <p className="muted">Give Ferocity one real business item instead. Outside connections can be added or revoked later.</p>
            </div>
            <Link
              className="button"
              href={`/app/ferocity?onboarding=1&command=${encodeURIComponent("Continue setup without connecting an outside account. Help me add one real customer, job, task, or document so Ferocity can produce the first useful result.")}`}
            >
              Continue without a connection
            </Link>
          </div>
        </section>
      </QueuePageShell>
    );
  }

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
            <Link className="button" href="/app/ferocity?onboarding=1">
              Let Ferocity Set This Up
            </Link>
            <Link className="button secondary-button" href="/app/marketing-os">
              Marketing
            </Link>
            <Link className="button secondary-button" href="/app/integrations/calendar">
              <CalendarDays size={16} /> Calendars
            </Link>
            <Link className="button secondary-button" href="/app/email-watch">
              Email Watch
            </Link>
            <Link className="button secondary-button" href="/app/integrations/business-profile">
              <MapPin size={16} /> Google Business Profile
            </Link>
            <Link className="button secondary-button" href="/app/integrations/reporting">
              Search and analytics
            </Link>
            <Link className="button secondary-button" href="/app/integrations/service-platforms">
              <ArrowRight size={16} /> Existing service platform
            </Link>
            <Link className="button secondary-button" href="/app/integrations/ferocity-connect">
              <ArrowRight size={16} /> Android SMS gateway
            </Link>
            {actor.tenantRole === "owner" || actor.tenantRole === "admin" ? (
              <Link className="button secondary-button" href="/app/integrations/external-ai">
                <KeyRound size={16} /> Optional: connect your AI
              </Link>
            ) : null}
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
                Official OpenAPI JSON
                <input name="providerUrl" type="url" placeholder="https://provider.example/openapi.json" />
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
            <p className="muted">
              Use a direct official OpenAPI 3 JSON address when available. Do not paste an API key or password. Ferocity creates a locked draft—not live provider access.
            </p>
            <button className="button" type="submit">Ask Ferocity to enable it</button>
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
        {adapterBuilds.length ? (
          <details className="panel subtle-panel section-actions">
            <summary>Adapter Factory progress ({adapterBuilds.length})</summary>
            <p className="muted">
              Drafts are data-only and cannot run, publish themselves, receive credentials, or turn on provider write actions. Production availability requires engineering validation.
            </p>
            <ul className="list">
              {adapterBuilds.map((build) => {
                const passedChecks = build.checks.filter((check) => check.passed).length;
                return (
                  <li className="list-row" key={build.id}>
                    <div>
                      <strong>{build.providerName}</strong>
                      <p className="muted">
                        {build.category.replaceAll("_", " ")} / {build.riskLevel} review / {passedChecks} of {build.checks.length} safety checks passed
                      </p>
                      {build.lastError ? <p className="muted">{build.lastError}</p> : null}
                      {build.status === "approved_for_engineering" ? (
                        <p className="muted">Approved as a draft. Engineering implementation, provider testing, and a recorded release are still required.</p>
                      ) : null}
                      {build.status === "released" ? (
                        <p className="muted">Engineering validation and the guarded release gate are complete.</p>
                      ) : null}
                      {build.status === "approved_for_engineering" && actor.platformRole === "super_admin" ? (
                        <form action={releaseAdapterBuildAction} className="form-stack section-actions">
                          <input name="buildId" type="hidden" value={build.id} />
                          <div className="two-col">
                            <label>
                              Release version
                              <input name="releaseVersion" placeholder="2026.07.29" required />
                            </label>
                            <label>
                              Deployed commit
                              <input name="deploymentCommitSha" placeholder="Git commit SHA" required />
                            </label>
                          </div>
                          <button className="button" type="submit">Record tested release</button>
                        </form>
                      ) : null}
                      {build.checks.length ? (
                        <details>
                          <summary>View safety checks</summary>
                          <ul className="list">
                            {build.checks.map((check) => (
                              <li className="list-row" key={check.key}>
                                <span>{check.detail}</span>
                                <span className={`pill ${check.passed ? "low" : check.severity === "blocking" ? "high" : "medium"}`}>
                                  {check.passed ? "Passed" : check.severity === "blocking" ? "Blocked" : "Review"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {build.status === "approval_required" ? (
                        <form action={reviewAdapterBuildAction} className="form-stack section-actions">
                          <input name="buildId" type="hidden" value={build.id} />
                          <label>
                            Review note
                            <input name="notes" placeholder="Optional note for engineering" />
                          </label>
                          <div className="inline-actions">
                            <button className="button" name="decision" type="submit" value="approved_for_engineering">
                              Send to engineering
                            </button>
                            <button className="button secondary-button" name="decision" type="submit" value="changes_requested">
                              Request changes
                            </button>
                            <button className="button secondary-button" name="decision" type="submit" value="rejected">
                              Close request
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                    <span className="pill medium">{build.status.replaceAll("_", " ")}</span>
                  </li>
                );
              })}
            </ul>
          </details>
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

      {(authorityResult?.rows.length ?? 0) > 0 ? (
        <section className="panel section-actions">
          <div>
            <h2><ShieldCheck size={18} /> What Ferocity is allowed to do</h2>
            <p className="muted">These permissions are separate from provider login scopes. Connecting an account does not authorize consequential actions.</p>
          </div>
          <ul className="list">
            {authorityResult!.rows.map((grant) => (
              <li className="list-row" key={grant.provider_key}>
                <div>
                  <strong>{grant.provider_key.replaceAll("_", " ")}</strong>
                  <p className="muted">{grant.read_allowed ? "Read" : "No read access"}{grant.monitor_allowed ? " and monitor" : ""}</p>
                </div>
                <span className={`pill ${grant.protected_actions_off ? "low" : "medium"}`}>
                  {grant.protected_actions_off ? "Protected actions off" : "Custom authority"}
                </span>
              </li>
            ))}
          </ul>
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
          <Link className="button" href="/app/ferocity?onboarding=1">
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
            <ProviderCard row={row} isPlatformAdmin={actor.platformRole === "super_admin"} onboardingMode={params.onboarding === "1"} key={row.id} />
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
            <ProviderCard row={row} isPlatformAdmin={actor.platformRole === "super_admin"} onboardingMode={params.onboarding === "1"} key={row.id} />
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}

function ProviderLaneCard({ lane, title }: { lane: ProviderLane; title: string }) {
  return (
    <div className="status-card provider-lane-card">
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

function ProviderCard({ row, isPlatformAdmin, onboardingMode }: { row: Awaited<ReturnType<typeof getIntegrationRows>>[number]; isPlatformAdmin: boolean; onboardingMode: boolean }) {
  const providerTruth = getProviderCapabilityTruth(row.provider);
  const providerApprovalBlocked = providerApprovalIsBlocked(row.provider, row.certificationStatus);
  const canMarkReady = row.missingEnvVars.length === 0 && ["executable_adapter", "native_fallback"].includes(row.executionMode);
  const activeRoutes = row.routeActions.length > 0 ? row.routeActions.join(", ") : "Not used by default";
  const fallbackRoutes = row.fallbackForActions.length > 0 ? row.fallbackForActions.join(", ") : "No backup use";
  const platformReady = row.missingEnvVars.length === 0;
  const adAccounts = row.availableAccounts.filter((account) => account.kind === "ad_account");
  const pages = row.availableAccounts.filter((account) => account.kind === "page");

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
            {providerApprovalBlocked ? providerTruthLabel(providerTruth.state) : connectorExecutionLabel(row.executionMode)}
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
          <strong>Certification</strong>
          <span className={`pill ${row.certificationStatus === "certified_live" ? "low" : row.certificationStatus === "suspended" ? "high" : "medium"}`}>{row.certificationLabel}</span>
        </li>
        <li className="list-row">
          <strong>Connection</strong>
          <span className="pill">{row.platformManagedAuthorization && !platformReady ? "Ferocity setup pending" : row.envVars.length === 0 ? "No extra setup needed" : plainConnectionStatus(row.credentialsStatus)}</span>
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
        <p className="muted">Your connection steps</p>
        <ul className="list">
          {row.customerSetupItems.map((item) => (
            <li className="list-row" key={item}>
              <ArrowRight size={14} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="muted">{row.platformManagedAuthorization
          ? platformReady
            ? "Ferocity's secure provider connection is ready for account authorization."
            : "Ferocity is finishing its provider approval and secure connection. You will not be asked for developer credentials."
          : `Missing connection steps: ${row.missingEnvVars.length > 0 ? row.missingEnvVars.length : "None"}`}</p>
        <p className="muted">Can receive updates: {row.callbackPath ? "Yes" : "Not yet"}</p>
        {row.accountDiscoveryMessage ? <p className="muted">{row.accountDiscoveryMessage}</p> : null}
        {adAccounts.length > 0 ? (
          <form action={selectProviderAccountAction} className="form-stack subtle-panel">
            <input name="connectionId" type="hidden" value={row.id} />
            <input name="accountKind" type="hidden" value="ad_account" />
            <label htmlFor={`${row.id}-ad-account`}>Advertising account</label>
            <select id={`${row.id}-ad-account`} name="accountId" defaultValue={row.selectedAdAccountId ?? ""} required>
              <option disabled value="">Choose an account</option>
              {adAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.currency ? ` (${account.currency})` : ""}</option>)}
            </select>
            <button className="mini-button" type="submit">Use this ad account</button>
          </form>
        ) : null}
        {pages.length > 0 ? (
          <form action={selectProviderAccountAction} className="form-stack subtle-panel">
            <input name="connectionId" type="hidden" value={row.id} />
            <input name="accountKind" type="hidden" value="page" />
            <label htmlFor={`${row.id}-page`}>Facebook Page</label>
            <select id={`${row.id}-page`} name="accountId" defaultValue={row.selectedPageId ?? ""} required>
              <option disabled value="">Choose a Page</option>
              {pages.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <button className="mini-button" type="submit">Use this Page</button>
          </form>
        ) : null}
        <div className="button-row">
          {row.oauthStartPath && row.executionMode !== "setup_only" && platformReady ? (
            <Link className="mini-button" href={onboardingMode
              ? onboardingOAuthStartPath(row.oauthStartPath, { provider: row.provider })
              : row.oauthStartPath}>
              Connect Account
            </Link>
          ) : null}
          {row.platformManagedAuthorization && (providerApprovalBlocked || (row.executionMode !== "setup_only" && !platformReady)) ? (
            <button className="mini-button" type="button" disabled>
              Provider approval pending
            </button>
          ) : null}
          {row.executionMode === "setup_only" && !providerApprovalBlocked ? (
            <Link className="mini-button secondary-button" href="#request-provider">
              Request adapter
            </Link>
          ) : null}
          {!row.platformManagedAuthorization || isPlatformAdmin ? (
            <Link className="mini-button secondary-button" href="/app/credentials">
              {isPlatformAdmin && row.platformManagedAuthorization ? "Platform credentials" : "Finish setup"}
            </Link>
          ) : null}
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
          {row.executionMode === "setup_only" && !providerApprovalBlocked ? <span className="muted">Connection can be planned, but not marked ready until its adapter is built.</span> : null}
          {providerApprovalBlocked ? <span className="muted">The adapter is built. Customer sign-in will open after Ferocity receives the provider&apos;s production approval and credentials.</span> : null}
          {row.executionMode === "connection_only" && !providerApprovalBlocked ? <span className="muted">The account can be authorized now, but Ferocity will not claim reporting is live until account selection and data sync pass certification.</span> : null}
        </form>
        {row.ownershipMode !== "ferocity_managed" && (row.status === "connected" || row.accountStatus === "connected") ? (
          <details className="subtle-panel section-actions">
            <summary><Unplug size={14} /> Disconnect account</summary>
            <p className="muted">This immediately disables Ferocity access, clears its stored credential material, pauses routes using this provider, and blocks queued live actions. Some providers may continue showing Ferocity in their own authorized-apps page until you revoke the remote grant there too.</p>
            <form action={disconnectCustomerIntegrationAction}>
              <input name="connectionId" type="hidden" value={row.id} />
              <button className="mini-button danger-button" type="submit">Disconnect and revoke Ferocity access</button>
            </form>
          </details>
        ) : null}
        {row.certificationEvidence ? <p className="muted">Evidence: {row.certificationEvidence}</p> : null}
        {isPlatformAdmin ? (
          <details className="panel subtle-panel section-actions">
            <summary>Platform certification</summary>
            <p className="muted">Ferocity-side developer setup. Never ask a normal customer to complete these steps or provide these secrets.</p>
            <ul className="list">
              {row.platformSetupItems.map((item) => <li className="list-row" key={item}><ShieldCheck size={14} /><span>{item}</span></li>)}
            </ul>
            <form action={updateProviderCertificationAction} className="form-stack">
              <input name="connectionId" type="hidden" value={row.id} />
              <label>
                Certification state
                <select name="certificationStatus" defaultValue={row.certificationStatus}>
                  <option value="setup_required">Setup required</option>
                  <option value="awaiting_provider">Waiting for provider approval</option>
                  <option value="connected_unverified">Connected, testing required</option>
                  <option value="certified_limited">Certified with limits</option>
                  <option value="certified_live">Certified live</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <label>
                Evidence or reason
                <textarea name="evidenceNote" defaultValue={row.certificationEvidence ?? ""} placeholder="Provider approval, test evidence, limits, suspension reason, or next required step." required />
              </label>
              <label className="checkbox-row">
                <input name="liveActionsEnabled" type="checkbox" value="true" defaultChecked={row.liveActionsEnabled} />
                <span>Enable live actions only if the released adapter, credentials, and certification all pass.</span>
              </label>
              <button className="mini-button" type="submit">Save certification</button>
            </form>
          </details>
        ) : null}
      </div>
    </section>
  );
}
