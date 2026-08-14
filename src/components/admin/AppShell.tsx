import Link from "next/link";
import { headers } from "next/headers";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { logoutUser } from "@/app/login/actions";
import { switchWorkspaceAction } from "@/app/app/workspace/actions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace, getWorkspaceOptions } from "@/lib/workspace/current-workspace";
import { getWorkspacePlanKey } from "@/lib/controls/service-gates";
import packageJson from "../../../package.json";

const commandShortcuts = [
  ["Show me what matters today", "/app/attention-command"],
  ["Create an estimate", "/app/job-tracker#new-estimate"],
  ["Check job health", "/app/job-tracker/health"],
  ["Collect unpaid invoices", "/app/cash-collection"],
];

const primaryNavigation = [
  { label: "Today", href: "/app", paths: ["/app", "/app/attention-command"] },
  { label: "Customers", href: "/app/lead-command", paths: ["/app/lead-command", "/app/leads", "/app/messaging"] },
  { label: "Schedule", href: "/app/schedule", paths: ["/app/schedule"] },
  {
    label: "Work",
    href: "/app/job-tracker",
    paths: ["/app/job-tracker", "/app/service", "/app/estimator", "/app/operations-workforce", "/app/purchasing"]
  },
  { label: "Money", href: "/app/cash-collection", paths: ["/app/cash-collection", "/app/billing"] },
  {
    label: "Growth",
    href: "/app/growth",
    paths: ["/app/growth", "/app/marketing", "/app/seo", "/app/review", "/app/authority", "/app/revenue-growth"]
  },
  { label: "Insights", href: "/app/reports", paths: ["/app/reports"] }
] as const;

const callsToolSections = [
  {
    label: "Calls",
    links: [
      ["Call inbox", "/app/calls"],
      ["AI Office Manager", "/app/office-manager"],
      ["Phone setup", "/app/receptionist-setup"],
      ["Ask Ferocity", "/app/ferocity"]
    ]
  },
  {
    label: "Customers",
    links: [
      ["Leads & Customers", "/app/lead-command"],
      ["Conversations", "/app/messaging"],
      ["Appointments", "/app/schedule"],
      ["Follow-up queue", "/app/actions"]
    ]
  },
  {
    label: "Settings",
    links: [
      ["Connections", "/app/integrations"],
      ["Authority", "/app/controls"],
      ["Plan & usage", "/app/billing"],
      ["Team access", "/app/access"]
    ]
  }
] as const;

