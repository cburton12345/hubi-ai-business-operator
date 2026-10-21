import Link from "next/link";
import { BriefcaseBusiness, CircleDollarSign, ContactRound, Sparkles, TriangleAlert } from "lucide-react";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { getRecentAiCommandRuns } from "@/lib/ai-workforce/command-runs";
import { getTodayOverview } from "@/lib/dashboard/get-today-overview";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { queryPostgres } from "@/lib/db/postgres";
import { redirect } from "next/navigation";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export default async function SimpleHomePage() {
  const workspaceId = await getCurrentWorkspaceId();
  const workspaceState = await queryPostgres<{ account_type: string; onboarding_status: string }>(
    `select account_type,onboarding_status from public.tenants where id=$1`,
    [workspaceId]
  );
  if (workspaceState?.rows[0]?.account_type === "customer") {
    redirect(
      workspaceState.rows[0].onboarding_status === "completed"
        ? "/app/ferocity"
        : "/app/ferocity?onboarding=1"
    );
  }
  const [attention, recentCommands] = await Promise.all([
    getTodayOverview(workspaceId),
    getRecentAiCommandRuns(workspaceId, 3)
  ]);
  const today = attention.doFirst;
  const moneyMoves = attention.moneyMoves;
  const ownerSummary = attention.criticalIssues > 0
    ? `${attention.criticalIssues} critical ${attention.criticalIssues === 1 ? "issue needs" : "issues need"} a decision. Start with: ${attention.direction.title}.`
    : attention.ownerNeeds > 0
      ? `${attention.ownerNeeds} ${attention.ownerNeeds === 1 ? "item needs" : "items need"} your attention. Start with: ${attention.direction.title}.`
      : `Nothing urgent needs your attention. A useful next step is: ${attention.direction.title}.`;

  return (
    <section className="simple-home page-section">
      <section className="panel simple-home-hero">
        <div>
          <p className="eyebrow">Today</p>
          <h1>{attention.workspaceName}</h1>
          <p className="simple-home-brief">{ownerSummary}</p>
          <p className="muted">Ferocity keeps the system underneath and brings forward the decisions that still need you.</p>
        </div>
        <Link className="button secondary-button" href="/app/full">Open full Command Center</Link>
      </section>

      <section className="simple-destination-grid" aria-label="Simple Mode destinations">
        <Link className="simple-destination-card" href="/app/attention-command">
          <TriangleAlert size={22} />
          <div>
            <strong>Today</strong>
            <span>Decisions, follow-ups, reminders, and problems that need attention.</span>
          </div>
          <small>{attention.ownerNeeds} need owner attention</small>
        </Link>
        <Link className="simple-destination-card" href="/app/lead-command">
          <ContactRound size={22} />
          <div>
            <strong>Customers</strong>
            <span>Leads, conversations, estimates, follow-up, and customer history.</span>
          </div>
          <small>{money(attention.openPipelineCents)} open pipeline</small>
        </Link>
        <Link className="simple-destination-card" href="/app/job-tracker">
          <BriefcaseBusiness size={22} />
          <div>
            <strong>Work</strong>
            <span>Estimates, jobs, schedule, receipts, materials, and the work being delivered.</span>
          </div>
          <small>Simple daily workflow</small>
        </Link>
        <Link className="simple-destination-card" href="/app/cash-collection">
          <CircleDollarSign size={22} />
          <div>
            <strong>Money</strong>
            <span>Invoices, customer balances, payments, expenses, and profit.</span>
          </div>
          <small>{attention.unpaidInvoices} unpaid invoices</small>
        </Link>
      </section>

      <section className="panel simple-ask-card">
        <div>
          <p className="eyebrow">Ask Ferocity</p>
          <h2>Say what you need in normal words.</h2>
          <p className="muted">
            Ferocity will find the right records, prepare the work, explain what is missing, and keep external actions behind review.
          </p>
        </div>
        <form className="simple-ask-form" action={executeAiWorkforceCommandSimpleAction}>
          <label className="sr-only" htmlFor="simple-home-command">What should Ferocity do?</label>
          <textarea
            id="simple-home-command"
            name="command"
            placeholder="Example: Create an estimate for the Johnson roof, remind me who still owes money, or show me what needs attention today."
            minLength={8}
            maxLength={2000}
            rows={4}
            required
          />
          <button className="button" type="submit"><Sparkles size={16} /> Ask Ferocity</button>
        </form>
      </section>

      <section className="feature-split">
        <article className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Do first</p>
              <h2>What needs attention</h2>
            </div>
            <Link className="mini-button" href="/app/attention-command">See everything</Link>
          </div>
          <ul className="list">
            {today.map((item) => (
              <li className="list-row" key={`${item.href}-${item.title}`}>
                <div>
                  <Link href={item.href}><strong>{item.title}</strong></Link>
                  <p className="muted">{item.detail}</p>
                </div>
                <span className={`status-dot ${item.urgency}`} />
              </li>
            ))}
            {today.length === 0 ? (
              <li className="list-row"><span className="muted">Nothing urgent is waiting for the owner.</span></li>
            ) : null}
          </ul>
        </article>

        <article className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Money next</p>
              <h2>Moves that can improve cash</h2>
            </div>
            <Link className="mini-button" href="/app/cash-collection">Open money</Link>
          </div>
          <ul className="list">
            {moneyMoves.map((item) => (
              <li className="list-row" key={`${item.href}-${item.title}`}>
                <div>
                  <Link href={item.href}><strong>{item.title}</strong></Link>
                  <p className="muted">{item.detail}</p>
                </div>
              </li>
            ))}
            {moneyMoves.length === 0 ? (
              <li className="list-row"><span className="muted">No immediate collection or revenue move is waiting.</span></li>
            ) : null}
          </ul>
        </article>
      </section>

      {recentCommands.length > 0 ? (
        <details className="panel progressive-disclosure">
          <summary>
            <div>
              <p className="eyebrow">Recent Ferocity work</p>
              <h2>What you recently asked</h2>
            </div>
            <span className="muted">{recentCommands.length} recent</span>
          </summary>
          <div className="progressive-disclosure-body">
            <div className="list-row flush-row">
              <span className="muted">Prepared work, results, and anything still waiting on you.</span>
              <Link className="mini-button" href="/app/ai-workforce">Open Ask Ferocity</Link>
            </div>
            <ul className="list">
              {recentCommands.map((run) => (
                <li className="list-row" key={run.id}>
                  <div>
                    <strong>{run.command}</strong>
                    <p className="muted">
                      {run.prepared[0] ?? run.missingInfo[0] ?? run.blocked[0] ?? "Ferocity recorded the request."}
                    </p>
                  </div>
                  <span className="pill">{run.status.replaceAll("_", " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </section>
  );
}
