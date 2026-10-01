import Link from "next/link";
import { headers } from "next/headers";
import { FerocityBrandMark } from "@/components/public/FerocityBrandMark";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { logoutUser } from "@/app/login/actions";
import { switchWorkspaceAction } from "@/app/app/workspace/actions";
import { getCurrentAppSession } from "@/lib/auth/session";
import {
  getCurrentWorkspace,
  getWorkspaceOptions,
} from "@/lib/workspace/current-workspace";
import { getWorkspacePlanKey } from "@/lib/controls/service-gates";
import packageJson from "../../../package.json";

const commandShortcuts = [
  ["Show me what matters today", "/app/attention-command"],
  ["Create an estimate", "/app/job-tracker#new-estimate"],
  ["Check job health", "/app/job-tracker/health"],
  ["Collect unpaid invoices", "/app/cash-collection"],
];

const primaryNavigation = [
  { label: "Ask Ferocity", href: "/app/ferocity", paths: ["/app/ferocity"] },
  { label: "Today", href: "/app", paths: ["/app", "/app/attention-command"] },
  {
    label: "Customers",
    href: "/app/lead-command",
    paths: ["/app/lead-command", "/app/leads", "/app/messaging"],
  },
  { label: "Schedule", href: "/app/schedule", paths: ["/app/schedule"] },
  {
    label: "Work",
    href: "/app/job-tracker",
    paths: [
      "/app/job-tracker",
      "/app/service",
      "/app/estimator",
      "/app/operations-workforce",
      "/app/purchasing",
    ],
  },
  {
    label: "Money",
    href: "/app/cash-collection",
    paths: ["/app/cash-collection", "/app/billing", "/app/expenses"],
  },
  {
    label: "Growth",
    href: "/app/growth",
    paths: [
      "/app/growth",
      "/app/marketing",
      "/app/seo",
      "/app/review",
      "/app/authority",
      "/app/revenue-growth",
    ],
  },
  { label: "Insights", href: "/app/reports", paths: ["/app/reports"] },
] as const;

const customerNavigation = [
  { label: "Ask Ferocity", href: "/app/ferocity", paths: ["/app/ferocity"] },
  {
    label: "Today",
    href: "/app/attention-command",
    paths: ["/app/attention-command"],
  },
  {
    label: "Customers",
    href: "/app/lead-command",
    paths: ["/app/lead-command", "/app/leads", "/app/messaging"],
  },
  {
    label: "Work",
    href: "/app/job-tracker",
    paths: ["/app/job-tracker", "/app/service", "/app/operations-workforce"],
  },
] as const;

const fieldNavigation = [
  { label: "Ask Ferocity", href: "/app/ferocity", paths: ["/app/ferocity"] },
  {
    label: "Today",
    href: "/app/attention-command",
    paths: ["/app/attention-command"],
  },
  {
    label: "My work",
    href: "/app/operations-workforce",
    paths: ["/app/operations-workforce", "/app/schedule"],
  },
] as const;

const callsToolSections = [
  {
    label: "Calls",
    links: [
      ["Call inbox", "/app/calls"],
      ["AI Office Manager", "/app/office-manager"],
      ["Phone setup", "/app/receptionist-setup"],
      ["Ask Ferocity", "/app/ferocity"],
    ],
  },
  {
    label: "Customers",
    links: [
      ["Leads & Customers", "/app/lead-command"],
      ["Conversations", "/app/messaging"],
      ["Appointments", "/app/schedule"],
      ["Follow-up queue", "/app/actions"],
    ],
  },
  {
    label: "Settings",
    links: [
      ["Connections", "/app/integrations"],
      ["Authority", "/app/controls"],
      ["Plan & usage", "/app/billing"],
      ["Team access", "/app/access"],
    ],
  },
] as const;

