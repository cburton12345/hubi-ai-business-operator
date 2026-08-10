"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import { executeAiWorkforceCommandAction } from "./actions";

type CommandPlan = {
  title: string;
  ownerWords: string;
  employees: string[];
  prepares: string[];
  routes: { label: string; href: string }[];
};

const commandPlans: CommandPlan[] = [
  {
    title: "Make an ad video",
    ownerWords: "Make me a video ad from this job and add it to Facebook, Instagram, Google, and TikTok.",
    employees: ["AI Marketing Manager", "AI Ad Manager", "AI Content Manager"],
    prepares: ["Create Ad Autopilot package", "Draft video script and scene plan", "Create platform-specific variants", "Queue review/export before posting"],
    routes: [
      { label: "Marketing OS", href: "/app/marketing-os" },
      { label: "Review Queue", href: "/app/review" },
      { label: "Publishing Queue", href: "/app/publishing-hub" }
    ]
  },
  {
    title: "Add a receipt",
    ownerWords: "Add this receipt, pull the details, and put it on the right job for taxes and P&L.",
    employees: ["AI Office Manager", "AI Finance Helper", "AI Field Coordinator"],
    prepares: ["Create money task when details are missing", "Route receipt photo/OCR to Jobs & Money", "Track reimbursement and tax category", "Connect cost to job profit"],
    routes: [
      { label: "Jobs & Money", href: "/app/job-tracker" },
      { label: "Field Costs / Proof", href: "/app/operations-workforce#field-work" },
      { label: "Reports", href: "/app/reports" }
    ]
  },
  {
    title: "Log time or hours",
    ownerWords: "Log my hours for today and put them on the right job.",
    employees: ["AI Office Manager", "AI Payroll Helper", "AI Workforce Helper"],
    prepares: ["Create time review task when worker/job/time is missing", "Route to time clock and payroll review", "Keep hours tied to jobs and profit", "Surface missing approvals"],
    routes: [
      { label: "Team Time Clock", href: "/app/operations-workforce#time-clock" },
      { label: "Employee View", href: "/app/employee" },
      { label: "Payroll Review", href: "/app/operations-workforce#payroll" }
    ]
  },
  {
    title: "Create reminder",
    ownerWords: "Remind me tomorrow to call the customer and check the job goals.",
    employees: ["AI Chief of Staff", "AI Reminder Helper", "AI Office Manager"],
    prepares: ["Create owner reminder", "Route to push notification settings", "Show due item in Needs Attention", "Keep private owner tasks separate"],
    routes: [
      { label: "Notifications", href: "/app/notifications" },
      { label: "Needs Attention", href: "/app/attention-command" },
      { label: "Private Owner Tasks", href: "/app/personal-ops" }
    ]
  },
  {
    title: "Audit what is missing",
    ownerWords: "Audit my business setup and tell me what I need next.",
    employees: ["AI Business Setup Manager", "AI Growth Manager", "AI Automation Manager", "AI Website Manager"],
    prepares: ["Check missing setup pieces", "Run operator/growth/service scans", "Review website and SEO readiness", "Route owner to the next useful action"],
    routes: [
      { label: "Let Ferocity set it up", href: "/app/build-system" },
      { label: "Owner Events", href: "/app/owner-command-center" },
      { label: "Business Health Score", href: "/business-health-score" }
    ]
  },
  {
    title: "Get more leads",
    ownerWords: "Get me more roofing leads.",
    employees: ["AI Growth Manager", "AI SEO Manager", "AI Marketing Manager", "AI Ad Manager"],
    prepares: ["Review current lead sources", "Find SEO/service-area gaps", "Create campaign ideas", "Prepare follow-up and attribution checks"],
    routes: [
      { label: "Growth", href: "/app/growth-calendar" },
      { label: "Marketing", href: "/app/marketing-os" },
      { label: "SEO", href: "/app/seo" }
    ]
  },
  {
    title: "Get more reviews",
    ownerWords: "Help me get more reviews.",
    employees: ["AI Review Manager", "AI Follow-Up Manager", "AI Content Manager"],
    prepares: ["Find completed jobs ready for review asks", "Draft review requests", "Prepare testimonial and proof assets", "Keep sends behind approval"],
    routes: [
      { label: "Reviews", href: "/app/review" },
      { label: "Customer Proof", href: "/app/proof" },
      { label: "Controls", href: "/app/controls" }
    ]
  },
  {
    title: "Create a campaign",
    ownerWords: "Create a storm damage campaign.",
    employees: ["AI Marketing Manager", "AI Content Manager", "AI Website Manager", "AI Ad Manager"],
    prepares: ["Draft landing page", "Draft social and GBP posts", "Draft customer message copy", "Prepare ad copy and audience notes"],
    routes: [
      { label: "Marketing", href: "/app/marketing-os" },
      { label: "Growth Sites", href: "/app/sites" },
      { label: "Drafts", href: "/app/drafts" }
    ]
  },
  {
    title: "Improve website",
    ownerWords: "Improve my homepage.",
    employees: ["AI Website Manager", "AI SEO Manager", "AI Content Manager"],
    prepares: ["Import website context", "Find missing proof and conversion sections", "Draft page improvements", "Keep publishing draft-first"],
    routes: [
      { label: "Website Connector", href: "/app/website" },
      { label: "Growth Sites", href: "/app/sites" },
      { label: "SEO", href: "/app/seo" }
    ]
  },
  {
    title: "Reactivate old leads",
    ownerWords: "Follow up with everyone from last month.",
    employees: ["AI Sales Assistant", "AI Follow-Up Manager", "AI Receptionist"],
    prepares: ["Find stale leads", "Draft reply options", "Queue callback tasks", "Keep customer messages behind review"],
    routes: [
      { label: "Sales Console", href: "/app/operator" },
      { label: "Leads", href: "/app/leads" },
      { label: "Action Queue", href: "/app/actions" }
    ]
  },
  {
    title: "Set up my business",
    ownerWords: "Set up my roofing company.",
    employees: ["AI Business Setup Manager", "AI Automation Manager", "AI Growth Manager"],
    prepares: ["Build business profile", "Create services and service areas", "Prepare forms, templates, workflows, reviews, and SEO drafts", "Show preview before applying"],
    routes: [
      { label: "Let Ferocity set it up", href: "/app/build-system" },
      { label: "Setup", href: "/app/setup" },
      { label: "Go Live Check", href: "/app/go-live" }
    ]
  },
  {
    title: "Track jobs, bids, and profit",
    ownerWords: "Help me track jobs, bids, materials, money paid out, and profit.",
    employees: ["AI Office Manager", "AI Job Coordinator", "AI Finance Helper"],
    prepares: ["Open the simple job tracker", "Surface bids, job costs, worker payments, customer balances, and materials", "Route field costs and proof to owner review", "Keep detailed work records available for office staff"],
    routes: [
      { label: "Jobs & Money", href: "/app/job-tracker" },
      { label: "Work Records", href: "/app/service" },
      { label: "Cash Collection", href: "/app/cash-collection" }
    ]
  },
  {
    title: "Collect money and follow up",
    ownerWords: "Show who owes money and help me send reminders.",
    employees: ["AI Collections Helper", "AI Follow-Up Manager", "AI Office Manager"],
    prepares: ["Find unpaid invoices and customer balances", "Prepare reminder drafts without sending automatically", "Show payment-link readiness and manual payment records", "Track how many follow-ups happened"],
    routes: [
      { label: "Cash Collection", href: "/app/cash-collection" },
      { label: "Manual Text Drafts", href: "/app/text-queue" },
      { label: "Invoices And Ledger", href: "/app/cash-collection" }
    ]
  },
  {
    title: "Plan workers and the day",
    ownerWords: "Plan my workers for tomorrow and tell me who still needs an itinerary.",
    employees: ["AI Dispatch Helper", "AI Scheduling Helper", "AI Workforce Helper"],
    prepares: ["Check assignments and crew day plans", "Show workers missing an itinerary", "Route punch-in, mileage, field proof, and time review to the right tools", "Keep employee-facing actions simple"],
    routes: [
      { label: "Crew Day", href: "/app/crew-itinerary" },
      { label: "Employee View", href: "/app/employee" },
      { label: "Workers & Schedule", href: "/app/operations-workforce" }
    ]
  },
  {
    title: "Set reminders and owner tasks",
    ownerWords: "Remind me tomorrow to call a customer and check today's goals.",
    employees: ["AI Chief of Staff", "AI Reminder Helper", "AI Office Manager"],
    prepares: ["Open owner reminders and private tasks", "Route urgent items to Needs Attention", "Use push notification settings when available", "Keep personal owner tasks separate from customer records"],
    routes: [
      { label: "Private Owner Tasks", href: "/app/personal-ops" },
      { label: "Needs Attention", href: "/app/attention-command" },
      { label: "Notifications", href: "/app/notifications" }
    ]
  },
  {
    title: "Handle field costs and proof",
    ownerWords: "Let workers submit costs, mileage, photos, and proof from the field.",
    employees: ["AI Field Coordinator", "AI Office Manager", "AI Payroll Helper"],
    prepares: ["Open the employee-facing field view", "Route field costs and mileage to owner review", "Keep proof, photos, and job notes connected to work records", "Prepare payroll review without running payroll automatically"],
    routes: [
      { label: "Employee View", href: "/app/employee" },
      { label: "Field Costs / Proof", href: "/app/operations-workforce#field-work" },
      { label: "Payroll Review", href: "/app/operations-workforce#payroll" }
    ]
  }
];

