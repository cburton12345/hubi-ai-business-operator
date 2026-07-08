import Link from "next/link";
import { logoutUser } from "@/app/login/actions";
import { switchWorkspaceAction } from "@/app/app/workspace/actions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace, getWorkspaceOptions } from "@/lib/workspace/current-workspace";

const commandShortcuts = [
  ["Show me what matters today", "/app/attention-command"],
  ["Create a quote", "/app/service"],
  ["Follow up with leads", "/app/lead-command"],
  ["Collect unpaid invoices", "/app/cash-collection"],
  ["Plan today's workers", "/app/crew-itinerary"]
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, workspace, workspaces] = await Promise.all([
    getCurrentAppSession(),
    getCurrentWorkspace(),
    getWorkspaceOptions()
  ]);

  return (
    <main className="page-shell">
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/app" className="brand-mark">
            Ferocity
          </Link>
          <nav className="app-nav" aria-label="Ferocity workspace navigation">
            <Link href="/app">Command Center</Link>
            <Link href="/app/welcome">Start Here</Link>
            <Link href="/app/attention-command">Needs Attention</Link>
            <Link href="/app/ai-workforce">AI Workforce</Link>
            <Link href="/app/lead-command">Leads & Customers</Link>
            <Link href="/app/service-command">Jobs</Link>
            <Link href="/app/operations-workforce">Team</Link>
            <Link href="/app/cash-collection">Money</Link>
            <Link href="/app/growth-calendar">Growth</Link>
            <Link href="/app/reports">Insights</Link>
            <Link href="/app/settings">Settings</Link>
            <details className="nav-menu">
              <summary>More</summary>
              <div className="nav-menu-panel">
                <section>
                  <p>Start & AI</p>
                  <Link href="/app/welcome">Start Here</Link>
                  <Link href="/app/ai-workforce">AI Workforce</Link>
                  <Link href="/app/build-system">Guided Setup</Link>
                  <Link href="/app/autopilot">Autopilot</Link>
                  <Link href="/app/business-brain">Business Info</Link>
                  <Link href="/app/ai-monitoring">Daily Brief</Link>
                  <Link href="/app/notifications">Notifications</Link>
                  <Link href="/app/role-views">Choose A View</Link>
                  <Link href="/app/owner-command-center">Owner Events</Link>
                  <Link href="/app/personal-ops">Private Owner Tasks</Link>
                  <Link href="/app/automation-timeline">Automation Timeline</Link>
                  <Link href="/app/automation-command">Automation Rules</Link>
                  <Link href="/app/ai-walkthrough">AI Walkthrough</Link>
                  <Link href="/app/onboarding">Onboarding</Link>
                  <Link href="/app/sample-tour">Sample Tour</Link>
                  <Link href="/install">Install App</Link>
                </section>
                <section>
                  <p>Customers & Work</p>
                  <Link href="/app/attention-command">Needs Attention</Link>
                  <Link href="/app/lead-command">Leads & Customers</Link>
                  <Link href="/app/leads">Leads</Link>
                  <Link href="/app/service-command">Jobs</Link>
                  <Link href="/app/employee">Employee View</Link>
                  <Link href="/app/service">Add / Edit Work</Link>
                  <Link href="/app/crew-itinerary">Crew Day</Link>
                  <Link href="/app/calendar">Calendar</Link>
                  <Link href="/app/tasks">Tasks</Link>
                  <Link href="/app/operations-workforce">Team & Schedule</Link>
                  <Link href="/app/labor-bench">Labor Bench</Link>
                  <Link href="/app/job-tracker">Jobs & Money</Link>
                  <Link href="/app/cash-collection">Cash Collection</Link>
                  <Link href="/app/operations-workforce#time-clock">Punch In / Out</Link>
                  <Link href="/app/operations-workforce#schedule">Schedule Work</Link>
                  <Link href="/app/operations-workforce#field-work">Field Costs / Proof</Link>
                  <Link href="/app/operations-workforce#payroll">Payroll Review</Link>
                  <Link href="/app/text-queue">Manual Text Drafts</Link>
                </section>
                <section>
                  <p>Growth & Customers</p>
                  <Link href="/app/customer-touchpoints">Website / Public Links</Link>
                  <Link href="/app/growth-calendar">Growth Calendar</Link>
                  <Link href="/app/publishing-hub">Publishing Queue</Link>
                  <Link href="/app/marketing-os">Marketing</Link>
                  <Link href="/app/website-grader">Assessments</Link>
                  <Link href="/app/website">Website Connector</Link>
                  <Link href="/app/proof">Customer Proof</Link>
                  <Link href="/app/marketing">Marketing AI</Link>
                  <Link href="/app/seo">SEO</Link>
                  <Link href="/app/sites">Growth Sites</Link>
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
                  <Link href="/app/runbooks">Runbooks</Link>
                  <Link href="/app/operator-depth">Advanced Diagnostics</Link>
                  <Link href="/app/actions">Action Queue</Link>
                  <Link href="/app/reports">Reports</Link>
                  <Link href="/app/recommendations">Recommendations</Link>
                </section>
                <section>
                  <p>Settings</p>
                  <Link href="/app/setup">Setup</Link>
                  <Link href="/app/business-brain">Business Info</Link>
                  <Link href="/app/brands">Brands</Link>
                  <Link href="/app/workspaces">Workspaces</Link>
                  <Link href="/app/integrations">Integrations</Link>
                  <Link href="/app/controls">Controls</Link>
                  <Link href="/app/billing">Billing</Link>
                  <Link href="/app/access">Access</Link>
                  <Link href="/app/access-requests">Public Requests</Link>
                  <Link href="/app/credentials">Credentials</Link>
                  <Link href="/app/webhooks">Webhooks</Link>
                  <Link href="/app/exports">Backups / Exports</Link>
                </section>
                <section>
                  <p>Advanced</p>
                  <Link href="/app/feature-map">Feature Map</Link>
                  <Link href="/app/safety-readiness">Safety & Readiness</Link>
                  <Link href="/app/system-health">System Health</Link>
                  <Link href="/app/go-live">Go Live</Link>
                  <Link href="/app/qa">Operational QA</Link>
                  <Link href="/app/safety">Safety</Link>
                  <Link href="/app/lifeops-connections">Connected Systems</Link>
                  <Link href="/app/beta">Beta</Link>
                </section>
              </div>
            </details>
          </nav>
          <form action={switchWorkspaceAction} className="workspace-switcher">
            <input name="next" type="hidden" value="/app" />
            <select name="workspaceId" defaultValue={workspace.id}>
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
          <Link className="button app-builder-button" href="/app/ai-workforce">
            AI Workforce
          </Link>
          <div className="session-chip">
            <strong>{workspace.name}</strong>
            <span className="muted">{session ? `${session.email} / ${workspace.role}` : `Admin token / ${workspace.role}`}</span>
          </div>
          <form action={logoutUser}>
            <button className="mini-button" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <section className="operator-command-strip panel" aria-label="Ferocity command shortcuts">
          <Link className="operator-command-input" href="/app/ai-workforce">
            <span>Ferocity checks the business and suggests the next move.</span>
            <strong>Open AI Workforce</strong>
          </Link>
          <div className="operator-command-chips">
            {commandShortcuts.map(([label, href]) => (
              <Link href={href} key={label}>{label}</Link>
            ))}
          </div>
        </section>
        {children}
      </section>
    </main>
  );
}
