import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardList, PlugZap, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAiCommandRun, getLatestAiCommandRun, getRecentAiCommandRuns } from "@/lib/ai-workforce/command-runs";
import { queryPostgres } from "@/lib/db/postgres";
import {
  getProviderCapabilityReadiness,
  providerLaneStatusLabel,
  providerLaneTone
} from "@/lib/integrations/provider-lane-readiness";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type QueueMetric = {
  review_queue: string;
  approved_queue: string;
  video_jobs: string;
};

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "prepared") return "";
  if (status === "needs_attention") return "medium";
  return "high";
}

async function getQueueMetrics(workspaceId: string) {
  const result = await queryPostgres<QueueMetric>(
    `
    select
      (select count(*) from public.review_first_export_queue where tenant_id = $1 and status in ('draft','needs_review','blocked'))::text as review_queue,
      (select count(*) from public.review_first_export_queue where tenant_id = $1 and status = 'approved')::text as approved_queue,
      (select count(*) from public.marketing_video_jobs where tenant_id = $1 and status <> 'archived')::text as video_jobs
    `,
    [workspaceId]
  );
  return result?.rows[0] ?? { review_queue: "0", approved_queue: "0", video_jobs: "0" };
}

export default async function AiCommandResultPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const [run, recentRuns, providers, metrics] = await Promise.all([
    runId === "latest" ? getLatestAiCommandRun(workspaceId) : getAiCommandRun(workspaceId, runId),
    getRecentAiCommandRuns(workspaceId, 6),
    getProviderCapabilityReadiness(workspaceId),
    getQueueMetrics(workspaceId)
  ]);

  if (!run) {
    if (runId !== "latest") redirect("/app/ai-workforce/results/latest");
    notFound();
  }

  return (
    <QueuePageShell
      eyebrow="Ferocity Command Result"
      title="Here is what Ferocity did."
      description="Every command gets a clear receipt: prepared work, missing details, blockers, and where to review or finish it."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Command</p>
            <h2>{run.command}</h2>
            <p className="muted">{dateLabel(run.createdAt)}</p>
          </div>
          <span className={`pill ${statusTone(run.status)}`}>{run.status.replaceAll("_", " ")}</span>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Prepared" value={run.prepared.length} />
        <Metric label="Needs info" value={run.missingInfo.length} tone={run.missingInfo.length ? "medium" : ""} />
        <Metric label="Blocked" value={run.blocked.length} tone={run.blocked.length ? "high" : ""} />
        <Metric label="Review queue" value={Number(metrics.review_queue)} tone={Number(metrics.review_queue) ? "medium" : ""} />
      </section>

      <div className="grid section-actions">
        <section className="panel span-6">
          <h2><CheckCircle2 size={18} /> Prepared Work</h2>
          <ul className="list">
            {run.prepared.map((item) => (
              <li className="list-row" key={item}><span>{item}</span></li>
            ))}
            {run.prepared.length === 0 ? <li className="list-row"><span className="muted">No prepared records were created.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2><AlertTriangle size={18} /> Missing Info Or Blockers</h2>
          <ul className="list">
            {run.missingInfo.map((item) => (
              <li className="list-row" key={item}>
                <span className="pill medium">needs detail</span>
                <span>{item}</span>
              </li>
            ))}
            {run.missingInfo.length === 0 ? <li className="list-row"><span className="muted">No missing details detected for this command.</span></li> : null}
          </ul>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ClipboardList size={18} /> Finish Or Review</h2>
            <p className="muted">These are the most useful places to finish details, approve work, or see what Ferocity queued.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/ai-workforce">Run another command</Link>
            <Link className="button secondary-button" href="/app/review">Open review queue</Link>
          </div>
        </div>
        <div className="grid">
          {run.routes.map((route) => (
            <Link className="panel span-4 command-route-card" href={route.href} key={route.href}>
              <strong>{route.label}</strong>
              <span>{route.reason ?? "Review related work."}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2><PlugZap size={18} /> Posting And Provider Readiness</h2>
          <ul className="list">
            {providers.slice(3, 10).map((provider) => (
              <li className="list-row" key={provider.capabilityKey}>
                <div>
                  <strong>{provider.label}</strong>
                  <p className="muted">
                    Customer: {providerLaneStatusLabel(provider.customerOwned)} / Ferocity: {providerLaneStatusLabel(provider.ferocityManaged)}
                  </p>
                </div>
                <span className={`pill ${providerLaneTone(provider.customerOwned)}`}>{provider.customerOwned.providerKey}</span>
              </li>
            ))}
            {providers.length === 0 ? <li className="list-row"><span className="muted">No provider records found yet.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-6">
          <h2><Sparkles size={18} /> Command Activity</h2>
          <ul className="list">
            {recentRuns.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <strong>{item.command}</strong>
                  <p className="muted">{dateLabel(item.createdAt)} / {item.status.replaceAll("_", " ")}</p>
                </div>
                <Link className="mini-button" href={`/app/ai-workforce/results/${item.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong className={tone}>{value}</strong>
    </section>
  );
}
