import Link from "next/link";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Megaphone,
  MessagesSquare,
  Phone,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wand2,
  Workflow
} from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getAgentWorkflowDashboard } from "@/lib/ai-workforce/agent-workflows";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { AiCommandPanel } from "./AiCommandPanel";
import { runAiAgentWorkflowAction, updateAiAgentWorkflowAction } from "./workflow-actions";

const employees = [
  {
    name: "AI Business Setup Manager",
    job: "Turns basic business info into a reviewed starter system.",
    handles: ["Business profile", "Services", "Service areas", "Starter workflows"],
    href: "/app/build-system",
    icon: Wand2
  },
  {
    name: "AI Growth Manager",
    job: "Looks for the next practical way to create more qualified demand.",
    handles: ["Lead sources", "Reviews", "SEO gaps", "Campaign priorities"],
    href: "/app/growth",
    icon: Sparkles
  },
  {
    name: "AI Marketing Manager",
    job: "Plans campaigns, promotions, seasonal pushes, and referral ideas.",
    handles: ["Campaigns", "Promotions", "Calendar", "Offers"],
    href: "/app/marketing-os",
    icon: Megaphone
  },
  {
    name: "AI Content Manager",
    job: "Creates draft-first content from services, proof, reviews, and media.",
    handles: ["Blogs", "Social posts", "GBP posts", "Emails"],
    href: "/app/drafts",
    icon: FileText
  },
  {
    name: "AI Sales Assistant",
    job: "Helps respond to leads, revive old opportunities, and move pipeline.",
    handles: ["Lead replies", "Call scripts", "Estimate follow-up", "Pipeline notes"],
    href: "/app/operator",
    icon: MessagesSquare
  },
  {
    name: "AI Receptionist",
    job: "Prepares website chat, missed-call text back, and appointment intake.",
    handles: ["Lead qualification", "Missed calls", "Appointments", "Intake"],
    href: "/app/operator",
    icon: Phone
  },
  {
    name: "AI Review Manager",
    job: "Turns completed work into reviews, proof, and social trust.",
    handles: ["Review asks", "Testimonials", "Before/after proof", "Reputation"],
    href: "/app/review",
    icon: Star
  },
  {
    name: "AI SEO Manager",
    job: "Finds useful pages and local content opportunities without thin SEO.",
    handles: ["Service pages", "City pages", "Internal links", "SEO refreshes"],
    href: "/app/seo",
    icon: Search
  },
  {
    name: "AI Website Manager",
    job: "Imports website context and prepares conversion or page improvements.",
    handles: ["Website import", "Homepage drafts", "Landing pages", "Lead forms"],
    href: "/app/website",
    icon: BriefcaseBusiness
  },
  {
    name: "AI Automation Manager",
    job: "Suggests useful workflows and keeps live actions behind approvals.",
    handles: ["Rules", "Templates", "Approval gates", "Usage limits"],
    href: "/app/automation",
    icon: Workflow
  },
  {
    name: "AI Follow-Up Manager",
    job: "Finds stale leads, callbacks, estimates, invoices, and review timing.",
    handles: ["Stale leads", "Callbacks", "Invoice nudges", "Review timing"],
    href: "/app/actions",
    icon: ClipboardList
  },
  {
    name: "AI Ad Manager",
    job: "Drafts ad concepts and tracking plans before direct publishing exists.",
    handles: ["Ad copy", "Audience notes", "Budget guardrails", "Attribution"],
    href: "/app/marketing-os",
    icon: Megaphone
  }
];

