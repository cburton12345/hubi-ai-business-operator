import Link from "next/link";
import { BarChart3, Bot, BriefcaseBusiness, CheckCircle2, CreditCard, Globe2, Map, ShieldCheck, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";

const workModes = [
  {
    title: "I want autopilot",
    detail: "See what AI watches, what it can handle, what needs approval, and what to connect next.",
    href: "/app/autopilot",
    label: "Watch list"
  },
  {
    title: "I need to know what matters right now",
    detail: "Owner decisions, risks, money issues, blocked AI work, and connected-system events.",
    href: "/app/ai-monitoring",
    label: "Daily Brief"
  },
  {
    title: "I need my business profile set up",
    detail: "Services, areas, customers, proof, brand voice, documents, integrations, and history.",
    href: "/app/business-brain",
    label: "Business Info"
  },
  {
    title: "I need to see what AI has done",
    detail: "Prepared work, blocked actions, approvals, syncs, and automation activity.",
    href: "/app/automation-timeline",
    label: "Timeline"
  },
  {
    title: "I do not know how to set this up",
    detail: "Tell Ferocity what the business needs and get a setup plan before anything changes.",
    href: "/app/build-system",
    label: "Build My System"
  },
  {
    title: "I need more leads and better marketing",
    detail: "A weekly growth plan for website work, SEO, service pages, proof, reviews, campaigns, graphics, and videos.",
    href: "/app/growth-calendar",
    label: "Growth Calendar"
  },
  {
    title: "I need to work leads and follow up",
    detail: "Lead records, conversations, callbacks, stale leads, estimates, and pipeline movement.",
    href: "/app/lead-command",
    label: "Customers"
  },
  {
    title: "I need to run jobs and collect money",
    detail: "Customers, estimates, jobs, invoices, manual payment records, Stripe payment-link readiness, service tasks, and review requests.",
    href: "/app/service-command",
    label: "Work"
  },
  {
    title: "I need today's crew plan",
    detail: "Simple itinerary for workers, jobsite, schedule, owner review, customer updates, and field status.",
    href: "/app/crew-itinerary",
    label: "Crew Day"
  },
  {
    title: "I need workers, punch-in, field costs, or payroll review",
    detail: "Workers, crews, time clock, schedules, field costs, mileage, field proof, and payroll exports.",
    href: "/app/operations-workforce",
    label: "Workforce"
  },
  {
    title: "I need employees or subcontractors",
    detail: "Create a worker request, collect availability, let Ferocity suggest matches, and approve contact before anything happens.",
    href: "/app/labor-bench",
    label: "Labor Bench"
  }
];

const featureGroups = [
  {
    title: "Owner And AI",
    icon: <Bot size={18} />,
    items: [
      ["Owner Feed", "Daily briefing, owner queue, critical issues, money radar, AI actions.", "/app/owner-command-center", "visible"],
      ["Autopilot", "What Ferocity watches, what AI can handle, what needs approval, and what to connect next.", "/app/autopilot", "visible now"],
      ["Daily Brief", "Morning owner summary and watchtower for leads, jobs, money, reviews, employees, bids, competitors, and connected systems.", "/app/ai-monitoring", "visible now"],
      ["Today", "Shortest owner list for decisions, risks, money moves, blocked automation, provider gaps, and AI actions.", "/app/attention-command", "visible now"],
      ["Business Info", "Shared source of truth for services, areas, customers, proof, brand voice, history, and connected tools.", "/app/business-brain", "visible now"],
      ["Automation Timeline", "Trust feed showing what Ferocity prepared, blocked, synced, handled, and still needs approved.", "/app/automation-timeline", "visible now"],
      ["Notifications", "Device push setup for owner decisions, hot leads, blocked automation, safety, and money follow-up.", "/app/notifications", "visible now"],
      ["Install App", "Install Ferocity on phone, tablet, or desktop for faster owner and field access.", "/install", "visible now"],
      ["AI Workforce", "AI employees, one-click starting points, agent runs, output queue, and the command box for business work.", "/app/ai-workforce", "visible"],
      ["Automation Rules", "AI agents, recurring rules, queued actions, consent, live policies, provider readiness, and limits.", "/app/automation-command", "visible now"],
      ["Build My System", "Plain-English setup planner, preview changes, apply reviewed plans, change log.", "/app/build-system", "visible"],
      ["Private Owner Tasks", "Personal owner tasks and LifeOps-style items tied to the owner layer.", "/app/personal-ops", "advanced"],
      ["Connected Systems", "GovFlow, 4Bid, GuardianSignal, MarketplacePro, and connected-system event feeds.", "/app/lifeops-connections", "visible"]
    ]
  },
  {
    title: "Marketing, SEO, And Proof",
    icon: <Globe2 size={18} />,
    items: [
      ["Marketing", "Business memory, website imports, campaigns, graphics, video jobs, media library.", "/app/marketing-os", "visible"],
      ["Growth Calendar", "Weekly SEO, proof, review, publishing, campaign, and ROI work in one plain-English board.", "/app/growth-calendar", "visible now"],
      ["Customer Touchpoints", "Forms, website snippets, hosted pages, customer portals, proof links, Stripe payment-link readiness, public grader, and onboarding paths.", "/app/customer-touchpoints", "visible now"],
      ["Website Connector", "Widget/script path, lead source tracking, customer website SEO direction.", "/app/website", "also_more"],
      ["SEO", "SEO tasks, service/location opportunities, page refreshes, organic growth planning.", "/app/seo", "advanced"],
      ["Publishing Hub", "Pages, posts, and publishing work waiting for owner review.", "/app/publishing-hub", "advanced"],
      ["Growth Sites", "Hosted Ferocity landing/service/city pages connected to lead capture.", "/app/sites", "advanced"],
      ["Customer Proof / UGC", "Reviews, before/after photos, customer proof, consent, and marketing reuse.", "/app/proof", "also_more"],
      ["Reviews", "Review request workflows and reputation operations.", "/app/review", "also_more"],
      ["Business Grader Leads", "Public grader reports, scores, Blueprint handoffs, and setup conversations.", "/app/website-grader", "also_more"]
    ]
  },
  {
    title: "Leads, Sales, And Follow-Up",
    icon: <BriefcaseBusiness size={18} />,
    items: [
      ["Customers", "Plain sales loop for new leads, hot leads, conversations, callbacks, queued follow-up, and pipeline.", "/app/lead-command", "visible now"],
      ["Leads", "Lead list, lead details, routing, AI lead intelligence, source handling.", "/app/leads", "visible"],
      ["Public Lead Forms", "Reusable form keys and public lead capture forms.", "/app/forms", "also_more"],
      ["Action Queue", "One safety queue for messages, publishing, reviews, calendar, and billing actions.", "/app/actions", "also_more"],
      ["Automation Rules", "Plain view of what AI prepared, what needs review, what is blocked, and what can safely run.", "/app/automation-command", "visible now"],
      ["Draft Queue", "AI-generated drafts waiting for review or later use.", "/app/drafts", "advanced"],
      ["Approvals", "Sensitive/high-impact items requiring human review.", "/app/approvals", "advanced"],
      ["Calendar", "Generated drafts, scheduled work, approved items, and upcoming AI tasks.", "/app/calendar", "advanced"],
      ["Tasks", "AI task queue scoped by workspace and brand.", "/app/tasks", "advanced"]
    ]
  },
  {
    title: "Service Operations",
    icon: <Map size={18} />,
    items: [
      ["Work", "Plain daily loop for scheduling work, dispatch, estimates, invoices, reviews, inventory, and field proof.", "/app/service-command", "visible now"],
      ["Crew Day", "Simple daily itinerary for workers, jobsites, schedule, owner review items, and customer update drafts.", "/app/crew-itinerary", "visible now"],
      ["Detailed Work Records", "Customers, estimates, jobs, invoices, review requests, inventory alerts.", "/app/service", "visible"],
      ["Technician Workflow", "Mobile-friendly queue for scheduled and in-progress jobs.", "/app/service/tech", "advanced"],
      ["Route Planning", "Dispatcher view for scheduled and in-progress jobs.", "/app/service/routes", "advanced"],
      ["Inventory And Equipment", "Parts, materials, tools, equipment, and vehicles.", "/app/service/inventory", "advanced"],
      ["AI Walkthrough", "Walk, talk, document jobsites, create observations, tasks, estimates, reports.", "/app/ai-walkthrough", "also_more"],
      ["Advanced Diagnostics", "Source scoring, connector health, document review, support, and endpoint logs.", "/app/operator-depth", "advanced"]
    ]
  },
  {
    title: "Workforce And Money",
    icon: <CreditCard size={18} />,
    items: [
      ["Operations & Workforce", "Workers, crews, schedule, clock-in, expenses, mileage, proof, customer updates.", "/app/operations-workforce", "visible now"],
      ["Labor Bench", "Worker requests, public worker availability intake, match suggestions, and owner-approved contact.", "/app/labor-bench", "visible now"],
      ["Cash Collection", "Open invoices, overdue follow-up, manual payment records, Stripe payment-link readiness, payments received, and ledger visibility.", "/app/cash-collection", "visible now"],
      ["Punch In / Out", "Direct time clock area for workers and office review.", "/app/operations-workforce#time-clock", "visible now"],
      ["Schedule Work", "Dispatch assignment creation and schedule board.", "/app/operations-workforce#schedule", "visible now"],
      ["Field Costs, Mileage, Proof", "Field expense, route miles, material logs, photos, videos, and cost extraction.", "/app/operations-workforce#field-work", "visible now"],
      ["Payroll Review", "Payroll export drafts, ready/exported states, provider readiness.", "/app/operations-workforce#payroll", "visible now"],
      ["Billing", "Plan, subscription, Stripe checkout/portal readiness, cancel/portal paths.", "/app/billing", "also_more"],
      ["Invoices And Ledger", "Invoice detail, payment requests, payments received, and ledger entries.", "/app/cash-collection", "visible now"]
    ]
  },
  {
    title: "Settings, Safety, And Admin",
    icon: <ShieldCheck size={18} />,
    items: [
      ["Setup", "Traditional mode verticals and provider requirements.", "/app/setup", "visible"],
      ["Safety & Readiness", "One board for connected accounts, approvals, live actions, limits, launch blockers, webhooks, billing, and app health.", "/app/safety-readiness", "visible now"],
      ["Automation Rules", "Consent, live action policies, action queue, agent workflows, automation rules, and limits in one place.", "/app/automation-command", "visible now"],
      ["Integrations", "Provider readiness and customer account setup.", "/app/integrations", "visible"],
      ["Credentials", "Which keys exist without exposing secret values.", "/app/credentials", "advanced"],
      ["Controls", "Service gates, cost limits, live action controls, usage limits.", "/app/controls", "visible"],
      ["System Health", "Broken, missing, paused, and not-hooked-up checks.", "/app/system-health", "visible"],
      ["Go Live", "Launch readiness before customers or public usage.", "/app/go-live", "visible"],
      ["QA", "Database-backed workspace readiness checks.", "/app/qa", "advanced"],
      ["Safety", "Operational safety links, app errors, launch runbooks.", "/app/safety", "advanced"],
      ["Runbooks", "Operating procedures and recovery steps.", "/app/runbooks", "advanced"],
      ["Webhooks", "Inbound/outbound event framework.", "/app/webhooks", "advanced"],
      ["Exports", "Content and workspace export packages.", "/app/exports", "advanced"],
      ["Access Control", "Workspace users, invite links, roles, and brand access.", "/app/access", "also_more"]
    ]
  }
];

function surfaceLabel(status: string) {
  if (status.includes("visible now")) return "Main path";
  if (status.includes("visible")) return "Top level";
  if (status.includes("also_more")) return "Also in More";
  if (status.includes("advanced")) return "Advanced";
  return "Available";
}

function surfaceClass(status: string) {
  if (status.includes("visible now") || status.includes("visible")) return "";
  if (status.includes("also_more")) return "medium";
  return "muted-pill";
}

export default function FeatureMapPage() {
  return (
    <QueuePageShell
      eyebrow="Feature Map"
      title="Everything Ferocity Can Do"
      description="A plain-English map of the product so important tools do not disappear inside menus, dashboards, or admin pages."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Start With The Job</h2>
            <p className="muted">Pick what you are trying to do. The detailed feature list is below for power users.</p>
          </div>
          <Link className="button" href="/app/build-system">Have AI guide me</Link>
        </div>
        <div className="path-grid">
          {workModes.map((mode) => (
            <Link className="path-card" href={mode.href} key={mode.title}>
              <CheckCircle2 size={18} />
              <strong>{mode.title}</strong>
              <span>{mode.detail}</span>
              <span className="pill">{mode.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Simple Names</h2>
        <p className="muted">These are the names a normal owner should remember. The deeper pages still exist for power users.</p>
        <div className="grid">
          {[
            ["Daily Brief", "Morning summary. What happened, what matters, and what needs the owner.", "/app/ai-monitoring"],
            ["Autopilot", "What Ferocity watches, handles, queues, blocks, and recommends next.", "/app/autopilot"],
            ["Today", "The shortest do-this-now list.", "/app/attention-command"],
            ["Crew Day", "Simple itinerary for who is working, where they are going, and what needs review.", "/app/crew-itinerary"],
            ["Owner Feed", "The full owner event feed across Ferocity and connected systems.", "/app/owner-command-center"],
      ["Business Info", "The source of truth every AI helper reads before it acts.", "/app/business-brain"],
            ["Automation Timeline", "The trust feed for what AI prepared, blocked, synced, and handled.", "/app/automation-timeline"],
      ["Build My System", "Plain-English setup help.", "/app/build-system"],
            ["Growth", "Marketing, SEO, reviews, proof, website, campaigns, and source tracking.", "/app/growth-calendar"],
            ["Leads", "New leads, replies, callbacks, estimates, and follow-up.", "/app/lead-command"],
            ["Service", "Jobs, customers, estimates, invoices, dispatch, inventory, and reviews.", "/app/service-command"],
            ["Labor Bench", "Find workers, collect availability, suggest matches, and approve contact.", "/app/labor-bench"],
            ["Safety", "Connected accounts, approvals, limits, launch blockers, billing, webhooks, and health.", "/app/safety-readiness"]
          ].map(([name, detail, href]) => (
            <Link className="panel span-3 status-card" href={href} key={name}>
              <strong>{name}</strong>
              <span className="muted">{detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Find Any Tool</h2>
            <p className="muted">Main paths are for daily use. Advanced tools stay available for admins and power users.</p>
          </div>
          <Link className="mini-button" href="/app/system-health">Check health</Link>
        </div>
        <div className="grid">
          {featureGroups.map((group) => (
            <section className="panel span-6" key={group.title}>
              <h2>{group.icon} {group.title}</h2>
              <ul className="list">
                {group.items.map(([title, detail, href, status]) => (
                  <li className="list-row" key={title}>
                    <div>
                      <h3><Link href={href}>{title}</Link></h3>
                      <p className="muted">{detail}</p>
                    </div>
                    <div className="inline-actions">
                      <span className={`pill ${surfaceClass(status)}`}>{surfaceLabel(status)}</span>
                      <Link className="mini-button" href={href}>Open</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2><Users size={18} /> Simple Way To Use Ferocity</h2>
        <div className="setup-step-grid">
          <Step number="1" title="Start with Today" body="See what needs attention, what AI handled, and what money or risk needs a decision." />
          <Step number="2" title="Let Ferocity set up the system" body="Use the guided setup when a business owner does not know which settings, automations, or pages to create." />
          <Step number="3" title="Run the daily loops" body="Use Growth, Leads, Service, Cash, and Operations for the work that moves the business." />
          <Step number="4" title="Use All Features when needed" body="Admins can still open every detailed tool without making normal users learn every module name." />
        </div>
      </section>
    </QueuePageShell>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="setup-step-card">
      <span className="step-dot">{number}</span>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
