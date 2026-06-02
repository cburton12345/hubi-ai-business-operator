import Link from "next/link";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileText,
  Megaphone,
  MessagesSquare,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wand2,
  Workflow
} from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { AiCommandPanel } from "./AiCommandPanel";

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

export default function AiWorkforcePage() {
  return (
    <QueuePageShell
      eyebrow="AI Guided Mode"
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
              AI Guided Mode lets owners say what they want. Traditional Mode keeps every CRM, review, website, content, automation, reporting,
              messaging, lead, billing, customer portal, integration, and settings page available.
            </p>
          </div>
          <div className="inline-actions">
            <span className="pill">AI guided</span>
            <span className="pill">traditional mode</span>
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