const quickActions = [
  ["Get More Leads", "AI checks SEO, reviews, source tracking, stale leads, campaign ideas, and follow-up gaps.", "/app/growth"],
  ["Get More Reviews", "AI prepares review requests, proof capture, testimonial content, and approval-safe reminders.", "/app/review"],
  ["Create Campaign", "AI drafts landing page, social posts, GBP ideas, emails, SMS, ad copy, and source tracking.", "/app/marketing-os"],
  ["Improve Website", "AI imports website context and prepares homepage, service, proof, and conversion improvements.", "/app/website"],
  ["Improve SEO", "AI prepares useful service/city pages, internal linking, refreshes, and content ideas.", "/app/seo"],
  ["Reactivate Leads", "AI finds old leads and prepares reply drafts, tasks, and call scripts for approval.", "/app/operator"],
  ["Generate Content", "AI drafts posts, pages, emails, messages, and ads from real business context.", "/app/drafts"],
  ["Set Up My Business", "AI creates a reviewed setup plan for profile, services, areas, forms, automations, reviews, and SEO.", "/app/build-system"]
];

type AiWorkforceEvent = {
  id: string;
  title: string;
  body: string | null;
  occurred_at: Date;
  metadata_json: {
    command?: string;
    prepared?: string[];
    blocked?: string[];
  } | null;
};

async function getAiWorkforceHistory() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<AiWorkforceEvent>(
    `
    select id, title, body, occurred_at, metadata_json
    from public.operator_timeline_events
    where tenant_id = $1
      and event_type = 'ai_workforce_command'
    order by occurred_at desc
    limit 8
    `,
    [workspaceId]
  );
  return result?.rows ?? [];
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function modeLabel(value: string) {
  if (value === "draft_only") return "draft only";
  if (value === "auto_allowed") return "auto allowed";
  return "approval required";
}

function cadenceLabel(value: string) {
  if (value === "every_15_min") return "every 15 min";
  return value.replaceAll("_", " ");
}

