import Link from "next/link";
import { Bot, Headphones, MessageSquareText, ShieldCheck, Sparkles, Timer, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getCallManagementDashboard } from "@/lib/office-manager/get-call-management";
import { getOfficeManagerDashboard } from "@/lib/office-manager/get-office-manager-dashboard";
import { prepareOfficeManagerAction } from "./actions";
import { CallManagementPanel } from "./CallManagementPanel";
import { VoiceAgentCustomizationForm } from "./VoiceAgentCustomizationForm";

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function OfficeManagerPage() {
  const [dashboard, callManagement] = await Promise.all([
    getOfficeManagerDashboard(),
    getCallManagementDashboard()
  ]);

  return (
    <QueuePageShell
      eyebrow="AI Office Manager"
      title="The AI Employee That Helps Run The Office"
      description="Voice is one channel. The real product is an AI office manager that watches customer work, prepares the next step, remembers context, and escalates what needs a human."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">One connected office</p>
            <h2>Phone, email, chat, SMS, owner commands, and app alerts share one memory.</h2>
            <p className="muted">
              Customers get natural service while Ferocity keeps the full conversation, follows business rules, and brings in a person with context when needed.
            </p>
          </div>
          <div className="button-row">
            <form action={prepareOfficeManagerAction}>
              <button className="button" type="submit">
                <Sparkles size={16} /> Prepare office manager
              </button>
            </form>
            <Link className="button secondary-button" href="/app/receptionist-setup">Setup</Link>
            <Link className="button secondary-button" href="/app/calls">Calls</Link>
            <Link className="button secondary-button" href="/app/ai-workforce">AI Workforce</Link>
            <Link className="button secondary-button" href="/app/actions">Action Queue</Link>
          </div>
        </div>
      </section>

      <CallManagementPanel dashboard={callManagement} />

      <section className="panel section-actions">
        <div>
          <p className="eyebrow">Sounds like your business</p>
          <h2>Customize the phone agent</h2>
          <p className="muted">
            Ferocity automatically uses the business’s industry knowledge and safety rules. Add the name, greeting,
            languages, priorities, and special instructions that make the agent fit this company.
          </p>
        </div>
        {dashboard.profile ? (
          <>
            <div className="status-grid compact-status-grid">
              <Info label="Industry context" value={dashboard.profile.industry} />
              <Info label="Knowledge behavior" value="Automatic and workspace-specific" />
              <Info label="Provider behavior" value="Applied to every connected voice service" />
            </div>
            <VoiceAgentCustomizationForm
              defaults={{
                profileId: dashboard.profile.id,
                displayName: dashboard.profile.displayName,
                greeting: dashboard.profile.greeting,
                tone: dashboard.profile.defaultTone,
                languages: dashboard.profile.languages,
                callGoals: dashboard.profile.callGoals,
                customInstructions: dashboard.profile.customInstructions,
                escalationRules: dashboard.profile.escalationRules
              }}
            />
          </>
        ) : (
          <p className="muted">Prepare the office manager first, then customize how it handles phone calls.</p>
        )}
      </section>

      <section className="grid section-actions">
        <Metric icon={<Bot size={18} />} label="Office profiles" value={dashboard.metrics.profiles} />
        <Metric icon={<Headphones size={18} />} label="Channels" value={dashboard.metrics.channels} />
        <Metric icon={<ShieldCheck size={18} />} label="Live channels" value={dashboard.metrics.liveChannels} tone={dashboard.metrics.liveChannels ? "high" : "medium"} />
        <Metric icon={<MessageSquareText size={18} />} label="Open sessions" value={dashboard.metrics.openSessions} />
        <Metric icon={<Workflow size={18} />} label="Pending actions" value={dashboard.metrics.pendingActions} tone={dashboard.metrics.pendingActions ? "medium" : ""} />
        <Metric icon={<Timer size={18} />} label="Minutes saved" value={dashboard.metrics.ownerMinutesSaved} />
      </section>

      <section className="grid section-actions">
        <Panel
          title="Channels"
          rows={dashboard.channels.map((row) => ({
            id: row.id,
            title: label(row.channelKey),
            detail: row.setupNotes,
            status: `${label(row.status)} / ${label(row.approvalMode)}`
          }))}
          empty="Prepare the office manager to create phone, SMS, email, chat, owner command, and push channel configs."
        />
        <Panel
          title="Action Requests"
          rows={dashboard.actions.map((row) => ({
            id: row.id,
            title: row.title,
            detail: `${label(row.actionType)} / ${row.summary}`,
            status: `${label(row.status)} / ${row.confidenceScore}%`
          }))}
          empty="Office-manager actions appear here before they route into leads, jobs, estimates, invoices, reviews, or tasks."
        />
        <Panel
          title="Memory Facts"
          rows={dashboard.memory.map((row) => ({
            id: row.id,
            title: row.title,
            detail: `${label(row.factType)} / ${row.factText}`,
            status: `${label(row.status)} / ${label(row.sensitivity)}`
          }))}
          empty="Memory facts appear here after setup, customer conversations, owner corrections, SOPs, and approved business rules."
        />
        <Panel
          title="Recent Sessions"
          rows={dashboard.recentSessions.map((row) => ({
            id: row.id,
            title: label(row.channelKey),
            detail: `${label(row.intentKey)} / ${row.summary}`,
            status: `${label(row.status)} / ${label(row.customerSentiment)}`
          }))}
          empty="Phone, email, chat, SMS, owner command, and app sessions will appear here when connected."
        />
      </section>

      <details className="panel section-actions">
        <summary>Advanced phone and voice providers</summary>
        <p className="muted">
          Ferocity keeps phone routing, listening, speaking, and realtime AI separate so providers can change without rebuilding the office manager.
        </p>
        <ul className="list">
          {dashboard.voiceRoutes.map((route) => (
            <li className="list-row" key={route.id}>
              <div>
                <h3>{label(route.routeFamily)}</h3>
                <p className="muted">{route.plainLanguageStatus}</p>
                <p className="muted">
                  Primary: {route.primaryProviderKey}
                  {route.fallbackProviderKey ? ` / fallback: ${route.fallbackProviderKey}` : ""}
                </p>
              </div>
              <span className={`pill ${route.liveActionsEnabled ? "high" : "medium"}`}>
                {route.liveActionsEnabled ? "live enabled" : label(route.status)}
              </span>
            </li>
          ))}
          {dashboard.voiceRoutes.length === 0 ? (
            <li className="list-row">
              <span className="muted">Calling services will appear here after voice setup is complete.</span>
            </li>
          ) : null}
        </ul>
      </details>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
          <h2>What Your Office Manager Can Do</h2>
            <p className="muted">
              Create leads, update customers, schedule appointments, draft estimates, assign tasks, request reviews, prepare payment reminders, collect proof, route angry customers, and brief the owner. It uses existing Ferocity systems instead of duplicating them.
            </p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/integrations">Integrations</Link>
            <Link className="button secondary-button" href="/app/calls">Call Inbox</Link>
            <Link className="button secondary-button" href="/app/ai-usage">AI Usage</Link>
            <Link className="button secondary-button" href="/app/controls">Controls</Link>
            <Link className="button secondary-button" href="/app/automation-timeline">Automation Timeline</Link>
          </div>
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${tone}`}>office</small>
      {icon}
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </section>
  );
}

function Info({ label: itemLabel, value }: { label: string; value: string }) {
  return (
    <div className="status-card">
      <span>{itemLabel}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({
  title,
  rows,
  empty
}: {
  title: string;
  rows: Array<{ id: string; title: string; detail: string; status: string }>;
  empty: string;
}) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              <p className="muted">{row.detail}</p>
            </div>
            <span className="pill">{row.status}</span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="list-row">
            <span className="muted">{empty}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
