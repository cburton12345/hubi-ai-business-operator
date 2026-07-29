import Link from "next/link";
import { Bot, CheckCircle2, CircleAlert, CircleDashed, ExternalLink, SlidersHorizontal, Wand2 } from "lucide-react";
import { AiCommandPanel } from "@/app/app/ai-workforce/AiCommandPanel";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getSetupGuidance } from "@/lib/setup/setup-guidance";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { applyAutomaticWebsiteSetupAction, revertSetupRunAction } from "./actions";
import { SetupBuilder } from "./SetupBuilder";

type SetupLog = {
  id: string;
  request_text: string;
  template_key: string;
  status: string;
  plan_json: {
    businessType?: string;
    goal?: string;
    summary?: string;
    changes?: unknown[];
    serviceTargets?: unknown[];
    verticalTargets?: unknown[];
  } | null;
  created_at: Date;
};

type SetupAsset = {
  target_table: string;
  target_key: string;
  status: string;
  after_json: Record<string, unknown>;
};

type ReadinessStats = {
  brands: string;
  brands_missing_contact: string;
  services: string;
  areas: string;
  forms: string;
  templates: string;
  followups: string;
  review_workflows: string;
  pages: string;
  sources: string;
  manual_marketing_settings: string;
};

type IntegrationStatus = {
  provider: string;
  display_name: string;
  status: string;
  credentials_status: string;
};

async function getBuildSystemData() {
  const workspaceId = await getCurrentWorkspaceId();
  const [logsResult, latestAppliedResult, readinessResult, integrationsResult] = await Promise.all([
    queryPostgres<SetupLog>(
    `
    select id, request_text, template_key, status, plan_json, created_at
    from public.setup_operator_runs
    where tenant_id = $1
    order by created_at desc
    limit 12
    `,
    [workspaceId]
    ),
    queryPostgres<{ id: string }>(
      `
      select id
      from public.setup_operator_runs
      where tenant_id = $1 and status = 'applied'
      order by created_at desc
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<ReadinessStats>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status = 'active')::text as brands,
        (select count(*) from public.brands where tenant_id = $1 and status = 'active' and (phone is null or email is null or primary_location is null))::text as brands_missing_contact,
        (select count(*) from public.brand_services where tenant_id = $1 and active = true)::text as services,
        (select count(*) from public.brand_locations where tenant_id = $1 and active = true)::text as areas,
        (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
        (select count(*) from public.communication_templates where tenant_id = $1 and active = true)::text as templates,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled'))::text as followups,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status in ('draft','scheduled'))::text as review_workflows,
        (select count(*) from public.brand_landing_pages where tenant_id = $1 and status in ('planned','draft'))::text as pages,
        (select count(*) from public.growth_sources where tenant_id = $1 and status in ('active','paused'))::text as sources,
        (select count(*) from public.brand_marketing_settings where tenant_id = $1 and approval_mode = 'manual')::text as manual_marketing_settings
      `,
      [workspaceId]
    ),
    queryPostgres<IntegrationStatus>(
      `
      select provider, display_name, status, credentials_status
      from public.integration_connections
      where tenant_id = $1
        and provider in ('resend_shared','email_provider','twilio','twilio_shared','google_business_profile','marketplacepro','external_publishing')
      order by provider
      `,
      [workspaceId]
    )
  ]);

  const latestAppliedId = latestAppliedResult?.rows[0]?.id ?? null;
  const assetsResult = latestAppliedId
    ? await queryPostgres<SetupAsset>(
        `
        select target_table, target_key, status, after_json
        from public.setup_operator_run_changes
        where tenant_id = $1
          and run_id = $2
          and change_type = 'setup_asset'
          and target_table in (
            'brands',
            'brand_services',
            'brand_locations',
            'brand_marketing_settings',
            'forms',
            'communication_templates',
            'brand_landing_pages',
            'growth_sources',
            'follow_up_workflows',
            'review_request_workflows',
            'push_notification_preferences',
            'ai_agent_workflows'
          )
        order by created_at asc
        limit 50
        `,
        [workspaceId, latestAppliedId]
      )
    : null;

  return {
    logs: logsResult?.rows ?? [],
    latestAppliedId,
    assets: assetsResult?.rows ?? [],
    readiness: readinessResult?.rows[0] ?? null,
    integrations: integrationsResult?.rows ?? []
  };
}