function pickPlan(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("video") || lower.includes("reel") || lower.includes("commercial") || lower.includes("tiktok") || lower.includes("youtube") || lower.includes("auto post") || lower.includes("post it")) return commandPlans[0];
  if (lower.includes("receipt") || lower.includes("expense") || lower.includes("reimburse") || lower.includes("tax") || lower.includes("deduct")) return commandPlans[1];
  if (lower.includes("log my hours") || lower.includes("hours") || lower.includes("clock") || lower.includes("time card") || lower.includes("timesheet") || lower.includes("punch")) return commandPlans[2];
  if (lower.includes("remind") || lower.includes("goal") || lower.includes("tomorrow") || lower.includes("personal task")) return commandPlans[3];
  if (lower.includes("audit") || lower.includes("missing") || lower.includes("what do i need") || lower.includes("what next") || lower.includes("check everything")) return commandPlans[4];
  if (lower.includes("bid") || lower.includes("quote") || lower.includes("material") || lower.includes("profit") || lower.includes("job cost") || lower.includes("track jobs")) return commandPlans[11];
  if (lower.includes("owe") || lower.includes("collect") || lower.includes("unpaid") || lower.includes("invoice") || lower.includes("bill") || lower.includes("reminder text")) return commandPlans[12];
  if (lower.includes("worker") || lower.includes("crew") || lower.includes("itinerary") || lower.includes("schedule") || lower.includes("dispatch")) return commandPlans[13];
  if (lower.includes("field cost") || lower.includes("mileage") || lower.includes("proof") || lower.includes("photo") || lower.includes("payroll")) return commandPlans[15];
  if (lower.includes("review") || lower.includes("testimonial")) return commandPlans[6];
  if (lower.includes("storm") || lower.includes("campaign") || lower.includes("hail") || lower.includes("ad")) return commandPlans[7];
  if (lower.includes("website") || lower.includes("homepage") || lower.includes("page")) return commandPlans[8];
  if (lower.includes("old lead") || lower.includes("follow up") || lower.includes("last month") || lower.includes("reactivate")) return commandPlans[9];
  if (lower.includes("setup") || lower.includes("set up") || lower.includes("business")) return commandPlans[10];
  return commandPlans[5];
}

