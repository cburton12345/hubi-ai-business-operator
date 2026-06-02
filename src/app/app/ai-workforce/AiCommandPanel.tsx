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
    title: "Get more leads",
    ownerWords: "Get me more roofing leads.",
    employees: ["AI Growth Manager", "AI SEO Manager", "AI Marketing Manager", "AI Ad Manager"],
    prepares: ["Review current lead sources", "Find SEO/service-area gaps", "Create campaign ideas", "Prepare follow-up and attribution checks"],
    routes: [
      { label: "Growth Loop", href: "/app/growth" },
      { label: "Marketing OS", href: "/app/marketing-os" },
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
    prepares: ["Draft landing page", "Draft social and GBP posts", "Draft email/SMS copy", "Prepare ad copy and audience notes"],
    routes: [
      { label: "Marketing OS", href: "/app/marketing-os" },
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
    prepares: ["Find stale leads", "Draft reply options", "Queue callback tasks", "Keep email/SMS sends behind approval"],
    routes: [
      { label: "Operator Console", href: "/app/operator" },
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
      { label: "Build My System", href: "/app/build-system" },
      { label: "Setup", href: "/app/setup" },
      { label: "Go Live Check", href: "/app/go-live" }
    ]
  }
];

function pickPlan(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("review") || lower.includes("testimonial")) return commandPlans[1];
  if (lower.includes("storm") || lower.includes("campaign") || lower.includes("hail") || lower.includes("ad")) return commandPlans[2];
  if (lower.includes("website") || lower.includes("homepage") || lower.includes("page")) return commandPlans[3];
  if (lower.includes("old lead") || lower.includes("follow up") || lower.includes("last month") || lower.includes("reactivate")) return commandPlans[4];
  if (lower.includes("setup") || lower.includes("set up") || lower.includes("business")) return commandPlans[5];
  return commandPlans[0];
}

export function AiCommandPanel() {
  const [command, setCommand] = useState("Get me more roofing leads.");
  const [executeState, executeAction, executePending] = useActionState(executeAiWorkforceCommandAction, { ok: false });
  const plan = useMemo(() => pickPlan(command), [command]);

  return (
    <section className="panel section-actions">
      <div className="list-row flush-row">
        <div>
          <h2>Tell The AI Workforce What You Want</h2>
          <p className="muted">This preview does not send, publish, spend, or change records. It shows the safe plan and routes you to existing Ferocity systems.</p>
        </div>
        <span className="pill">preview first</span>
      </div>
      <form action={executeAction} className="two-col">
        <label>
          Owner command
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
            {executePending ? "Preparing..." : "Prepare work in Ferocity"}
          </button>
          <p className="muted">Creates reviewed setup/campaign/SEO/action records where appropriate. It does not send, publish, spend, or sync live.</p>
        </div>
      </form>
      {executeState.message ? (
        <section className={`panel ${executeState.ok ? "success-panel" : ""}`}>
          <div className="list-row flush-row">
            <div>
              <h3>{executeState.message}</h3>
              <p className="muted">Review the prepared records in Traditional Mode before anything goes live.</p>
            </div>
            <span className={`pill ${executeState.ok ? "" : "high"}`}>{executeState.ok ? "prepared" : "needs attention"}</span>
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
          <h3>Where This Maps In Traditional Mode</h3>
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
