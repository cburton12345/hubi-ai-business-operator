import Link from "next/link";
import { logoutUser } from "@/app/login/actions";
import { switchWorkspaceAction } from "@/app/app/workspace/actions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace, getWorkspaceOptions } from "@/lib/workspace/current-workspace";

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
            Ferocity Operator
          </Link>
          <nav className="app-nav" aria-label="Ferocity workspace navigation">
            <Link href="/app">Home</Link>
            <Link href="/app/build-system">Build My System</Link>
            <Link href="/app/operator">Operator Console</Link>
            <Link href="/app/growth">Growth Loop</Link>
            <Link href="/app/service">Service Ops</Link>
            <Link href="/app/go-live">Go Live</Link>
            <Link href="/app/system-health">System Health</Link>
            <Link href="/app/reports">Reports</Link>
            <details className="nav-menu">
              <summary>More</summary>
              <div className="nav-menu-panel">
                <section>
                  <p>Start</p>
                  <Link href="/app/welcome">Welcome</Link>
                  <Link href="/app/onboarding">Onboarding</Link>
                  <Link href="/app/access-requests">Access Requests</Link>
                  <Link href="/app/setup">Setup</Link>
                  <Link href="/app/sample-tour">Sample Tour</Link>
                </section>
                <section>
                  <p>Daily Work</p>
                  <Link href="/app/leads">Leads</Link>
                  <Link href="/app/actions">Action Queue</Link>
                  <Link href="/app/calendar">Calendar</Link>
                  <Link href="/app/tasks">Tasks</Link>
                </section>
                <section>
                  <p>Growth</p>
                  <Link href="/app/website">Website Connector</Link>
                  <Link href="/app/proof">Customer Proof</Link>
                  <Link href="/app/marketing">AI Operator</Link>
                  <Link href="/app/seo">SEO Autopilot</Link>
                  <Link href="/app/sites">Growth Sites</Link>
                  <Link href="/app/review">Reviews</Link>
                </section>
                <section>
                  <p>Automations</p>
                  <Link href="/app/automation">Automation</Link>
                  <Link href="/app/workflows">Workflows</Link>
                  <Link href="/app/alerts">Alerts</Link>
                  <Link href="/app/runbooks">Runbooks</Link>
                </section>
                <section>
                  <p>Settings</p>
                  <Link href="/app/brands">Brands</Link>
                  <Link href="/app/workspaces">Workspaces</Link>
                  <Link href="/app/integrations">Integrations</Link>
                  <Link href="/app/controls">Controls</Link>
                  <Link href="/app/billing">Billing</Link>
                  <Link href="/app/access">Access</Link>
                  <Link href="/app/access-requests">Public Requests</Link>
                </section>
                <section>
                  <p>Health</p>
                  <Link href="/app/system-health">System Health</Link>
                  <Link href="/app/go-live">Go Live</Link>
                  <Link href="/app/qa">Operational QA</Link>
                  <Link href="/app/safety">Safety</Link>
                  <Link href="/app/credentials">Credentials</Link>
                  <Link href="/app/webhooks">Webhooks</Link>
                  <Link href="/app/exports">Exports</Link>
                  <Link href="/app/beta">Beta</Link>
                  <Link href="/app/settings">Settings</Link>
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
          <Link className="button app-builder-button" href="/app/build-system">
            Build My System
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
        {children}
      </section>
    </main>
  );
}
