import Link from "next/link";
import { AlertTriangle, BarChart3, ExternalLink, Link2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLinkAuthorityDashboard } from "@/lib/authority/get-link-authority-dashboard";
import {
  addLinkOpportunityAction,
  importBacklinksAction,
  recordBacklinkAction,
  scanExistingAuthorityAssetsAction,
  updateBacklinkOutcomeAction,
  updateLinkOpportunityStatusAction
} from "./actions";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function LinkAuthorityPage() {
  const dashboard = await getLinkAuthorityDashboard();

  return (
    <QueuePageShell
      eyebrow="Authority Engine"
      title="Links That Build Real Authority"
      description="Track backlink health, create genuinely useful assets, find legitimate relationship opportunities, and measure leads and revenue."
    >
      <section className="panel construction-simple-hero">
        <div>
          <p className="eyebrow">Earned authority</p>
          <h2>Useful assets and real relationships—not a hidden link exchange.</h2>
          <p className="muted">
            Ferocity can organize links and opportunities automatically. It does not promise rankings, invent
            placements, or send outreach unless a separately authorized communication channel allows it.
          </p>
        </div>
        <div className="button-row">
          <form action={scanExistingAuthorityAssetsAction}>
            <button className="button" type="submit"><Sparkles size={16} /> Find assets and relationships</button>
          </form>
          <Link className="button secondary-button" href="/app/authority">Authority Engine</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Tracked links" value={dashboard.metrics.totalLinks} />
        <Metric label="Active" value={dashboard.metrics.activeLinks} />
        <Metric label="Lost" value={dashboard.metrics.lostLinks} tone={dashboard.metrics.lostLinks ? "medium" : ""} />
        <Metric label="Suspicious" value={dashboard.metrics.suspiciousLinks} tone={dashboard.metrics.suspiciousLinks ? "high" : ""} />
        <Metric label="Opportunities" value={dashboard.metrics.openOpportunities} />
        <Metric label="Referral visits" value={dashboard.metrics.referralVisits} />
        <Metric label="Attributed leads" value={dashboard.metrics.attributedLeads} />
        <Metric label="Real revenue" value={money(dashboard.metrics.attributedRevenueCents)} />
      </section>

      <section className="feature-split section-actions">
        <article className="panel">
          <div>
            <p className="eyebrow">Add or verify a backlink</p>
            <h2>Record what actually exists.</h2>
          </div>
          <form action={recordBacklinkAction} className="stacked-form">
            <label>
              Brand
              <select name="brandId" defaultValue="">
                <option value="">Workspace / unknown</option>
                {dashboard.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>Linking page URL<input name="sourceUrl" type="url" placeholder="https://example.org/resources/contractors" required /></label>
            <label>Page on your site<input name="targetUrl" type="url" placeholder="https://yourbusiness.com/project-guide" required /></label>
            <label>Anchor text<input name="anchorText" placeholder="Helpful local roofing guide" /></label>
            <div className="form-grid two">
              <label>
                Link type
                <select name="linkType" defaultValue="unknown">
                  <option value="earned">earned</option>
                  <option value="editorial">editorial</option>
                  <option value="directory">directory</option>
                  <option value="supplier">supplier</option>
                  <option value="manufacturer">manufacturer</option>
                  <option value="association">association</option>
                  <option value="local_media">local media</option>
                  <option value="partner">partner</option>
                  <option value="customer_story">customer story</option>
                  <option value="sponsorship">sponsorship</option>
                  <option value="manual">manual</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>Relevance, 0–100<input name="relevanceScore" type="number" min="0" max="100" defaultValue="50" /></label>
            </div>
            <div className="form-grid two">
              <label>Third-party DR, optional<input name="domainRating" type="number" min="0" max="100" /></label>
              <label>Estimated market value, optional<input name="estimatedMarketValue" inputMode="decimal" placeholder="Not revenue" /></label>
            </div>
            <button className="button" type="submit">Assess and record link</button>
          </form>
        </article>

        <article className="panel">
          <div>
            <p className="eyebrow">Add a legitimate opportunity</p>
            <h2>Start with a real reason to belong.</h2>
          </div>
          <form action={addLinkOpportunityAction} className="stacked-form">
            <label>
              Brand
              <select name="brandId" defaultValue="">
                <option value="">Workspace / choose later</option>
                {dashboard.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                Opportunity
                <select name="opportunityType" defaultValue="supplier_directory">
                  <option value="supplier_directory">supplier directory</option>
                  <option value="manufacturer_installer">manufacturer installer</option>
                  <option value="chamber">chamber</option>
                  <option value="association">association</option>
                  <option value="local_media">local media</option>
                  <option value="resource_page">resource page</option>
                  <option value="partner">partner</option>
                  <option value="customer_story">customer story</option>
                  <option value="sponsorship">sponsorship</option>
                  <option value="digital_pr">digital PR</option>
                  <option value="manual">other</option>
                </select>
              </label>
              <label>Relevance, 0–100<input name="relevanceScore" type="number" min="0" max="100" defaultValue="70" /></label>
            </div>
            <label>Organization<input name="organizationName" placeholder="Supplier, association, chamber, publication…" required /></label>
            <label>Relevant page<input name="opportunityUrl" type="url" placeholder="https://organization.org/directory" /></label>
            <label>Why the relationship is real<textarea name="relationshipEvidence" rows={3} placeholder="We buy from this supplier; we are a certified installer; we belong to this association…" /></label>
            <label>Best next action<textarea name="recommendedAction" rows={3} placeholder="Verify directory requirements and offer the completed-project guide if it helps their audience." /></label>
            <button className="button" type="submit">Add opportunity</button>
          </form>
        </article>
      </section>

      <section className="panel section-actions">
        <details>
          <summary>Bulk import backlinks</summary>
          <form action={importBacklinksAction} className="stacked-form section-actions">
            <div className="form-grid two">
              <label>
                Brand
                <select name="brandId" defaultValue="">
                  <option value="">Workspace / unknown</option>
                  {dashboard.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label>Default target URL<input name="targetUrl" type="url" /></label>
            </div>
            <label>
              One link per line
              <textarea name="backlinks" rows={7} placeholder="source URL | target URL | anchor text | DR | relevance | estimated value" required />
            </label>
            <p className="muted">Up to 200 lines. Estimated value is tracked separately from real attributed revenue.</p>
            <button className="button" type="submit">Import and assess</button>
          </form>
        </details>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Backlink health</p>
            <h2>Quality, losses, risks, and real outcomes</h2>
          </div>
          <span className="pill">Estimated marketplace value: {money(dashboard.metrics.estimatedMarketValueCents)}</span>
        </div>
        <ul className="list">
          {dashboard.links.map((link) => (
            <li className="list-row" key={link.id}>
              <div>
                <div className="inline-actions">
                  <strong>{link.source_domain}</strong>
                  <span className={`pill ${link.risk_level === "high" ? "high" : link.risk_level === "medium" ? "medium" : ""}`}>{link.status}</span>
                  <span className="pill">quality {link.quality_score}/100</span>
                  <span className="pill">relevance {link.relevance_score}/100</span>
                </div>
                <p><a href={link.source_url} target="_blank" rel="noreferrer">{link.source_url} <ExternalLink size={13} /></a></p>
                <p className="muted">To {link.target_url} · {label(link.link_type)} · DR {link.domain_rating ?? "not supplied"}</p>
                <p>Visits {link.referral_visits} · Leads {link.attributed_leads} · Real revenue {money(link.attributed_revenue_cents)} · Estimated link value {money(link.estimated_market_value_cents)}</p>
                {link.riskFlags.length ? (
                  <details>
                    <summary>{link.riskFlags.length} screening flag(s)</summary>
                    <ul>{link.riskFlags.map((flag) => <li key={flag.key}><strong>{flag.label}:</strong> {flag.detail}</li>)}</ul>
                  </details>
                ) : null}
              </div>
              <details className="subtle-panel">
                <summary>Update outcome</summary>
                <form action={updateBacklinkOutcomeAction} className="stacked-form section-actions">
                  <input name="backlinkId" type="hidden" value={link.id} />
                  <label>Status
                    <select name="status" defaultValue={link.status}>
                      <option value="unverified">unverified</option>
                      <option value="active">active</option>
                      <option value="lost">lost</option>
                      <option value="suspicious">suspicious</option>
                      <option value="ignored">ignored</option>
                    </select>
                  </label>
                  <label>Referral visits<input name="referralVisits" type="number" min="0" defaultValue={link.referral_visits} /></label>
                  <label>Attributed leads<input name="attributedLeads" type="number" min="0" defaultValue={link.attributed_leads} /></label>
                  <label>Attributed revenue<input name="attributedRevenue" inputMode="decimal" defaultValue={(link.attributed_revenue_cents / 100).toFixed(2)} /></label>
                  <button className="mini-button" type="submit">Save outcome</button>
                </form>
              </details>
            </li>
          ))}
          {dashboard.links.length === 0 ? <li className="list-row"><span className="muted">No backlinks imported yet.</span></li> : null}
        </ul>
      </section>

      <section className="feature-split section-actions">
        <article className="panel">
          <div>
            <p className="eyebrow">Earned-link opportunities</p>
            <h2>Relevant relationships first</h2>
          </div>
          <ul className="list">
            {dashboard.opportunities.map((opportunity) => (
              <li className="list-row" key={opportunity.id}>
                <div>
                  <strong>{opportunity.organization_name}</strong>
                  <p className="muted">{label(opportunity.opportunity_type)} · relevance {opportunity.relevance_score}/100 · {opportunity.confidence}</p>
                  {opportunity.relationship_evidence ? <p>{opportunity.relationship_evidence}</p> : null}
                  <p className="muted">{opportunity.recommended_action}</p>
                </div>
                <form action={updateLinkOpportunityStatusAction} className="compact-form">
                  <input name="opportunityId" type="hidden" value={opportunity.id} />
                  <select name="status" defaultValue={opportunity.status}>
                    <option value="discovered">discovered</option>
                    <option value="qualified">qualified</option>
                    <option value="asset_needed">asset needed</option>
                    <option value="ready_for_outreach">ready for contact</option>
                    <option value="contacted_manually">contacted</option>
                    <option value="earned">earned</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                  <button className="mini-button" type="submit">Save</button>
                </form>
              </li>
            ))}
            {dashboard.opportunities.length === 0 ? <li className="list-row"><span className="muted">No opportunities recorded yet.</span></li> : null}
          </ul>
        </article>

        <article className="panel">
          <div>
            <p className="eyebrow">Linkable assets</p>
            <h2>Give people something worth citing</h2>
          </div>
          <ul className="list">
            {dashboard.assets.map((asset) => (
              <li className="list-row" key={asset.id}>
                <div>
                  <strong>{asset.title}</strong>
                  <p className="muted">{label(asset.asset_type)} · {asset.status} · useful {asset.usefulness_score}/100 · original {asset.originality_score}/100</p>
                  <p>{asset.evidence_summary}</p>
                  <p className="muted">{asset.recommended_next_action}</p>
                </div>
                <span className="pill">{asset.status}</span>
              </li>
            ))}
            {dashboard.assets.length === 0 ? <li className="list-row"><span className="muted">Run the asset scan to reuse approved content, project knowledge, and completed work.</span></li> : null}
          </ul>
        </article>
      </section>

      <section className="panel section-actions">
        <h2><ShieldCheck size={18} /> What the numbers mean</h2>
        <div className="feature-split">
          <div>
            <h3><BarChart3 size={16} /> Real business value</h3>
            <p className="muted">Referral visits, attributed leads, jobs, and collected revenue are the outcomes Ferocity should optimize.</p>
          </div>
          <div>
            <h3><AlertTriangle size={16} /> Directional SEO estimates</h3>
            <p className="muted">DR, quality scores, and marketplace replacement values help prioritize review. They are not Google metrics, cash, or ranking guarantees.</p>
          </div>
        </div>
        <p className="muted"><Search size={14} /> Automatic verification and loss detection can later use Search Console or a customer-connected SEO data provider. The current implementation accepts verified records and imports without pretending a provider is connected.</p>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label: metricLabel, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${tone}`}><Link2 size={13} /> authority</small>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{metricLabel}</span>
    </section>
  );
}
