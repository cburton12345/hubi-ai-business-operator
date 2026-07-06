import Link from "next/link";
import type { Metadata } from "next";
import {
  Bot,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  FileText,
  Megaphone,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Star,
  Users,
  Wrench
} from "lucide-react";

export const metadata: Metadata = {
  title: "Ferocity Features: AI Autopilot for Modern Businesses",
  description:
    "See how Ferocity gives businesses digital employees for lead response, follow-up, marketing, jobs, payments, reviews, tasks, and approved repeat work.",
  alternates: {
    canonical: "/features"
  }
};

const sections = [
  {
    group: "Setup",
    title: "AI setup",
    body: "Ferocity audits the business, finds money leaks, and recommends the setup before the owner has to dig through settings.",
    examples: ["Business Grader", "Recommended setup plan", "Preview changes", "Workspace memory"],
    icon: Bot
  },
  {
    group: "Growth",
    title: "AI marketing assistant",
    body: "Create more demand with website improvements, SEO/GEO, review flow, Google profile activity, referrals, ads, campaigns, and source tracking from the same account.",
    examples: ["Website connection", "SEO/GEO drafts", "Campaign ideas", "Lead source tracking"],
    icon: Megaphone
  },
  {
    group: "Sales",
    title: "AI receptionist",
    body: "Turn new leads, missed calls, form fills, quote requests, and customer messages into visible tasks and suggested replies before they go cold.",
    examples: ["Speed-to-lead draft", "Unanswered lead alert", "Conversation timeline", "Internal notes"],
    icon: MessageSquareText
  },
  {
    group: "Sales",
    title: "AI follow-up agent",
    body: "Watch for the moments that usually get forgotten and prepare the next action that can still save the sale.",
    examples: ["Stale lead recovery", "Estimate follow-up", "Invoice follow-up", "Callback reminders"],
    icon: CalendarClock
  },
  {
    group: "Sales",
    title: "Use app alerts and email",
    body: "Push important owner alerts to the installed Ferocity app and use verified email for summaries, setup messages, reports, and follow-up.",
    examples: ["Hot lead alerts", "Owner approval needed", "Payment risk", "Automation failed"],
    icon: MessageSquareText
  },
  {
    group: "Growth",
    title: "Build SEO safely",
    body: "Create AI-search checks, 30-day content plans, useful local pages, authority tasks, and publishing paths tied to lead capture.",
    examples: ["AI search prompts", "30-day SEO plan", "Authority tasks", "No thin auto-publishing"],
    icon: FileText
  },
  {
    group: "Proof",
    title: "Ask for reviews",
    body: "Create review request drafts after completed work and route unhappy feedback before a public ask.",
    examples: ["Review request workflow", "Negative-experience interception", "Response drafts", "Google profile workflow"],
    icon: Star
  },
  {
    group: "Proof",
    title: "Capture customer proof",
    body: "Collect approved testimonials, before/after links, customer stories, and consent after real jobs.",
    examples: ["Photo links", "Video links", "Consent tracking", "Proof-to-content drafts"],
    icon: CheckCircle2
  },
  {
    group: "Revenue",
    title: "AI revenue loop",
    body: "Connect marketing activity to leads, estimates, booked jobs, paid invoices, and reviews so the owner can see what actually made money.",
    examples: ["Lead source ROI", "Pipeline value", "Closed revenue", "Campaign learning"],
    icon: ChartNoAxesCombined
  },
  {
    group: "Operations",
    title: "AI office manager",
    body: "Let AI turn jobs, callbacks, estimates, invoices, and owner priorities into a practical list that keeps the day moving.",
    examples: ["Worker day plan", "Owner task list", "Callback list", "Job follow-up list"],
    icon: Wrench
  },
  {
    group: "Operations",
    title: "Field service backbone",
    body: "Run the normal contractor flow: bids, schedules, dispatch, materials, invoices, payments, receipts, reimbursements, and job profit.",
    examples: ["Simple bids", "Material lists", "People paid", "Money left per job"],
    icon: ReceiptText
  },
  {
    group: "Operations",
    title: "Workforce visibility",
    body: "Keep worker schedules, punch-in readiness, field proof, expenses, mileage, and missed-work alerts in the operating loop.",
    examples: ["Punch-in visibility", "Field proof", "Job assignments", "Route readiness"],
    icon: CalendarClock
  },
  {
    group: "Operations",
    title: "Find workers when you need help",
    body: "Create worker or subcontractor requests, collect availability, and let Ferocity suggest matches for owner approval.",
    examples: ["I need workers button", "Public worker intake", "Match suggestions", "Owner-approved contact"],
    icon: Users
  },
  {
    group: "Setup",
    title: "Configure with AI",
    body: "Ferocity turns audit gaps into a setup plan, then lets the owner review changes before applying.",
    examples: ["Recommended setup", "Preview changes", "Apply safely", "Change log"],
    icon: Bot
  },
  {
    group: "Control",
    title: "Keep control",
    body: "Customer messages, publishing, connected accounts, and spending stay controlled.",
    examples: ["Usage limits", "Owner controls", "Audit logs", "Bring your own accounts"],
    icon: ShieldCheck
  }
];