export default async function BuildSystemPage() {
  const [{ logs, latestAppliedId, assets, readiness, integrations }, guidance] = await Promise.all([getBuildSystemData(), getSetupGuidance()]);
  const nextActions = buildNextActions(readiness, integrations, latestAppliedId);
  const readinessItems = buildReadinessItems(readiness, integrations);

  return (
    <QueuePageShell
      eyebrow="Start Here"
      title="Let Ferocity Help Set Up The Business"
      description="Tell Ferocity what the business needs. It will suggest the first useful steps and keep you in control."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">{guidance.aiUsed ? "AI setup coach" : "Setup coach"}</p>
            <h2>{guidance.headline}</h2>
            <p className="muted">{guidance.summary}</p>
            <p className="muted">{guidance.websiteAuditNote}</p>
          </div>
          <span className="pill">{guidance.aiUsed ? "Ferocity AI assisted" : "Standard setup"}</span>
        </div>
        {guidance.missing.length ? (
          <div className="inline-actions section-actions">
            {guidance.missing.map((item) => (
              <span className="pill high" key={item}>{item}</span>
            ))}
          </div>
        ) : null}
        <ul className="list">
          {guidance.nextActions.map((item) => (
            <li className="list-row" key={item.title}>
              <div>
                <div className="inline-actions">
                  <span className={`pill ${item.priority === "critical" || item.priority === "high" ? "high" : item.priority === "normal" ? "medium" : ""}`}>
                    {item.priority}
                  </span>
                  <span className="pill">recommended next</span>
                </div>
                <h3>{item.title}</h3>
                <p className="muted">{item.why}</p>
                <p>{item.doNext}</p>
              </div>
              <Link className="mini-button" href={item.href}>Open</Link>
            </li>
          ))}
        </ul>
      </section>

      <AiCommandPanel
        title="Tell Ferocity What To Set Up"
        description="Use this like a setup coach. Ferocity should tell you what will help first, what can wait, and what to do next."
        initialCommand="Tell me the fastest way Ferocity can help this business. Keep it simple and show the next best steps."
        submitLabel="Show my simple setup path"
      />

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Wand2 size={18} /> Auto-Build From The Website
            </h2>
            <p className="muted">
              Paste the business website. Ferocity reads the public site, pulls out services, service areas, contact details, and trust signals,
              then creates the first safe setup plan. Messages, ads, payment requests, and public publishing still wait for approval.
            </p>
          </div>
          <span className="pill">automatic setup</span>
        </div>
        <form action={applyAutomaticWebsiteSetupAction} className="stacked-form">
          <div className="grid">
            <label className="span-6">
              Business website
              <input name="websiteUrl" type="url" placeholder="https://example.com" required />
            </label>
            <label className="span-6">
              Main goal, optional
              <input
                name="businessGoal"
                placeholder="More booked jobs, faster follow-up, reviews, SEO, and owner alerts"
              />
            </label>
          </div>
          <div className="inline-actions">
            <button className="button" type="submit">Build my system from the website</button>
            <Link className="mini-button" href="/app/marketing-os">Open website imports</Link>
          </div>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Wand2 size={18} /> What Ferocity Can Set Up
            </h2>
            <p className="muted">
              Ferocity can help with leads, follow-up, jobs, invoices, reviews, website forms, SEO, marketing, reminders, workers, and reports.
              You can skip anything that does not matter yet.
            </p>
          </div>
          <span className="pill">preview first</span>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Choose How To Start</h2>
            <p className="muted">
              You do not have to set up everything on day one. Let Ferocity guide you, or add the basics yourself.
            </p>
          </div>
          <span className="pill">skip anything</span>
        </div>
        <div className="path-grid">
          <Link className="path-card" href="/app/ai-workforce">
            <Bot size={18} />
            <strong>Let Ferocity guide me</strong>
            <span>Use plain English. Ferocity prepares the setup plan and shows it before anything changes.</span>
          </Link>
          <Link className="path-card" href="/app/setup">
            <SlidersHorizontal size={18} />
            <strong>I want to choose myself</strong>
            <span>Choose what Ferocity helps with now, what stays off, and what can wait.</span>
          </Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Start Here</h2>
            <p className="muted">The simple path from a new account to a working Ferocity system.</p>
          </div>
          <span className="pill">plain steps</span>
        </div>
        <div className="setup-step-grid">
          {[
            ["1", "Pick the outcome", "More leads, faster follow-up, jobs, invoices, reviews, SEO, workers, reminders, or all of it."],
            ["2", "Add only the basics", "Business name, services, service area, best contact, and the first lead path."],
            ["3", "Start with what works now", "Use reminders, forms, notes, drafts, and owner alerts right away."],
            ["4", "Leave the rest paused", "If something does not matter today, skip it. Ferocity can bring it back when it helps."],
            ["5", "Review important actions", "Approve customer messages, public posts, payment requests, and other sensitive work before they happen."],
            ["6", "Turn on more over time", "Add email, payments, ads, reviews, website publishing, and other connections when the business is ready."]
          ].map(([number, title, body]) => (
            <div className="setup-step-card" key={number}>
              <span className="step-dot">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>What The Status Means</h2>
        <p className="muted">Plain labels for what is ready, what needs attention, and what can wait.</p>
        <div className="status-grid compact-status-grid">
          {[
            ["Included", "Usable now inside Ferocity."],
            ["Limited", "Usable, but usage is capped."],
            ["Skip for now", "Not needed today. Ferocity can bring it back when it helps."],
            ["Paused", "Set up, but not running."],
            ["Needs business info", "Ferocity needs a little more detail before this works well."],
            ["Needs connection", "This works better after an email, payment, calendar, website, ad, or review account is connected."],
            ["Needs approval", "Ferocity prepared it, but someone should review it first."],
            ["Higher plan", "Requires a larger tier or custom limit."]
          ].map(([label, body]) => (
            <div className="status-card" key={label}>
              <div>
                <h3>{label}</h3>
                <p className="muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SetupBuilder />

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Next Actions</h2>
            <p className="muted">After Ferocity creates the setup plan, these are the next useful steps.</p>
          </div>
          <span className="pill">{nextActions.filter((item) => !item.done).length} open</span>
        </div>
        <ul className="list">
          {nextActions.map((item) => (
            <li className="list-row" key={item.title}>
              <div className="inline-title">
                {item.done ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.body}</p>
                </div>
              </div>
              <Link className="mini-button" href={item.href}>
                {item.button}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Created Or Prepared By Ferocity</h2>
            <p className="muted">The latest setup created or prepared these items. You can edit them before using them.</p>
          </div>
          <span className="pill">{assets.length} items</span>
        </div>
        <ul className="list">
          {assets.map((asset) => (
            <li className="list-row" key={`${asset.target_table}-${asset.target_key}`}>
              <div>
                <h3>{assetLabel(asset)}</h3>
                <p className="muted">
                  {asset.target_table.replaceAll("_", " ")} / {assetStatus(asset)}
                </p>
              </div>
              <Link className="mini-button" href={assetHref(asset.target_table)}>
                Open <ExternalLink size={13} />
              </Link>
            </li>
          ))}
          {assets.length === 0 ? (
            <li className="list-row">
              <span className="muted">Nothing has been created yet. Start a setup plan to prepare services, forms, messages, follow-up, pages, and tracking.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Ready To Use</h2>
            <p className="muted">Ferocity can organize work right away. These checks show what still needs attention before sending messages, collecting payments, or posting publicly.</p>
          </div>
            <Link className="mini-button" href="/app/integrations">
              Integrations
            </Link>
            <Link className="mini-button" href="/app/go-live">
              Check everything
            </Link>
          </div>
        <div className="status-grid compact-status-grid">
          {readinessItems.map((item) => (
            <div className="status-card" key={item.title}>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">{item.body}</p>
              </div>
              {item.ready ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Setup Change Log</h2>
        <p className="muted">A record of setup plans Ferocity created or changed.</p>
        <ul className="list">
          {logs.map((log) => (
            <li className="list-row" key={log.id}>
              <div>
                <h3>{log.plan_json?.goal ?? "Setup plan"}</h3>
                <p className="muted">
                  {log.plan_json?.businessType ?? log.template_key} / {log.status} /{" "}
                  {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(log.created_at)}
                </p>
                <p>{log.plan_json?.summary ?? log.request_text}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{Array.isArray(log.plan_json?.changes) ? log.plan_json.changes.length : 0} changes</span>
                {log.status === "applied" ? (
                  <form action={revertSetupRunAction}>
                    <input name="runId" type="hidden" value={log.id} />
                    <button className="mini-button danger-button" type="submit">
                      Revert
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {logs.length === 0 ? (
            <li className="list-row">
              <span className="muted">No setup plans have been applied yet.</span>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function num(value: string | undefined) {
  return Number(value ?? 0);
}

function integration(integrations: IntegrationStatus[], provider: string) {
  return integrations.find((item) => item.provider === provider);
}

function isConnected(item: IntegrationStatus | undefined) {
  return item?.status === "connected" || item?.credentials_status === "configured";
}

function buildNextActions(readiness: ReadinessStats | null, integrations: IntegrationStatus[], latestAppliedId: string | null) {
  return [
    {
      title: "Fill in business name and contact info",
      body: "Confirm the business name, phone, email, and main service area before using public forms or pages.",
      href: "/app/setup",
      button: "Edit basics",
      done: Boolean(readiness && num(readiness.brands) > 0 && num(readiness.brands_missing_contact) === 0)
    },
    {
      title: "Add service areas",
      body: "Choose the towns or neighborhoods Ferocity should prioritize for SEO, ads, and lead routing.",
      href: "/app/brands",
      button: "Edit areas",
      done: Boolean(readiness && num(readiness.areas) > 0)
    },
    {
      title: "Review follow-up templates",
      body: "Make sure lead replies, estimate reminders, invoice nudges, and review requests sound like the business.",
      href: "/app/operator",
      button: "Review",
      done: Boolean(readiness && num(readiness.templates) > 0)
    },
    {
      title: "Connect email provider",
      body: "Add the email account Ferocity should use when the business is ready to send email.",
      href: "/app/integrations",
      button: "Connect",
      done: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
    },
    {
      title: "Set spending and approval rules",
      body: "Decide what Ferocity can do on its own and what still needs a person to review it.",
      href: "/app/controls",
      button: "Limits",
      done: Boolean(readiness && num(readiness.manual_marketing_settings) > 0 && latestAppliedId)
    },
    {
      title: "Review public publishing rules",
      body: "Confirm pages, Google posts, review responses, and ad changes wait for approval.",
      href: "/app/controls",
      button: "Rules",
      done: Boolean(readiness && num(readiness.pages) > 0 && num(readiness.manual_marketing_settings) > 0)
    }
  ];
}

function buildReadinessItems(readiness: ReadinessStats | null, integrations: IntegrationStatus[]) {
  return [
    {
      title: "Business basics",
      body: readiness && num(readiness.brands_missing_contact) === 0 ? "Business contact details are filled in." : "Business contact details still need review.",
      ready: Boolean(readiness && num(readiness.brands) > 0 && num(readiness.brands_missing_contact) === 0)
    },
    {
      title: "Lead capture",
      body: readiness && num(readiness.forms) > 0 ? `${readiness.forms} active form(s) available.` : "Add or review a lead form.",
      ready: Boolean(readiness && num(readiness.forms) > 0)
    },
    {
      title: "Follow-up workflows",
      body: readiness && num(readiness.followups) > 0 ? `${readiness.followups} follow-up plan(s) started.` : "Create or approve follow-up reminders.",
      ready: Boolean(readiness && num(readiness.followups) > 0)
    },
    {
      title: "Review requests",
      body: readiness && num(readiness.review_workflows) > 0 ? "Review requests are prepared." : "Choose when Ferocity should ask for reviews.",
      ready: Boolean(readiness && num(readiness.review_workflows) > 0)
    },
    {
      title: "Email ready",
      body: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared")) ? "Email is ready." : "Email needs a sending account before Ferocity can send messages.",
      ready: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
    },
    {
      title: "Alerts and email ready",
      body: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
        ? "Ferocity can use app alerts, dashboard queues, and email. SMS can stay optional."
        : "Email still needs setup. App alerts and dashboard queues can still guide the owner.",
      ready: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
    },
    {
      title: "Publishing rules",
      body: readiness && num(readiness.manual_marketing_settings) > 0 ? "Public posts and pages require approval." : "Choose who approves public posts, pages, and review replies.",
      ready: Boolean(readiness && num(readiness.manual_marketing_settings) > 0)
    },
    {
      title: "MarketplacePro",
      body: isConnected(integration(integrations, "marketplacepro")) ? "MarketplacePro is connected." : "MarketplacePro is optional and can be connected when the business wants marketplace leads.",
      ready: isConnected(integration(integrations, "marketplacepro"))
    }
  ];
}

function assetLabel(asset: SetupAsset) {
  const value = asset.after_json;
  return String(value.name ?? value.title ?? value.source_name ?? value.workflow_type ?? value.service_area_name ?? value.approval_mode ?? asset.target_key);
}

function assetStatus(asset: SetupAsset) {
  const value = asset.after_json;
  const raw = String(value.status ?? value.approval_mode ?? (value.requires_approval ? "needs approval" : "prepared"));
  if (raw === "manual") return "manual approval";
  if (raw === "open") return "open task";
  return raw.replaceAll("_", " ");
}

function assetHref(table: string) {
  const map: Record<string, string> = {
    brands: "/app/setup",
    brand_services: "/app/brands",
    brand_locations: "/app/brands",
    brand_marketing_settings: "/app/controls",
    forms: "/app/forms",
    communication_templates: "/app/operator",
    brand_landing_pages: "/app/sites",
    growth_sources: "/app/growth",
    follow_up_workflows: "/app/operator",
    review_request_workflows: "/app/review",
    push_notification_preferences: "/app/notifications",
    ai_agent_workflows: "/app/ai-workforce"
  };
  return map[table] ?? "/app/build-system";
}
