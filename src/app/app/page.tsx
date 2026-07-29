import Link from "next/link";
import { Bot, BriefcaseBusiness, CircleDollarSign, ContactRound, Sparkles, TriangleAlert } from "lucide-react";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { getAttentionCommandDashboard } from "@/lib/attention-command/get-attention-command-dashboard";
import { getRecentAiCommandRuns } from "@/lib/ai-workforce/command-runs";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export default async function SimpleHomePage() {
  const workspaceId = await getCurrentWorkspaceId();
  const [attention, recentCommands] = await Promise.all([
    getAttentionCommandDashboard(),
    getRecentAiCommandRuns(workspaceId, 3)
  ]);
  const today = attention.doFirst.slice(0, 5);
  const moneyMoves = attention.moneyMoves.slice(0, 3);

  return (
    <section className="simple-home page-section">
      <section className="panel simple-home-hero">
        <div>
          <p className="eyebrow">Today</p>
          <h1>{attention.workspaceName}</h1>
          <p className="simple-home-brief">{attention.briefing}</p>
          <p className="muted">Ferocity keeps the full system underneath. You only need to choose what you want to handle next.</p>
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
          <small>{attention.metrics.ownerNeeds} need owner attention</small>
        </Link>
        <Link className="simple-destination-card" href="/app/lead-command">
          <ContactRound size={22} />
          <div>
            <strong>Customers</strong>
            <span>Leads, conversations, estimates, follow-up, and customer history.</span>
          </div>
          <small>{money(attention.metrics.openPipelineCents)} open pipeline</small>
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
          <small>{attention.metrics.unpaidInvoices} unpaid invoices</small>
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

      <section className="panel">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Recent Ferocity work</p>
            <h2>What you recently asked</h2>
          </div>
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
          {recentCommands.length === 0 ? (
            <li className="list-row">
              <Bot size={17} />
              <span className="muted">Ask Ferocity for the first time and the result will appear here.</span>
            </li>
          ) : null}
        </ul>
      </section>
    </section>
  );
}