const featureGroups = ["Setup", "Operations", "Revenue", "Sales", "Proof", "Growth", "Control"].map((name) => ({
  name,
  items: sections.filter((section) => section.group === name)
}));

const operatingLoop = [
  {
    label: "Get found",
    text: "Plan Google visibility, AI-search prompts, service pages, reviews, Google Business Profile activity, referrals, community posts, and campaign tracking."
  },
  {
    label: "Catch the lead",
    text: "Bring forms, calls, messages, quote requests, marketplace sources, and partner sources into one visible lead queue."
  },
  {
    label: "Follow up",
    text: "Create suggested replies, callbacks, stale lead tasks, estimate reminders, and invoice follow-up."
  },
  {
    label: "Plan the day",
    text: "Turn jobs, callbacks, estimates, invoice follow-up, worker schedules, and owner priorities into daily task lists."
  },
  {
    label: "Close the job",
    text: "Track pipeline stages, estimates, booked work, job status, revenue, reviews, field proof, and next best actions."
  }
];

const outcomeGroups = [
  ["Create more demand", "SEO, Google profile work, reviews, proof, campaigns, referrals, website forms, and source tracking."],
  ["Turn leads into booked income", "Fast replies, callbacks, stale lead recovery, estimate follow-up, lead notes, and pipeline movement."],
  ["Run the day with less chaos", "Jobs, schedules, crews, worker requests, punch-in visibility, receipts, mileage, materials, and daily task lists."],
  ["Collect money sooner", "Invoices, manual payment records, overdue reminders, ledgers, cash alerts, and payment links when payments are connected."],
  ["Let AI carry busy work", "AI watches, drafts, recommends, summarizes, routes, reminds, logs, and asks for approval when needed."]
];

const aiWorkforceRows = [
  ["AI receptionist", "Captures leads, flags urgent messages, drafts first replies, and routes conversations."],
  ["AI sales assistant", "Works callbacks, stale leads, proposals, estimate follow-up, and next-best actions."],
  ["AI office manager", "Organizes tasks, schedules, reminders, daily lists, approvals, and owner briefings."],
  ["AI marketing assistant", "Connects website activity, marketing channels, SEO/GEO, reviews, proof, campaigns, and attribution."],
  ["AI collections helper", "Prepares invoice follow-up, overdue reminders, ledger notes, manual payment tracking, and payment links when payments are connected."],
  ["AI operations helper", "Surfaces problems, automation failures, risks, team activity, and work that needs a person."]
];

const ownershipRows = [
  ["Main business", "Run the everyday loop without feeling buried: leads, follow-up, jobs or orders, payments, reviews, marketing, and priorities."],
  ["Rental connection", "Use dedicated rental tools for deeper rental operations while Ferocity shows owner alerts, follow-up, reminders, and connected activity."],
  ["Side ventures", "Keep separate brands, projects, sales channels, or experiments organized without mixing the data."],
  ["Growing company", "Add people, brands, approval rules, alerts, reports, higher usage, and owner visibility as the operation gets bigger."]
];

const automationRows = [
  ["Speed-to-lead", "Draft a first reply and flag leads that need attention."],
  ["Missed callback", "Create a visible task when a callback or appointment is at risk."],
  ["Daily work list", "Use AI Workforce for the jobs, calls, estimates, invoices, and worker tasks that matter today."],
  ["Estimate follow-up", "Remind the team when an estimate sits too long without an answer."],
  ["Invoice follow-up", "Draft friendly payment reminders for review."],
  ["Review request", "Ask after completed work and route unhappy feedback through a safer path."],
  ["Customer proof", "Collect job photos, testimonials, and approvals before turning them into marketing drafts."],
  ["SEO/GEO refresh", "Keep service, city, proof, and AI-search content useful and tied to real work."]
];

const safetyRows = [
  "Customer messages, public posts, ad spend, and public review replies stay controlled.",
  "Setup plans preview changes before anything is applied.",
  "Activity logs record what changed so admins can review or roll back setup work.",
  "Plans control seats, usage, AI help, connected-account features, and advanced automations.",
  "Owners can use guided setup for simplicity or direct controls when they want full control."
];

