import Link from "next/link";
import type React from "react";
import { Cable, FileText, Globe2, Link2, Search, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getSeoAutopilotSummary, getSeoPageOpportunitySummary, getSeoTrafficEngineDashboard } from "@/lib/seo/seo-autopilot";
import { activateSeoTrafficEngineAction, generateSeoAutopilotAction } from "./actions";

export default async function SeoAutopilotPage() {
  const [rows, opportunities, trafficEngine] = await Promise.all([
    getSeoAutopilotSummary(),
    getSeoPageOpportunitySummary(),
    getSeoTrafficEngineDashboard()
  ]);
  const totalKeywords = rows.reduce((sum, row) => sum + row.keywordCount, 0);
  const totalDrafts = rows.reduce((sum, row) => sum + row.recentDraftCount, 0);

  return (
    <QueuePageShell
      eyebrow="SEO"
      title="SEO + AI Search Growth Engine"
      description="Audit the business, plan useful content, prepare drafts, build authority tasks, connect publishing paths, and track which work turns into leads and revenue."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Traffic engine</p>
            <h2>Get found before the lead exists.</h2>
            <p className="muted">
              Ferocity prepares the work that helps the business show up in Google, Google Business Profile when relevant, Reddit/community searches,
              and AI answers. Then it connects that traffic to forms, calls, follow-up, jobs, invoices, reviews, and revenue.
            </p>
          </div>
          <form action={activateSeoTrafficEngineAction}>
            <button className="button" type="submit">
              <Sparkles size={16} /> Build traffic engine
            </button>
          </form>
        </div>
        <div className="grid section-actions">
          <MiniStep title="1. Check visibility" body="Track the searches and prompts where the business should appear." />
          <MiniStep title="2. Plan 30 days" body="Service pages, city pages, blogs, proof, GBP posts, and FAQs." />
          <MiniStep title="3. Prepare drafts" body="Create reviewed content and publishing queue records without live publishing." />
          <MiniStep title="4. Build authority" body="Reviews, proof, citations, directories, community visibility, and internal links." />
        </div>
      </section>

      <div className="grid section-actions">
        <section className="panel span-4 metric">
          <Search size={20} />
          <span className="muted">Keyword seeds</span>
          <strong>{totalKeywords}</strong>
        </section>
        <section className="panel span-4 metric">
          <FileText size={20} />
          <span className="muted">SEO drafts this month</span>
          <strong>{totalDrafts}</strong>
        </section>
        <section className="panel span-4">
          <h2>Safe Automation</h2>
          <p className="muted">Drafts, checks, and tasks first. Live publishing needs a connected account, approval, and tier limits.</p>
        </section>
      </div>

      <div className="button-row section-actions">
        <Link className="button" href="/app/publishing-hub">
          Publishing Hub
        </Link>
        <form action={generateSeoAutopilotAction}>
          <button className="button secondary-button" type="submit">
            <Sparkles size={16} /> Generate SEO drafts
          </button>
        </form>
        <Link className="button secondary-button" href="/app/review">
          <FileText size={16} /> Review drafts
        </Link>
        <Link className="button secondary-button" href="/app/sites">
          Hosted pages
        </Link>
        <Link className="button secondary-button" href="/app/brands">
          Brand SEO data
        </Link>
        <Link className="button secondary-button" href="/app/marketing-os">
          Have AI Set This Up
        </Link>
      </div>

      <section className="grid section-actions">
        <MetricPanel icon={<Globe2 size={18} />} label="AI search checks" value={trafficEngine.metrics.visibilityChecks} />
        <MetricPanel icon={<FileText size={18} />} label="30-day plan items" value={trafficEngine.metrics.strategyItems} />
        <MetricPanel icon={<Link2 size={18} />} label="Authority tasks" value={trafficEngine.metrics.authorityTasks} />
        <MetricPanel icon={<Cable size={18} />} label="Publishing paths" value={trafficEngine.metrics.publishingConnections} />
      </section>

      <div className="grid section-actions">
        <section className="panel span-6">
          <h2>Visibility Checks</h2>
          <p className="muted">Google, AI answers, GBP, and community searches to check before claiming wins.</p>
          <ul className="list">
            {trafficEngine.visibilityChecks.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.checkName}</h3>
                  <p className="muted">{[item.brandName, item.platformKey.replaceAll("_", " ")].join(" / ")}</p>
                  <p>{item.queryText}</p>
                </div>
                <span className="pill">{item.status.replaceAll("_", " ")}</span>
              </li>
            ))}
            {trafficEngine.visibilityChecks.length === 0 ? (
              <li className="list-row"><span className="muted">Build the traffic engine to create visibility checks.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Publishing Connections</h2>
          <p className="muted">Where approved work can go later. Live publishing stays off until connected.</p>
          <ul className="list">
            {trafficEngine.publishingConnections.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.displayName}</h3>
                  <p className="muted">{[item.brandName, item.providerKey.replaceAll("_", " ")].join(" / ")}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{item.status.replaceAll("_", " ")}</span>
                  <span className="pill">{item.livePublishEnabled ? "live on" : "live off"}</span>
                </div>
              </li>
            ))}
            {trafficEngine.publishingConnections.length === 0 ? (
              <li className="list-row"><span className="muted">No publishing paths yet. Use Build traffic engine or Connect Website.</span></li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid section-actions">
        <section className="panel span-7">
          <h2>30-Day Content Strategy</h2>
          <p className="muted">Useful work Ferocity can draft, export, schedule, or route to the right review queue.</p>
          <ul className="list">
            {trafficEngine.strategyItems.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {[item.brandName, item.contentType.replaceAll("_", " "), item.targetKeyword].filter(Boolean).join(" / ")}
                  </p>
                  <p>{item.publishTarget.replaceAll("_", " ")}{item.scheduledFor ? ` / ${item.scheduledFor}` : ""}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill high">{item.priorityScore}</span>
                  <span className="pill">{item.status.replaceAll("_", " ")}</span>
                </div>
              </li>
            ))}
            {trafficEngine.strategyItems.length === 0 ? (
              <li className="list-row"><span className="muted">No 30-day strategy yet. Build the traffic engine to seed one.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>Authority Work</h2>
          <p className="muted">The non-spam signals that make local SEO and AI visibility more believable.</p>
          <ul className="list">
            {trafficEngine.authorityTasks.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{[item.brandName, item.taskType.replaceAll("_", " ")].join(" / ")}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill high">{item.priorityScore}</span>
                  <span className="pill">{item.status.replaceAll("_", " ")}</span>
                </div>
              </li>
            ))}
            {trafficEngine.authorityTasks.length === 0 ? (
              <li className="list-row"><span className="muted">No authority tasks yet. Build the traffic engine to create them.</span></li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid">
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Page Opportunities</h2>
              <p className="muted">The practical SEO work list: pages to create, refresh, improve, or support with local proof.</p>
            </div>
            <Link className="mini-button" href="/app/growth">
              Growth command
            </Link>
          </div>
          <ul className="list">
            {opportunities.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {[item.brandName, item.pageType, item.targetKeyword].filter(Boolean).join(" / ")}
                  </p>
                  <p>{item.nextStep}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill high">{item.priorityScore}</span>
                  <span className="pill">{item.status}</span>
                </div>
              </li>
            ))}
            {opportunities.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No page opportunities yet</h3>
                  <p className="muted">Run the growth scan after adding services, cities, keywords, or existing pages.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        {rows.map((row) => (
          <section className="panel span-6" key={row.brandId}>
            <div className="list-row flush-row">
              <div>
                <h2>{row.brandName}</h2>
                <p className="muted">
                  {row.keywordCount} keywords / {row.pageCount} pages / {row.recentDraftCount} recent SEO drafts
                </p>
              </div>
              <span className="pill">draft-only</span>
            </div>
            <h3>Top keywords</h3>
            <div className="button-row section-actions">
              {(row.topKeywords.length > 0 ? row.topKeywords : ["Add keyword seeds in Brand SEO data"]).map((keyword) => (
                <span className="pill" key={keyword}>
                  {keyword}
                </span>
              ))}
            </div>
            <h3>Next topics</h3>
            <ul className="list">
              {row.nextTopics.map((topic) => (
                <li className="list-row" key={topic}>
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {rows.length === 0 ? (
          <section className="panel span-12">
            <h2>No active brands yet</h2>
            <p className="muted">Create a workspace brand before generating SEO autopilot drafts.</p>
          </section>
        ) : null}
      </div>
    </QueuePageShell>
  );
}

function MiniStep({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel span-3">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </section>
  );
}

function MetricPanel({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <section className="metric-card span-3">
      <small className="pill">seo + ai search</small>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