export default async function AiWorkforcePage() {
  const [history, agentDashboard] = await Promise.all([getAiWorkforceHistory(), getAgentWorkflowDashboard()]);
  const monitorReady = Boolean(env.AI_WORKFORCE_CRON_TOKEN);

  return (
    <QueuePageShell
      eyebrow="AI Mode"
      title="AI Workforce Command Center"
      description="Manage Ferocity like a team of AI employees. Traditional menus stay available; this layer simply makes the work easier to start, preview, and approve."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Bot size={18} /> One Platform, Two Ways To Use It
            </h2>
            <p className="muted">
              1. AI Mode lets owners say what they want. 2. Traditional Mode keeps every CRM, review, website, content, automation, reporting,
              messaging, lead, billing, customer portal, integration, and settings page available.
            </p>
          </div>
          <div className="inline-actions">
            <span className="pill">1. AI Mode</span>
            <span className="pill">2. Traditional Mode</span>
          </div>
        </div>
        <div className="setup-step-grid">
          {[
            ["1", "AI learns the business", "Use simple input, website import, existing records, and manual edits."],
            ["2", "AI builds a plan", "Ferocity shows what will be created, changed, or queued before anything applies."],
            ["3", "Owner approves", "Live sends, publishing, ads, sync, and spend stay gated by controls."],
            ["4", "Ferocity monitors results", "The same loop watches leads, jobs, reviews, invoices, revenue, and follow-up."]
          ].map(([number, title, body]) => (
            <div className="setup-step-card" key={number}>
              <span className="step-dot">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <AiCommandPanel />

      <section className="section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Workflow size={18} /> AI Agent Workflows
            </h2>
            <p className="muted">
              These are the actual agent loops. They use existing Ferocity leads, messages, reviews, invoices, drafts, action queues, and timeline records.
              Customer sends and publishing stay gated unless policies, keys, consent, and approvals allow them.
            </p>
          </div>
          <Link className="mini-button" href="/app/actions">Open action queue</Link>
        </div>
        {!agentDashboard.tableReady ? (
          <div className="callout">
            <h3>Agent workflow tables need the latest migration</h3>
            <p className="muted">The UI is ready, but the database still needs migration 051 before these controls can run.</p>
          </div>
        ) : null}
        <div className="grid">
          {agentDashboard.workflows.map((workflow) => (
            <div className="panel span-4" key={workflow.id}>
              <div className="list-row flush-row">
                <div>
                  <h3>{workflow.agentName}</h3>
                  <p className="muted">{workflow.plainGoal}</p>
                </div>
                <span className={`pill ${workflow.status === "paused" ? "high" : ""}`}>{workflow.status === "active" ? "on" : workflow.status}</span>
              </div>
              <div className="inline-actions">
                <span className="pill">{modeLabel(workflow.runMode)}</span>
                <span className="pill">
                  <Clock3 size={14} /> {cadenceLabel(workflow.cadenceKey)}
                </span>
                <span className="pill">{workflow.openOutputs} output(s)</span>
              </div>
              <p className="muted">Last run: {dateLabel(workflow.lastRunAt)} / {workflow.lastRunStatus ?? "not run yet"}</p>
              <p className="muted">Next run: {dateLabel(workflow.nextRunAt)}</p>
              <form action={updateAiAgentWorkflowAction} className="form-stack compact-form">
                <input name="workflowId" type="hidden" value={workflow.id} />
                <div className="two-col">
                  <label>
                    Status
                    <select name="status" defaultValue={workflow.status}>
                      <option value="active">On</option>
                      <option value="paused">Off</option>
                      <option value="draft">Draft</option>
                    </select>
                  </label>
                  <label>
                    Mode
                    <select name="runMode" defaultValue={workflow.runMode}>
                      <option value="draft_only">Draft only</option>
                      <option value="approval_required">Ask before action</option>
                      <option value="auto_allowed">Auto allowed</option>
                    </select>
                  </label>
                </div>
                <label>
                  Schedule
                  <select name="cadenceKey" defaultValue={workflow.cadenceKey}>
                    <option value="manual">Manual only</option>
                    <option value="every_15_min">Every 15 min</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <div className="button-row">
                  <button className="mini-button" type="submit">Save agent</button>
                </div>
              </form>
              <form action={runAiAgentWorkflowAction}>
                <input name="agentKey" type="hidden" value={workflow.agentKey} />
                <button className="button" type="submit">
                  <PlayCircle size={16} /> Run check now
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <div className="panel span-6">
          <h2>Recent Agent Runs</h2>
          <ul className="list">
            {agentDashboard.runs.map((run) => (
              <li className="list-row" key={run.id}>
                <div>
                  <h3>{run.agentKey.replaceAll("_", " ")}</h3>
                  <p>{run.summary ?? "Run started."}</p>
                  <p className="muted">
                    {dateLabel(run.startedAt)} / {run.outputsPrepared} prepared / {run.outputsSent} sent / {run.outputsBlocked} blocked
                  </p>
                </div>
                <span className={`pill ${run.status === "failed" ? "high" : ""}`}>{run.status}</span>
              </li>
            ))}
            {agentDashboard.runs.length === 0 ? (
              <li className="list-row">
                <span className="muted">No agent workflow runs yet. Use Run check now on one of the agents.</span>
              </li>
            ) : null}
          </ul>
        </div>
        <div className="panel span-6">
          <h2>Agent Output Queue</h2>
          <ul className="list">
            {agentDashboard.outputs.map((output) => (
              <li className="list-row" key={output.id}>
                <div>
                  <h3>{output.title}</h3>
                  <p className="muted">
                    {output.agentKey.replaceAll("_", " ")} / {output.outputType} / {dateLabel(output.createdAt)}
                  </p>
                  <p className="muted">{output.targetType ?? "audit only"}</p>
                </div>
                <span className="pill">{output.status}</span>
              </li>
            ))}
            {agentDashboard.outputs.length === 0 ? (
              <li className="list-row">
                <span className="muted">Agent outputs will appear here after a run.</span>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>One-Click Starting Points</h2>
            <p className="muted">Plain actions for normal business owners. Each one opens the existing Ferocity system that already handles the work.</p>
          </div>
          <Link className="mini-button" href="/app/controls">Safety controls</Link>
        </div>
        <div className="status-grid">
          {quickActions.map(([title, body, href]) => (
            <Link className="status-card" href={href} key={title}>
              <div>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </div>
              <CheckCircle2 size={18} />
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Background AI Employees</h2>
            <p className="muted">
              Ferocity can run scheduled AI agent workflows through the protected monitor endpoint. Agents prepare drafts, tasks, review work, internal alerts, and outputs while live customer sends and publishing stay gated.
            </p>
          </div>
          <span className={`pill ${monitorReady ? "" : "high"}`}>{monitorReady ? "monitor ready" : "needs AI_WORKFORCE_CRON_TOKEN"}</span>
        </div>
        <div className="status-grid compact-status-grid">
          {[
            ["Lead Response Agent", "Checks due lead-response workflows, prepares first-reply drafts, and sends internal owner/team alerts when email is ready."],
            ["Follow-Up Agent", "Checks stale leads and creates reviewed follow-up tasks instead of letting opportunities disappear."],
            ["Review Agent", "Checks completed jobs and prepares review request workflows that still require approval before customer contact."],
            ["Invoice Reminder Agent", "Checks aging invoices and prepares payment reminder work without sending customer email automatically."],
            ["SEO And Marketing Agent", "Checks service and area data and prepares draft-only SEO content that still needs proof and approval."]
          ].map(([title, body]) => (
            <div className="status-card" key={title}>
              <div>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </div>
              <ShieldCheck size={18} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>AI Mode Activity</h2>
            <p className="muted">Commands are logged in the existing operator timeline so the work stays auditable with the rest of Ferocity.</p>
          </div>
          <Link className="mini-button" href="/app/operator">Timeline</Link>
        </div>
        <ul className="list">
          {history.map((event) => (
            <li className="list-row" key={event.id}>
              <div>
                <h3>{event.metadata_json?.command ?? event.title}</h3>
                <p className="muted">
                  {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(event.occurred_at)}
                </p>
                <p>{event.body}</p>
                {event.metadata_json?.prepared?.length ? (
                  <p className="muted">{event.metadata_json.prepared.length} prepared item(s), review required before live action.</p>
                ) : null}
              </div>
              <span className={`pill ${event.metadata_json?.blocked?.length ? "high" : ""}`}>
                {event.metadata_json?.blocked?.length ? "needs attention" : "prepared"}
              </span>
            </li>
          ))}
          {history.length === 0 ? (
            <li className="list-row">
              <span className="muted">No AI Mode commands have been executed yet.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>AI Employees</h2>
            <p className="muted">Each role is a simple front door into existing Ferocity modules. Future employees can be added without changing the core platform.</p>
          </div>
          <span className="pill">{employees.length} roles</span>
        </div>
        <div className="grid">
          {employees.map((employee) => {
            const Icon = employee.icon;
            return (
              <Link className="panel span-4" href={employee.href} key={employee.name}>
                <div className="list-row flush-row">
                  <div className="inline-title">
                    <Icon size={18} />
                    <h3>{employee.name}</h3>
                  </div>
                  <span className="pill">open</span>
                </div>
                <p className="muted">{employee.job}</p>
                <div className="inline-actions">
                  {employee.handles.map((item) => (
                    <span className="pill" key={item}>{item}</span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <ShieldCheck size={18} /> Safety Rules
            </h2>
            <p className="muted">The AI Workforce is allowed to prepare and recommend. Live business actions still need the right keys, limits, consent, and approvals.</p>
          </div>
          <Link className="mini-button" href="/app/go-live">Go Live scan</Link>
        </div>
        <div className="status-grid compact-status-grid">
          {[
            ["No duplicate systems", "AI actions map to existing Ferocity records and workflows."],
            ["Preview before apply", "Setup, content, automations, ads, and publishing should show a plan first."],
            ["Draft-first marketing", "SEO pages, GBP posts, social content, ads, and review responses stay reviewable."],
            ["Provider gates", "Email, SMS, payments, calendars, ads, and sync need keys and controls before live use."],
            ["Traditional mode stays", "Power users can still use every normal page, setting, and dashboard."],
            ["Easy to expand", "New AI employees should be data/config additions, not another duplicate app."]
          ].map(([title, body]) => (
            <div className="status-card" key={title}>
              <div>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </div>
              <ShieldCheck size={18} />
            </div>
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}