function matchesNavigationPath(currentPath: string, paths: readonly string[]) {
  return paths.some((path) => currentPath === path || (path !== "/app" && currentPath.startsWith(`${path}/`)));
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, workspace, workspaces, requestHeaders] = await Promise.all([
    getCurrentAppSession(),
    getCurrentWorkspace(),
    getWorkspaceOptions(),
    headers()
  ]);
  const releaseId = (process.env.DEPLOY_ID || process.env.COMMIT_REF || "local").slice(0, 8);
  const workspacePlan = await getWorkspacePlanKey(workspace.id);
  const callsOnly = workspacePlan === "calls";
  const currentPath = requestHeaders.get("x-ferocity-app-path")?.split("?")[0] ?? "/app";
  const showCompactCommand = currentPath !== "/app" && currentPath !== "/app/ferocity";
  const isPlatformAdmin = !session || session.platformRole === "super_admin";

  return (
    <main className="page-shell">
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/app" className="brand-mark">
            Ferocity
          </Link>
          <nav className="app-nav" aria-label="Ferocity workspace navigation">
            {(callsOnly ? [
              { label: "Today", href: "/app", paths: ["/app", "/app/attention-command"] },
              { label: "Calls", href: "/app/calls", paths: ["/app/calls", "/app/office-manager"] },
              { label: "Contacts", href: "/app/lead-command", paths: ["/app/lead-command", "/app/leads", "/app/messaging"] },
              { label: "Schedule", href: "/app/schedule", paths: ["/app/schedule"] }
            ] : primaryNavigation).map((item) => {
              const active = matchesNavigationPath(currentPath, item.paths);
              return (
                <Link href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
            <details className="nav-menu">
              <summary>All Tools</summary>
              <div className="nav-menu-panel">
                {callsOnly ? callsToolSections.map((section) => (
                  <section key={section.label}>
                    <p>{section.label}</p>
                    {section.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
                  </section>
                )) : <>
                <section>
                  <p>Start & AI</p>
                  <Link href="/app/welcome">Start Here</Link>
                  <Link href="/app/ferocity">Ask Ferocity</Link>
                  <Link href="/app/office-manager">AI Office Manager</Link>
                  <Link href="/app/managed-operator">Managed Operator</Link>
                  <Link href="/app/build-system">Guided Setup</Link>
                  <Link href="/app/gap-scan">Business Gap Scan</Link>
                  <Link href="/app/autopilot">Autopilot</Link>
                  <Link href="/app/business-brain">Business Info</Link>
                  <Link href="/app/ai-monitoring">Daily Brief</Link>
                  <Link href="/app/feature-readiness">What Works Now</Link>
                  <Link href="/install">Install App</Link>
                </section>
                <section>
                  <p>Customers & Work</p>
                  <Link href="/app/lead-command">Leads & Customers</Link>
                  <Link href="/app/job-tracker">Jobs & Money</Link>
                  <Link href="/app/job-tracker/health">Construction Job Health</Link>
                  <Link href="/app/estimator">AI Estimator</Link>
                  <Link href="/app/pricebook">Pricebook & Memberships</Link>
                  <Link href="/app/purchasing">Purchasing & Accounting</Link>
                  <Link href="/employee">Employee App</Link>
                  <Link href="/app/schedule">Schedule & Dispatch</Link>
                  <Link href="/app/calendar">Marketing / AI Calendar</Link>
                  <Link href="/app/team">Hiring & Team Readiness</Link>
                  <Link href="/app/labor-bench">Labor Bench</Link>
                  <Link href="/app/messaging">Messaging Engine</Link>
                </section>
                <section>
                  <p>Growth</p>
                  <Link href="/app/customer-touchpoints">Website / Public Links</Link>
                  <Link href="/app/growth-funnels">Growth Funnels</Link>
                  <Link href="/app/revenue-growth">Revenue Growth</Link>
                  <Link href="/app/authority">Authority Engine</Link>
                  <Link href="/app/authority/links">Backlinks & Link Authority</Link>
                  <Link href="/app/publishing-hub">Publishing Queue</Link>
                  <Link href="/app/marketing-os">Marketing</Link>
                  <Link href="/app/website-grader">Assessments</Link>
                  <Link href="/app/proof">Customer Proof</Link>
                  <Link href="/app/seo">SEO</Link>
                  <Link href="/app/review">Reviews</Link>
                  <Link href="/app/forms">Forms</Link>
                </section>
                <section>
                  <p>Automation & Insights</p>
                  <Link href="/app/automation">Automation</Link>
                  <Link href="/app/automation-command">Automation Rules</Link>
                  <Link href="/app/automation-timeline">Automation Timeline</Link>
                  <Link href="/app/workflows">Workflows</Link>
                  <Link href="/app/alerts">Alerts</Link>
                  <Link href="/app/actions">Action Queue</Link>
                  <Link href="/app/reports">Reports</Link>
                  <Link href="/app/recommendations">Recommendations</Link>
                </section>
                <section>
                  <p>Settings</p>
                  <Link href="/app/setup">Setup</Link>
                  <Link href="/app/brands">Brands</Link>
                  {workspaces.length > 1 ? <Link href="/app/workspaces">Businesses</Link> : null}
                  <Link href="/app/integrations">Integrations</Link>
                  <Link href="/app/controls">Controls</Link>
                  <Link href="/app/ai-control">AI Cost Controls</Link>
                  <Link href="/app/billing">Billing</Link>
                  <Link href="/app/access">Team Access</Link>
                  <Link href="/app/credentials">Connected Account Keys</Link>
                  <Link href="/app/exports">Backups / Exports</Link>
                </section>
                {isPlatformAdmin ? (
                  <section>
                    <p>Advanced</p>
                    <Link href="/app/safety-readiness">Safety & Readiness</Link>
                    <Link href="/app/system-health">System Health</Link>
                    <Link href="/app/go-live">Go Live</Link>
                    <Link href="/app/qa">Operational QA</Link>
                    <Link href="/app/operator-depth">Advanced Diagnostics</Link>
                    <Link href="/app/webhooks">Webhooks</Link>
                    <Link href="/app/lifeops-connections">Connected Systems</Link>
                  </section>
                ) : null}
                </>}
              </div>
            </details>
          </nav>
          {workspaces.length > 1 ? (
            <form action={switchWorkspaceAction} className="workspace-switcher">
              <input name="next" type="hidden" value="/app" />
              <select name="workspaceId" defaultValue={workspace.id} aria-label="Current business">
                {workspaces.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <button className="mini-button" type="submit">
                Switch
              </button>
            </form>
          ) : null}
          <div className="session-chip">
            <strong>{workspace.name}</strong>
            <span className="muted">{session ? `Signed in as ${session.email}` : "Platform recovery session"}</span>
            {isPlatformAdmin ? (
              <span className="muted" title="Use this when reporting a display or deployment mismatch.">
                Ferocity v{packageJson.version} / {releaseId}
              </span>
            ) : null}
          </div>
          <form action={logoutUser}>
            <button className="mini-button" type="submit">
              Sign out
            </button>
          </form>
        </header>
        {showCompactCommand ? (
          <section className="operator-command-strip panel" aria-label="Ferocity command shortcuts">
            <div className="operator-command-title">
              <strong>Ask Ferocity anything. Tell it what to do.</strong>
              <span>Use normal words—Ferocity finds the right people, AI employees, and tools.</span>
            </div>
            <form className="operator-command-input" action={executeAiWorkforceCommandSimpleAction}>
              <label className="sr-only" htmlFor="ferocity-command">Ask Ferocity a question or tell it what to do</label>
              <input
                id="ferocity-command"
                name="command"
                placeholder="Ask a question or describe what you want done..."
                minLength={8}
                maxLength={2000}
                required
              />
              <button className="mini-button" type="submit">Send to Ferocity</button>
            </form>
            <div className="operator-command-chips">
              {commandShortcuts.map(([label, href]) => (
                <Link href={href} key={label}>{label}</Link>
              ))}
            </div>
          </section>
        ) : null}
        {children}
      </section>
    </main>
  );
}