export function AiCommandPanel({
  title = "Ask Ferocity Anything. Tell It What To Do.",
  description = "Ask a question about the business or describe the outcome you want in normal words. Ferocity reads the Business Brain, routes the request to the right AI employees and systems, prepares safe work, and tells you what needs approval or more information.",
  initialCommand = "Show me what needs attention today, follow up with estimates losing momentum, and tell me what needs my approval.",
  submitLabel = "Prepare work in Ferocity"
}: {
  title?: string;
  description?: string;
  initialCommand?: string;
  submitLabel?: string;
}) {
  const [command, setCommand] = useState(initialCommand);
  const [executeState, executeAction, executePending] = useActionState(executeAiWorkforceCommandAction, { ok: false });
  const plan = useMemo(() => pickPlan(command), [command]);

  return (
    <section className="panel section-actions">
      <div className="list-row flush-row">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className="pill">preview first</span>
      </div>
      <form action={executeAction} className="two-col">
        <label>
          Your question or command
          <textarea name="command" value={command} onChange={(event) => setCommand(event.target.value)} rows={5} />
        </label>
        <div className="panel form-stack">
          <h3>
            <Eye size={16} /> Preview Plan
          </h3>
          <p>{plan.title}</p>
          <p className="muted">{plan.ownerWords}</p>
          <div className="inline-actions">
            {plan.employees.map((employee) => (
              <span className="pill" key={employee}>{employee}</span>
            ))}
          </div>
          <button className="button" type="submit" disabled={executePending}>
            {executePending ? "Preparing..." : submitLabel}
          </button>
          <p className="muted">Creates reviewed setup, reminder, receipt, job, marketing, SEO, or action records where appropriate. Live posting, spending, and sending still obey provider and approval controls.</p>
        </div>
      </form>
      {executeState.message ? (
        <section className={`panel ${executeState.ok ? "success-panel" : ""}`}>
          <div className="list-row flush-row">
            <div>
              <h3>{executeState.message}</h3>
              <p className="muted">Review the prepared work before anything goes live.</p>
            </div>
            <div className="button-row">
              <span className={`pill ${executeState.ok ? "" : "high"}`}>{executeState.intent === "read_only" ? "read only" : executeState.ok ? "prepared" : "needs attention"}</span>
              {executeState.href ? <Link className="mini-button" href={executeState.href}>Open view</Link> : null}
              {executeState.runId ? <Link className="mini-button" href={`/app/ai-workforce/results/${executeState.runId}`}>Open result</Link> : null}
            </div>
          </div>
          {executeState.prepared?.length ? (
            <ul className="list">
              {executeState.prepared.map((item) => (
                <li className="list-row" key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {executeState.blocked?.length ? (
            <ul className="list">
              {executeState.blocked.map((item) => (
                <li className="list-row" key={item}>
                  <span className="pill high">blocked</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <div className="grid">
        <section className="panel span-6">
          <h3>What Ferocity Would Prepare</h3>
          <ul className="list">
            {plan.prepares.map((item) => (
              <li className="list-row" key={item}>
                <ShieldCheck size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel span-6">
          <h3>Where To Review This</h3>
          <ul className="list">
            {plan.routes.map((route) => (
              <li className="list-row" key={route.href}>
                <strong>{route.label}</strong>
                <Link className="mini-button" href={route.href}>
                  Open <ArrowRight size={13} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