const productMap = [
  {
    name: "Business Info",
    use: "Give AI the source of truth",
    detail: "Services, territories, team, brand voice, proof, customers, documents, and connected tools feed every AI helper."
  },
  {
    name: "Owner Command Center",
    use: "Know what needs done",
    detail: "The owner view that highlights today’s work, revenue, risk, decisions, approvals, and what AI handled."
  },
  {
    name: "Operations & Workforce",
    use: "Run the day",
    detail: "The field-ops area for worker day plans, schedules, punch-in visibility, proof, expenses, mileage, and job cost."
  },
  {
    name: "Lead Follow-Up",
    use: "Handle leads and follow-up",
    detail: "The daily work area for replies, callbacks, estimates, stale leads, invoice follow-up, and pipeline movement."
  },
  {
    name: "Business Grader",
    use: "Find the gaps",
    detail: "A free public report that scores the business and shows what is missing."
  },
  {
    name: "Guided Setup",
    use: "Turn gaps into setup",
    detail: "Ferocity recommends the setup plan, then lets the owner review what will change before anything goes live."
  },
  {
    name: "Automation Timeline",
    use: "See what AI did",
    detail: "The trust feed for prepared work, approvals, blocked items, messages, and owner decisions."
  },
  {
    name: "Marketing",
    use: "Create demand",
    detail: "The growth area for AI-search checks, SEO plans, service pages, campaigns, reviews, proof, and source tracking."
  }
];

const teamsFerocityHelps = [
  ["Owner team", "Daily briefing, money radar, risks, approvals, decisions, AI-handled work, and the next right move."],
  ["Scheduling team", "Worker day plans, callbacks, appointments, jobs, technician visibility, route readiness, and missed-work alerts."],
  ["Staffing team", "Worker requests, subcontractor availability, public intake forms, match suggestions, and owner-approved contact."],
  ["Field team", "Punch-in visibility, job assignments, field proof, receipts, mileage, notes, and customer updates."],
  ["Finance team", "Invoices, payment records, overdue reminders, ledgers, collection alerts, and Stripe-connected payment links when ready."],
  ["Sales team", "Lead capture, suggested replies, callbacks, estimates, stale lead recovery, and pipeline movement."],
  ["Customer team", "Messages, review requests, customer proof, testimonials, unhappy feedback routing, and follow-up."],
  ["Marketing team", "SEO, AI-search, Google Business Profile, service pages, review content, proof, campaigns, and source reporting."]
];

const fieldServiceBasics = [
  ["Bids and estimates", "Simple bid mode, line items, payment terms, deposits, estimate status, and follow-up drafts."],
  ["Scheduling and dispatch", "Unscheduled jobs, route view, technician workflow, worker day plans, assignments, and reminders."],
  ["Materials and inventory", "Material lists, needed/ordered/purchased/used statuses, inventory, tools, equipment, and job asset notes."],
  ["Invoices and payments", "Invoices, manual payment records, overdue balances, invoice follow-up, ledgers, and payment links when payments are connected."],
  ["People paid and receipts", "Worker payments, subcontractor pay, receipt submissions, reimbursement review, and job-level cost tracking."],
  ["Labor bench", "Ask for workers, collect availability, review suggested matches, and keep contact or placement under owner approval."],
  ["AI owner layer", "Today view, owner nudges, AI actions, automation timeline, and recommendations that point to the next profitable move."]
];