const customerToolSections = [
  {
    label: "Business",
    links: [
      ["Schedule", "/app/schedule"],
      ["Money", "/app/cash-collection"],
      ["Growth", "/app/growth"],
      ["Reports", "/app/reports"],
    ],
  },
  {
    label: "Phone & team",
    links: [
      ["Calls", "/app/calls"],
      ["AI Office Manager", "/app/office-manager"],
      ["Field Team", "/employee"],
      ["Team", "/app/team"],
    ],
  },
  {
    label: "Setup & help",
    links: [
      ["Business setup", "/app/ferocity?onboarding=1"],
      ["Connections", "/app/integrations"],
      ["Approvals & controls", "/app/controls"],
      ["Plan & usage", "/app/billing"],
      ["Help", "/app/support"],
    ],
  },
] as const;

const fieldToolSections = [
  {
    label: "My work",
    links: [
      ["Hours & assignments", "/app/operations-workforce"],
      ["Schedule", "/app/schedule"],
      ["Field view", "/employee"],
    ],
  },
  {
    label: "Help",
    links: [
      ["Get help", "/app/support"],
      ["My connections", "/app/integrations"],
    ],
  },
] as const;

function matchesNavigationPath(currentPath: string, paths: readonly string[]) {
  return paths.some(
    (path) =>
      currentPath === path ||
      (path !== "/app" && currentPath.startsWith(`${path}/`)),
  );
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, workspace, workspaces, requestHeaders] = await Promise.all([
    getCurrentAppSession(),
    getCurrentWorkspace(),
    getWorkspaceOptions(),
    headers(),
  ]);
  const releaseId = (
    process.env.DEPLOY_ID ||
    process.env.COMMIT_REF ||
    "local"
  ).slice(0, 8);
  const workspacePlan = await getWorkspacePlanKey(workspace.id);
  const callsOnly = workspacePlan === "calls";
  const requestPath = requestHeaders.get("x-ferocity-app-path") ?? "/app";
  const currentPath = requestPath.split("?")[0];
  const onboardingExperience =
    currentPath === "/app/ferocity" && requestPath.includes("onboarding=1");
  const showCompactCommand =
    currentPath !== "/app" && currentPath !== "/app/ferocity";
  const isPlatformAdmin = !session || session.platformRole === "super_admin";
  const simpleCustomerExperience =
    workspace.accountType === "customer" && !isPlatformAdmin;
  const roleNeedsSimpleFieldView =
    simpleCustomerExperience &&
    ["member", "employee", "field", "viewer"].includes(workspace.role);
  const visibleNavigation = callsOnly
    ? [
        {
          label: "Ask Ferocity",
          href: "/app/ferocity",
          paths: ["/app/ferocity"],
        },
        {
          label: "Today",
          href: "/app",
          paths: ["/app", "/app/attention-command"],
        },
        {
          label: "Calls",
          href: "/app/calls",
          paths: ["/app/calls", "/app/office-manager"],
        },
        {
          label: "Contacts",
          href: "/app/lead-command",
          paths: ["/app/lead-command", "/app/leads", "/app/messaging"],
        },
        { label: "Schedule", href: "/app/schedule", paths: ["/app/schedule"] },
      ]
    : roleNeedsSimpleFieldView
      ? fieldNavigation
      : simpleCustomerExperience
        ? customerNavigation
        : primaryNavigation;

  return (
    <main className="page-shell">
      <a className="skip-link" href="#ferocity-workspace-content">
        Skip to workspace
      </a>
      <section className="workspace">
        <header
          className={`app-shell-header panel${simpleCustomerExperience ? " customer-shell-header" : ""}`}
        >
          <FerocityBrandMark
            compact
            href={simpleCustomerExperience ? "/app/ferocity" : "/app"}
          />
          {!onboardingExperience ? (
            <nav className="app-nav" aria-label="Ferocity workspace navigation">
              {visibleNavigation.map((item) => {
                const active = matchesNavigationPath(currentPath, item.paths);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <details className="nav-menu">
                <summary
                  aria-label={
                    simpleCustomerExperience
                      ? "Open more workspace areas"
                      : "Open all tools"
                  }
                >
                  {simpleCustomerExperience ? "More" : "All Tools"}
                </summary>
                <div className="nav-menu-panel">
                  {callsOnly ? (
                    callsToolSections.map((section) => (
                      <section key={section.label}>
                        <p>{section.label}</p>
                        {section.links.map(([label, href]) => (
                          <Link
                            aria-current={
                              matchesNavigationPath(currentPath, [href])
                                ? "page"
                                : undefined
                            }
                            key={href}
                            href={href}
                          >
                            {label}
                          </Link>
                        ))}
                      </section>
                    ))
                  ) : roleNeedsSimpleFieldView ? (
                    fieldToolSections.map((section) => (
                      <section key={section.label}>
                        <p>{section.label}</p>
                        {section.links.map(([label, href]) => (
                          <Link
                            aria-current={
                              matchesNavigationPath(currentPath, [href])
                                ? "page"
                                : undefined
                            }
                            key={href}
                            href={href}
                          >
                            {label}
                          </Link>
                        ))}
                      </section>
                    ))
                  ) : simpleCustomerExperience ? (
                    customerToolSections.map((section) => (
                      <section key={section.label}>
                        <p>{section.label}</p>
                        {section.links.map(([label, href]) => (
                          <Link
                            aria-current={
                              matchesNavigationPath(currentPath, [href])
                                ? "page"
                                : undefined
                            }
                            key={href}
                            href={href}
                          >
                            {label}
                          </Link>
                        ))}
                      </section>
                    ))
                  ) : (
                    <>
                      <section>
                        <p>Start & AI</p>
                        <Link href="/app/welcome">Start Here</Link>
                        <Link href="/app/ferocity">Ask Ferocity</Link>
                        <Link href="/app/office-manager">
                          AI Office Manager
                        </Link>
                        <Link href="/app/managed-operator">
                          Managed Operator
                        </Link>
                        <Link href="/app/build-system">Guided Setup</Link>
                        <Link href="/app/gap-scan">Business Gap Scan</Link>
                        <Link href="/app/autopilot">Autopilot</Link>
                        <Link href="/app/business-brain">Business Info</Link>
                        <Link href="/app/ai-monitoring">Daily Brief</Link>
                        <Link href="/install">Install App</Link>
                      </section>
                      <section>
                        <p>Customers & Work</p>
                        <Link href="/app/lead-command">Leads & Customers</Link>
                        <Link href="/app/job-tracker">Jobs & Money</Link>
                        <Link href="/app/estimator">AI Estimator</Link>
                        <Link href="/app/pricebook">
                          Pricebook & Memberships
                        </Link>
                        <Link href="/app/purchasing">
                          Purchasing & Accounting
                        </Link>
                        <Link href="/app/expenses">Receipts & Expenses</Link>
                        <Link href="/employee">Field Team</Link>
                        <Link href="/app/schedule">Schedule & Dispatch</Link>
                        <Link href="/app/calendar">
                          Marketing / AI Calendar
                        </Link>
                        <Link href="/app/team">Hiring & Team Readiness</Link>
                        <Link href="/app/labor-bench">Labor Bench</Link>
                        <Link href="/app/messaging">Messaging Engine</Link>
                        <Link href="/app/email-watch">Email Watch</Link>
                      </section>
                      <section>
                        <p>Growth</p>
                        <Link href="/app/customer-touchpoints">
                          Website / Public Links
                        </Link>
                        <Link href="/app/growth-funnels">Growth Funnels</Link>
                        <Link href="/app/revenue-growth">Revenue Growth</Link>
                        <Link href="/app/authority">Authority Engine</Link>
                        <Link href="/app/publishing-hub">Publishing Queue</Link>
                        <Link href="/app/marketing-os">Marketing</Link>
                        <Link href="/app/website-grader">Assessments</Link>
                        <Link href="/app/proof">Customer Proof</Link>
                        <Link href="/app/seo">SEO</Link>
                        <Link href="/app/local-presence">Local Presence</Link>
                        <Link href="/app/review">Reviews</Link>
                        <Link href="/app/forms">Forms</Link>
                      </section>
                      <section>
                        <p>Automation & Insights</p>
                        <Link href="/app/automation">Automation</Link>
                        <Link href="/app/automation-command">
                          Automation Rules
                        </Link>
                        <Link href="/app/automation-timeline">
                          Automation Timeline
                        </Link>
                        <Link href="/app/workflows">Workflows</Link>
                        <Link href="/app/alerts">Alerts</Link>
                        <Link href="/app/actions">Action Queue</Link>
                        <Link href="/app/reports">Reports</Link>
                        <Link href="/app/recommendations">Recommendations</Link>
                      </section>
                      <section>
                        <p>Settings</p>
                        <Link href="/app/brands">Brands</Link>
                        {workspaces.length > 1 ? (
                          <Link href="/app/workspaces">Businesses</Link>
                        ) : null}
                        <Link href="/app/integrations">Integrations</Link>
                        <Link href="/app/controls">Controls</Link>
                        <Link href="/app/ai-control">AI Cost Controls</Link>
                        <Link href="/app/billing">Billing</Link>
                        <Link href="/app/support">Get Help</Link>
                        <Link href="/app/access">Team Access</Link>
                        <Link href="/app/credentials">
                          Connected Account Keys
                        </Link>
                        <Link href="/app/exports">Backups / Exports</Link>
                      </section>
                      {isPlatformAdmin ? (
                        <section>
                          <p>Advanced</p>
                          <Link href="/app/safety-readiness">
                            Safety & Readiness
                          </Link>
                          <Link href="/app/platform-activity">
                            Visitors, Sales & Support
                          </Link>
                          <Link href="/app/system-health">System Health</Link>
                          <Link href="/app/go-live">Go Live</Link>
                          <Link href="/app/qa">Operational QA</Link>
                          <Link href="/app/webhooks">Webhooks</Link>
                          <Link href="/app/lifeops-connections">
                            Connected Systems
                          </Link>
                        </section>
                      ) : null}
                    </>
                  )}
                </div>
              </details>
            </nav>
          ) : null}
          {!onboardingExperience && workspaces.length > 1 ? (
            <form action={switchWorkspaceAction} className="workspace-switcher">
              <input name="next" type="hidden" value="/app" />
              <select
                name="workspaceId"
                defaultValue={workspace.id}
                aria-label="Current business"
              >
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
            <span className="workspace-context-label">
              {workspace.accountType === "internal"
                ? "Internal portfolio"
                : workspace.accountType === "customer"
                  ? "Customer workspace"
                  : `${workspace.accountType} workspace`}
              {isPlatformAdmin ? " · Platform admin" : ""}
            </span>
            <span className="muted">
              {simpleCustomerExperience
                ? `${workspace.role.charAt(0).toUpperCase()}${workspace.role.slice(1)} access`
                : session
                  ? `Signed in as ${session.email}`
                  : "Platform recovery session"}
            </span>
            {isPlatformAdmin ? (
              <span
                className="muted"
                title="Use this when reporting a display or deployment mismatch."
              >
                Ferocity v{packageJson.version} / {releaseId}
              </span>
            ) : null}
          </div>
          {!onboardingExperience && !simpleCustomerExperience ? (
            <Link className="mini-button" href="/employee">
              Field team
            </Link>
          ) : null}
          <form action={logoutUser}>
            <button className="mini-button" type="submit">
              Sign out
            </button>
          </form>
        </header>
        {showCompactCommand && !simpleCustomerExperience ? (
          <section
            className="operator-command-strip panel"
            aria-label="Ferocity command shortcuts"
          >
            <div className="operator-command-title">
              <strong>Ask Ferocity anything. Tell it what to do.</strong>
              <span>
                Use normal words—Ferocity reads the business, finds the right
                department and tools, and moves authorized work forward.
              </span>
            </div>
            <form
              className="operator-command-input"
              action={executeAiWorkforceCommandSimpleAction}
            >
              <label className="sr-only" htmlFor="ferocity-command">
                Ask Ferocity a question or tell it what to do
              </label>
              <input
                id="ferocity-command"
                name="command"
                placeholder="Ask a question or describe what you want done..."
                minLength={8}
                maxLength={2000}
                required
              />
              <button className="mini-button" type="submit">
                Send to Ferocity
              </button>
            </form>
            <div className="operator-command-chips">
              {commandShortcuts.map(([label, href]) => (
                <Link href={href} key={label}>
                  {label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        <div id="ferocity-workspace-content" tabIndex={-1}>
          {children}
        </div>
      </section>
    </main>
  );
}
