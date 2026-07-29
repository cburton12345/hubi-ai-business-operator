import Link from "next/link";
import { CheckCircle2, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLaborBenchDashboard } from "@/lib/labor-bench/get-labor-bench-dashboard";
import {
  createStaffingRequestAction,
  createWorkerAvailabilityAction,
  generateLaborMatchesAction,
  updateLaborMatchStatusAction,
  updateStaffingRequestStatusAction,
  updateWorkerAvailabilityStatusAction
} from "./actions";

function tone(value: string) {
  if (["urgent", "high", "approval_needed", "suggested"].includes(value)) return "high";
  if (["normal", "matching", "owner_approved_contact", "contacted", "worker_interested"].includes(value)) return "medium";
  return "";
}

export default async function LaborBenchPage() {
  const dashboard = await getLaborBenchDashboard();
  const blockedGates = [dashboard.gates.requests, dashboard.gates.workerIntake, dashboard.gates.matchSuggestions].filter((gate) => !gate.enabled);

  return (
    <QueuePageShell
      eyebrow="Labor Bench"
      title="Find Workers Without Losing Control"
      description="Owners can request help, add available workers or imports, let Ferocity suggest matches, and approve contact before anything happens."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Owner shortcut</p>
            <h2>I need employees or subcontractors.</h2>
            <p className="muted">
              Ferocity does not promise workers exist in every area. It creates a request, checks your labor bench, prepares matches, and keeps contact or placement behind approval.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="#need-workers">Request workers</Link>
            <Link className="button secondary-button" href="#worker-availability">Add availability</Link>
            {dashboard.publicWorkerIntakeUrl ? (
              <Link className="button secondary-button" href={dashboard.publicWorkerIntakeUrl}>Public worker form</Link>
            ) : null}
          </div>
        </div>
        {blockedGates.length ? (
          <div className="notice-box">
            <strong>Some labor features need a plan, limit, or control update.</strong>
            <p className="muted">{blockedGates.map((gate) => `${gate.featureKey}: ${gate.reason}`).join(" ")}</p>
            <Link className="mini-button" href="/app/billing">Review billing limits</Link>
          </div>
        ) : null}
        <div className="grid">
          <Metric label="Open requests" value={dashboard.metrics.openRequests} />
          <Metric label="Available workers" value={dashboard.metrics.workersAvailable} />
          <Metric label="Need approval" value={dashboard.metrics.approvalNeeded} />
          <Metric label="Placed matches" value={dashboard.metrics.placedMatches} />
        </div>
        <div className="grid section-actions">
          <GateCard title="Worker requests" gate={dashboard.gates.requests} />
          <GateCard title="Worker intake" gate={dashboard.gates.workerIntake} />
          <GateCard title="Match suggestions" gate={dashboard.gates.matchSuggestions} />
        </div>
      </section>

      <section className="grid section-actions">
        <form id="need-workers" action={createStaffingRequestAction} className="panel form-stack span-6">
          <h2><Search size={18} /> I Need Workers</h2>
          <input name="title" placeholder="Need 2 roofers next week" required />
          <div className="two-col">
            <input name="trade" placeholder="Roofing, drywall, cleaning, CDL, office" required />
            <input name="headcount" inputMode="numeric" placeholder="How many?" />
          </div>
          <input name="jobsite" placeholder="Jobsite or general location" />
          <input name="serviceArea" placeholder="City, county, or service area" />
          <div className="two-col">
            <label>Start date<input name="startDate" type="date" /></label>
            <input name="durationLabel" placeholder="One day, two weeks, ongoing" />
          </div>
          <input name="payRange" placeholder="$25-$35/hr, per job, negotiable" />
          <div className="two-col">
            <select name="urgency" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select name="placementMode" defaultValue="manual_or_paid_tier">
              <option value="manual_or_paid_tier">Manual or paid-tier help</option>
              <option value="included_in_plan">Included in plan</option>
              <option value="placement_fee">Placement fee</option>
              <option value="not_offered">Track only, no placement service</option>
            </select>
          </div>
          <textarea name="notes" rows={4} placeholder="Skills needed, tools, insurance, schedule, deal breakers, who approves contact." />
          <button className="button" type="submit">Create worker request</button>
        </form>

        <form id="worker-availability" action={createWorkerAvailabilityAction} className="panel form-stack span-6">
          <h2><UserPlus size={18} /> Add Worker Availability</h2>
          <input name="name" placeholder="Worker or crew name" required />
          <div className="two-col">
            <input name="trade" placeholder="Trade or role" required />
            <input name="serviceArea" placeholder="Service area" />
          </div>
          <input name="homeLocation" placeholder="Home base or city" />
          <div className="two-col">
            <input name="phone" placeholder="Phone" />
            <input name="email" type="email" placeholder="Email" />
          </div>
          <input name="availabilityLabel" placeholder="Available weekends, next week, evenings, on call" />
          <div className="two-col">
            <input name="travelRadiusMiles" inputMode="numeric" placeholder="Travel radius miles" />
            <input name="rateLabel" placeholder="$30/hr, per job, negotiable" />
          </div>
          <input name="experienceLabel" placeholder="5 years roofing, has truck/tools, insured, helper only" />
          <select name="source" defaultValue="manual">
            <option value="manual">Manual entry</option>
            <option value="marketplacepro">MarketplacePro import</option>
            <option value="public_form">Public worker form</option>
            <option value="referral">Referral</option>
            <option value="import">Imported list</option>
          </select>
          <label className="checkbox-row">
            <input name="consentToContact" type="checkbox" />
            <span>Worker gave permission to be contacted about matching work.</span>
          </label>
          <button className="button" type="submit">Add to labor bench</button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ShieldCheck size={18} /> How Ferocity Handles Staffing</h2>
            <p className="muted">
              This is a matching and approval system, not automatic hiring. Pricing can be plan-based, manual service, or placement-fee based when enabled.
            </p>
          </div>
          <Link className="mini-button" href="/app/operations-workforce">Operations</Link>
        </div>
        {dashboard.publicWorkerIntakeUrl ? (
          <div className="notice-box">
            <strong>Share worker intake:</strong>{" "}
            <Link href={dashboard.publicWorkerIntakeUrl}>{dashboard.publicWorkerIntakeUrl}</Link>
            <p className="muted">Workers can submit availability here. Ferocity adds them to this labor bench for review and matching.</p>
          </div>
        ) : (
          <div className="notice-box">
            <strong>Public worker form needs a public lead form first.</strong>
            <p className="muted">Create an active public form for this workspace, then Ferocity can reuse that public key for worker availability intake.</p>
          </div>
        )}
        <div className="grid">
          {[
            ["1", "Owner asks for help", "Trade, area, timing, pay, urgency, and notes are captured."],
            ["2", "Workers submit or get imported", "Manual entries, referrals, public forms, or MarketplacePro labor can feed the bench."],
            ["3", "Ferocity suggests matches", "Trade, area, availability, consent, and urgency are scored."],
            ["4", "Owner approves contact", "No worker is contacted or placed without approval."],
            ["5", "Track outcome", "Contacted, interested, placed, rejected, or not available stays visible."]
          ].map(([number, title, body]) => (
            <article className="panel span-4" key={title}>
              <span className="pill">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <h2><Users size={18} /> Worker Requests</h2>
          <ul className="list">
            {dashboard.requests.map((request) => (
              <li className="list-row" key={request.id}>
                <div>
                  <h3>{request.title}</h3>
                  <p className="muted">{request.trade} / {request.serviceArea} / {request.startDate} / {request.headcount} needed</p>
                  <p>{request.notes}</p>
                  <p className="muted">{request.payRange} / {request.matchCount} match(es)</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(request.urgency)}`}>{request.urgency}</span>
                  <span className={`pill ${tone(request.status)}`}>{request.status}</span>
                  <form action={generateLaborMatchesAction}>
                    <input name="requestId" type="hidden" value={request.id} />
                    <button className="mini-button" type="submit">Find matches</button>
                  </form>
                  <form action={updateStaffingRequestStatusAction} className="inline-actions">
                    <input name="requestId" type="hidden" value={request.id} />
                    <select name="status" defaultValue={request.status}>
                      <option value="open">open</option>
                      <option value="matching">matching</option>
                      <option value="approval_needed">approval needed</option>
                      <option value="contacting">contacting</option>
                      <option value="filled">filled</option>
                      <option value="paused">paused</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button className="mini-button" type="submit">Update</button>
                  </form>
                </div>
              </li>
            ))}
            {dashboard.requests.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No worker requests yet</h3>
                  <p className="muted">Start with one clear need: trade, area, timing, pay range, and who approves contact.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>AI Staffing Notes</h2>
          <ul className="list">
            {dashboard.aiSuggestions.map((item) => (
              <li className="list-row" key={item.title}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <span className={`pill ${item.priority === "high" ? "high" : item.priority === "normal" ? "medium" : ""}`}>{item.priority}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Match Suggestions</h2>
          <ul className="list">
            {dashboard.matches.map((match) => (
              <li className="list-row" key={match.id}>
                <div>
                  <h3>{match.workerName}</h3>
                  <p className="muted">{match.requestTitle} / {match.trade} / score {match.score} / {match.source}</p>
                  <p>{match.reason}</p>
                </div>
                <form action={updateLaborMatchStatusAction} className="inline-actions">
                  <input name="matchId" type="hidden" value={match.id} />
                  <select name="status" defaultValue={match.status}>
                    <option value="suggested">suggested</option>
                    <option value="owner_approved_contact">approve contact</option>
                    <option value="contacted">contacted</option>
                    <option value="worker_interested">worker interested</option>
                    <option value="placed">placed</option>
                    <option value="rejected">reject</option>
                    <option value="not_available">not available</option>
                  </select>
                  <button className="mini-button" type="submit">Save</button>
                </form>
              </li>
            ))}
            {dashboard.matches.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No match suggestions yet</h3>
                  <p className="muted">Add workers or collect availability, then run Find matches on an open request.</p>
                </div>
                <Link className="mini-button" href="#worker-availability">Add workers</Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Available Workers</h2>
          <ul className="list">
            {dashboard.workers.map((worker) => (
              <li className="list-row" key={worker.id}>
                <div>
                  <h3>{worker.name}</h3>
                  <p className="muted">{worker.trade} / {worker.serviceArea} / {worker.availability}</p>
                  <p className="muted">{worker.rate} / {worker.source} / {worker.consent}</p>
                  <p className="muted">{worker.sourceDetail}</p>
                </div>
                <form action={updateWorkerAvailabilityStatusAction} className="inline-actions">
                  <span className={`pill ${tone(worker.status)}`}>{worker.status}</span>
                  <input name="workerId" type="hidden" value={worker.id} />
                  <select name="status" defaultValue={worker.status}>
                    <option value="available">available</option>
                    <option value="needs_review">needs review</option>
                    <option value="contacted">contacted</option>
                    <option value="placed">placed</option>
                    <option value="unavailable">unavailable</option>
                    <option value="archived">archived</option>
                  </select>
                  <button className="mini-button" type="submit">Update</button>
                </form>
              </li>
            ))}
            {dashboard.workers.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No worker availability records yet</h3>
                  <p className="muted">Add a worker manually, share the public worker form, or import MarketplacePro labor when that connection is ready.</p>
                </div>
                {dashboard.publicWorkerIntakeUrl ? <Link className="mini-button" href={dashboard.publicWorkerIntakeUrl}>Open intake</Link> : <Link className="mini-button" href="/app/forms">Create public form</Link>}
              </li>
            ) : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="metric-card span-3">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </section>
  );
}

function GateCard({ title, gate }: { title: string; gate: { enabled: boolean; currentUsage: number; usageLimit: number | null; remaining: number | null; reason: string; planKey: string; minimumPlanKey: string } }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{title}</span>
      <strong>{gate.usageLimit === null ? `${gate.currentUsage.toLocaleString()} used` : `${gate.currentUsage.toLocaleString()} / ${gate.usageLimit.toLocaleString()}`}</strong>
      <small className="muted">
        {gate.enabled ? `${gate.remaining === null ? "Unlimited" : `${gate.remaining.toLocaleString()} left`} on ${gate.planKey}` : gate.reason}
      </small>
      <span className={`pill ${gate.enabled ? "" : "high"}`}>{gate.enabled ? "available" : `needs ${gate.minimumPlanKey}`}</span>
    </section>
  );
}