export default function FeaturesPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/demo/tour">Tour</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/connect-website">Connect Website</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/install">Install App</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero features-hero">
          <p className="eyebrow">AI workforce for modern businesses</p>
          <h1>Ferocity gives the business AI employees for the work that keeps getting missed.</h1>
          <p className="muted">
            Do not think of it as another CRM, SEO tool, chatbot, scheduling app, or field service app. Ferocity is the operating
            layer for businesses with leads, follow-up, payments, marketing, jobs or orders, customer proof, and owner decisions.
            It fits contractors, practices, agencies, sales teams, e-commerce, local companies, and owners with multiple ventures.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=features">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/business-health-score">
              Run free grader
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
            <Link className="button secondary-button" href="/demo">
              See demo
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Digital employees</p>
          <h2>Support the team, avoid hiring too early, and reduce repetitive admin work.</h2>
          <p className="muted">
            Ferocity is built to help people, not erase them. Office staff, managers, salespeople, technicians, assistants,
            and solo owners can all use AI helpers to move faster while important actions stay controlled.
          </p>
          <div className="grid section-actions">
            {aiWorkforceRows.map(([title, body]) => (
              <article className="panel span-4" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Outcomes first</p>
          <h2>Five reasons a business buys Ferocity.</h2>
          <div className="grid section-actions">
            {outcomeGroups.map(([title, body]) => (
              <article className="panel span-4" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">One place</p>
          <h2>Bring the owner&apos;s business, ventures, and connected systems into one command center.</h2>
          <p className="muted">
            Some owners have one company. Others have a main company, side ventures, partner projects, sales channels,
            future brands, rental operations, or a larger team. Ferocity stays approachable, keeps each business separate,
            and gives the owner visibility into what needs attention.
          </p>
          <div className="grid section-actions">
            {ownershipRows.map(([title, body]) => (
              <article className="panel span-3" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Business workflows</p>
          <h2>The features matter because they feed one serious operating system.</h2>
          <p className="muted">
            Ferocity is not a single-purpose CRM. It coordinates the workflows that usually get split across marketing,
            sales, finance, scheduling, field operations, customer service, and owner reporting. It handles repeat work when it can,
            prepares the next action when it should not act alone, and asks the owner for decisions, approvals, or missing connections.
          </p>
          <div className="grid section-actions">
            {teamsFerocityHelps.map(([team, body]) => (
              <article className="panel span-4" key={team}>
                <h3>{team}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Field service foundation</p>
          <h2>Ferocity covers daily business basics, then adds AI autopilot that moves the work.</h2>
          <p className="muted">
            For contractors, that can mean bids, schedules, dispatch, materials, invoices, and reviews. For other businesses,
            it can mean leads, consults, orders, campaigns, follow-up, payments, customer proof, and repeat sales.
          The point is the same for an average owner or a serious company: keep the work moving and show what can make money next.
          </p>
          <div className="grid section-actions">
            {fieldServiceBasics.map(([title, body]) => (
              <article className="panel span-4" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">How the pieces are different</p>
          <h2>One platform. Two ways to use it.</h2>
          <p className="muted">
            Guided setup helps normal owners know what to do next. Manual controls keep the full CRM, marketing, automation,
            jobs, invoices, reports, integrations, and settings available for admins.
          </p>
          <div className="grid section-actions">
            {productMap.map((item) => (
              <article className="panel span-4" key={item.name}>
                <h3>{item.name}</h3>
                <strong>{item.use}</strong>
                <p className="muted">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-command">
          <div>
            <p className="eyebrow">Plain-English setup</p>
            <h2>Ferocity should lead the owner like a chief of staff, not wait for them to become a software expert.</h2>
            <p className="muted">
              A business owner should not need to know which automation, SEO page, review flow, ad source, payment reminder, or follow-up rule to build first.
              Ferocity starts with the gaps and turns them into recommended setup, draft work, owner alerts, and controlled autopilot.
            </p>
            <div className="button-row">
              <Link className="button" href="/start?source=features_setup">
                Get recommendations
              </Link>
              <Link className="button secondary-button" href="/pricing">
                Compare tiers
              </Link>
            </div>
          </div>
          <div className="feature-plan-card">
            <strong>Example setup plan</strong>
            <ul className="plain-list">
              <li>
                Set lead source tracking for SEO, Google profile work, referrals, paid campaigns, marketplace sources, and partner sources.
              </li>
              <li>Create AI-search checks plus service and city page drafts for review.</li>
              <li>Create one-click campaigns, social posts, review graphics, landing pages, and Content Studio outputs.</li>
              <li>Prepare speed-to-lead, stale lead, estimate, invoice, review, and customer proof workflows.</li>
              <li>Keep customer messages, public posts, ad spend, and payment requests under owner control.</li>
              <li>Let the owner pick what AI runs now, what requires review, and what remains manual.</li>
            </ul>
          </div>
        </section>

        <section className="feature-loop">
          {operatingLoop.map((step, index) => (
            <article key={step.label}>
              <span>{index + 1}</span>
              <h2>{step.label}</h2>
              <p>{step.text}</p>
            </article>
          ))}
        </section>

        <section className="feature-split">
          <div className="panel">
            <h2>
              <Wrench size={19} /> Automations Ferocity organizes
            </h2>
            <div className="feature-automation-list">
              {automationRows.map(([name, text]) => (
                <div key={name}>
                  <CheckCircle2 size={17} />
                  <strong>{name}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>
              <ShieldCheck size={19} /> Control stays clear
            </h2>
            <ul className="plain-list safety-list">
              {safetyRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="feature-group-stack">
          {featureGroups.map((group) => (
            <article className="panel feature-group-panel" key={group.name}>
              <p className="eyebrow">{group.name}</p>
              <div className="feature-group-grid">
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div className="feature-mini-card" key={section.title}>
                      <Icon size={20} />
                      <h2>{section.title}</h2>
                      <p className="muted">{section.body}</p>
                      <ul className="plain-list">
                        {section.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Best single next step</p>
            <h2>Show the demo first. Use features as the deeper map.</h2>
            <p>
              The demo gives the quick walkthrough. This page lists the systems, automations, safety rules, and plan controls behind it.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader
            </Link>
            <Link className="button secondary-button" href="/start?source=features_bottom">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
