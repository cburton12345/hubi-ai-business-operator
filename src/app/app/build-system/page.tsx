import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, ExternalLink, Wand2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { revertSetupRunAction } from "./actions";
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
            'review_request_workflows'
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
  const { logs, latestAppliedId, assets, readiness, integrations } = await getBuildSystemData();
  const nextActions = buildNextActions(readiness, integrations, latestAppliedId);
  const readinessItems = buildReadinessItems(readiness, integrations);

  return (
    <QueuePageShell
      eyebrow="Build My System"
      title="Tell Ferocity What To Set Up"
      description="A guided setup layer for normal business owners. Preview the plan first, then apply only reviewed changes."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Wand2 size={18} /> Setup Operator
            </h2>
            <p className="muted">
              Use this when settings, workflows, automations, SEO, reviews, ads, or integrations feel like too much. Power users can still open every setting directly.
            </p>
          </div>
          <span className="pill">no token spend</span>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Start Here</h2>
            <p className="muted">The simple path from empty workspace to a working Ferocity system.</p>
          </div>
          <span className="pill">guided setup</span>
        </div>
        <div className="setup-step-grid">
          {[
            ["1", "Add your business", "Name, services, areas, contact info, and brand basics."],
            ["2", "Choose what Ferocity handles", "Leads, follow-up, SEO, reviews, automations, service ops, or all of it."],
            ["3", "Connect lead sources", "Website forms, calls, MarketplacePro, email, ads, and manual leads."],
            ["4", "Set follow-up rules", "When leads, estimates, invoices, callbacks, and reviews need attention."],
            ["5", "Review automations", "Approve drafts, reminders, send rules, provider access, and limits."],
            ["6", "Go live when ready", "Turn on connected providers only after keys, consent, and plan limits are set."]
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
        <h2>Status Words Ferocity Uses</h2>
        <p className="muted">These labels should make it clear what is usable, limited, blocked, or waiting for approval.</p>
        <div className="status-grid compact-status-grid">
          {[
            ["Included", "Usable now inside Ferocity."],
            ["Limited", "Usable, but usage is capped."],
            ["Needs setup", "Business details or rules are missing."],
            ["Needs provider key", "Requires Twilio, Resend, Stripe, calendar, or another account."],
            ["Needs approval", "Ferocity can prepare it, but a human must approve live action."],
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
            <p className="muted">After Ferocity applies a setup plan, these are the normal owner-friendly next steps.</p>
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
            <p className="muted">The latest applied setup run created or updated these draft assets. They are editable and auditable.</p>
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
              <span className="muted">No applied setup assets yet. Preview and apply a setup plan to create draft services, forms, templates, workflows, pages, and tracking sources.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Go Live Readiness</h2>
            <p className="muted">Ferocity can organize work before going live. These checks show what still blocks live sending, publishing, and sync.</p>
          </div>
            <Link className="mini-button" href="/app/integrations">
              Integrations
            </Link>
            <Link className="mini-button" href="/app/go-live">
              Full scan
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
        <p className="muted">Plans applied by the setup operator. Revert restores the saved setup snapshot for statuses and controls.</p>
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
      body: "Confirm public business name, phone, email, and main service area before forms or pages go live.",
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
      body: "Verify sender/domain rules before any live email sending.",
      href: "/app/integrations",
      button: "Connect",
      done: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
    },
    {
      title: "Connect SMS provider",
      body: "Only turn on SMS after number setup, consent rules, and approval mode are ready.",
      href: "/app/integrations",
      button: "Connect",
      done: isConnected(integration(integrations, "twilio")) || isConnected(integration(integrations, "twilio_shared"))
    },
    {
      title: "Set plan limits and approval rules",
      body: "Protect AI, email, SMS, publishing, and provider sync from surprise usage or spend.",
      href: "/app/controls",
      button: "Limits",
      done: Boolean(readiness && num(readiness.manual_marketing_settings) > 0 && latestAppliedId)
    },
    {
      title: "Review public publishing rules",
      body: "Confirm SEO pages, GBP posts, review responses, and ad changes stay draft-first until approved.",
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
      body: readiness && num(readiness.brands_missing_contact) === 0 ? "Business profile has core contact details." : "Business contact details still need review.",
      ready: Boolean(readiness && num(readiness.brands) > 0 && num(readiness.brands_missing_contact) === 0)
    },
    {
      title: "Lead capture",
      body: readiness && num(readiness.forms) > 0 ? `${readiness.forms} active form(s) available.` : "Add or review a lead form.",
      ready: Boolean(readiness && num(readiness.forms) > 0)
    },
    {
      title: "Follow-up workflows",
      body: readiness && num(readiness.followups) > 0 ? `${readiness.followups} follow-up workflow(s) open.` : "Create or approve follow-up rules.",
      ready: Boolean(readiness && num(readiness.followups) > 0)
    },
    {
      title: "Review requests",
      body: readiness && num(readiness.review_workflows) > 0 ? "Review workflow is drafted." : "Review request timing still needs setup.",
      ready: Boolean(readiness && num(readiness.review_workflows) > 0)
    },
    {
      title: "Email ready",
      body: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared")) ? "Email route is configured." : "Email sending needs sender/domain/provider setup.",
      ready: isConnected(integration(integrations, "email_provider")) || isConnected(integration(integrations, "resend_shared"))
    },
    {
      title: "SMS ready",
      body: isConnected(integration(integrations, "twilio")) || isConnected(integration(integrations, "twilio_shared")) ? "SMS route is configured." : "SMS needs Twilio or shared SMS rules plus consent.",
      ready: isConnected(integration(integrations, "twilio")) || isConnected(integration(integrations, "twilio_shared"))
    },
    {
      title: "Publishing rules",
      body: readiness && num(readiness.manual_marketing_settings) > 0 ? "Manual approval mode is set." : "Set publishing and review approval rules.",
      ready: Boolean(readiness && num(readiness.manual_marketing_settings) > 0)
    },
    {
      title: "Provider sync",
      body: isConnected(integration(integrations, "marketplacepro")) ? "MarketplacePro is connected." : "MarketplacePro and other syncs are optional and paused until connected.",
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
    review_request_workflows: "/app/review"
  };
  return map[table] ?? "/app/build-system";
}
