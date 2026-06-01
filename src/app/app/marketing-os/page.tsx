import Link from "next/link";
import { Bot, CalendarDays, FileText, ImagePlus, Sparkles, Wand2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketingOsDashboard, type MarketingOsBrandOption, type MarketingOsRow } from "@/lib/marketing-os/get-marketing-os-dashboard";
import {
  createContentStudioCampaignAction,
  createGraphicJobAction,
  createOneClickCampaignAction,
  createVideoJobAction,
  refreshBusinessProfileMemoryAction,
  requestWebsiteImportAction
} from "./actions";

export default async function MarketingOsPage() {
  const dashboard = await getMarketingOsDashboard();

  return (
    <QueuePageShell
      eyebrow="Marketing OS"
      title="Build The Marketing Department"
      description="A simple operating layer for business profile memory, AI setup, content campaigns, media, graphics, video jobs, approvals, publishing readiness, and plan limits."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Simple Mode</h2>
            <p className="muted">Tell Ferocity what the business needs. Ferocity prepares draft work and keeps live sends, publishing, ads, and provider jobs behind review.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">
              <Bot size={16} /> Have AI Set This Up
            </Link>
            <Link className="button secondary-button" href="/app/build-system">
              <Wand2 size={16} /> Have AI Update This For Me
            </Link>
          </div>
        </div>

        <div className="grid section-actions">
          <Metric label="Business profiles" value={dashboard.metrics.businessProfiles} />
          <Metric label="Website imports" value={dashboard.metrics.websiteImports} />
          <Metric label="Campaigns" value={dashboard.metrics.campaigns} />
          <Metric label="Content outputs" value={dashboard.metrics.contentOutputs} />
          <Metric label="Media assets" value={dashboard.metrics.mediaAssets} />
          <Metric label="Graphic jobs" value={dashboard.metrics.graphicJobs} />
          <Metric label="Video jobs" value={dashboard.metrics.videoJobs} />
        </div>
      </section>

      <div className="grid section-actions">
        <section className="panel span-6 form-stack">
          <h2>Quick Setup</h2>
          <p className="muted">Build or refresh business memory from existing Ferocity brand, services, locations, offers, proof, and media.</p>
          <form action={refreshBusinessProfileMemoryAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <button className="button" type="submit">
              <Sparkles size={16} /> Refresh business profile memory
            </button>
          </form>
          <form action={requestWebsiteImportAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <input name="websiteUrl" type="url" placeholder="https://theirwebsite.com" required />
            <button className="button secondary-button" type="submit">Import From Website</button>
            <p className="muted">This records a reviewed import request. It does not claim live scraping is active.</p>
          </form>
        </section>

        <section className="panel span-6 form-stack">
          <h2>Content Studio</h2>
          <p className="muted">Use normal words. This first workflow creates review-ready campaign outputs without spending AI tokens.</p>
          <form action={createContentStudioCampaignAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <input name="campaignName" placeholder="Campaign name, optional" />
            <textarea name="prompt" rows={4} placeholder="Create a hail damage campaign for homeowners in Eau Claire." required />
            <button className="button" type="submit">
              <FileText size={16} /> Create draft campaign
            </button>
          </form>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>One-Click Campaigns</h2>
            <p className="muted">Large buttons for common local-service marketing work. Each one creates draft outputs for review.</p>
          </div>
          <Link className="mini-button" href="/app/calendar">
            <CalendarDays size={14} /> Calendar
          </Link>
        </div>
        <div className="grid">
          {dashboard.blueprints.map((blueprint) => (
            <form action={createOneClickCampaignAction} className="panel span-4 form-stack" key={blueprint.campaignKey}>
              <BrandSelect brands={dashboard.brands} compact />
              <input name="campaignKey" type="hidden" value={blueprint.campaignKey} />
              <h3>{blueprint.label}</h3>
              <p className="muted">{blueprint.plainGoal}</p>
              <button className="button" type="submit">{blueprint.label}</button>
              <span className="pill">{blueprint.minimumPlanKey}</span>
            </form>
          ))}
          {dashboard.blueprints.length === 0 ? <p className="muted">Campaign blueprints will appear after the Marketing OS migration runs.</p> : null}
        </div>
      </section>

      <div className="grid section-actions">
        <section className="panel span-6 form-stack">
          <h2>Media And Graphics</h2>
          <p className="muted">Prepare review graphics, before/after graphics, and image ad jobs from approved brand assets.</p>
          <form action={createGraphicJobAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <select name="jobType" defaultValue="review_graphic">
              <option value="review_graphic">Review graphic</option>
              <option value="before_after">Before / after graphic</option>
              <option value="image_ad">Image ad</option>
            </select>
            <div className="two-col">
              <input name="serviceLabel" placeholder="Service, optional" />
              <input name="serviceArea" placeholder="Service area, optional" />
            </div>
            <button className="button" type="submit">
              <ImagePlus size={16} /> Prepare graphic job
            </button>
          </form>
        </section>

        <section className="panel span-6 form-stack">
          <h2>Video System</h2>
          <p className="muted">Provider-agnostic video jobs. Ferocity prepares script, scenes, voiceover, and CTA; provider submission stays disabled.</p>
          <form action={createVideoJobAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <input name="goal" placeholder="Generate a 30 second storm repair video" required />
            <div className="two-col">
              <input name="serviceLabel" placeholder="Service, optional" />
              <input name="offerLabel" placeholder="Offer, optional" />
            </div>
            <button className="button" type="submit">Prepare video job</button>
          </form>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Advanced Settings</h2>
            <p className="muted">Power users can still open the controls directly. Normal users can stay in Simple Mode.</p>
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/app/controls">Usage limits</Link>
            <Link className="mini-button" href="/app/approvals">Approvals</Link>
            <Link className="mini-button" href="/app/integrations">Providers</Link>
            <Link className="mini-button" href="/app/review">Review queue</Link>
          </div>
        </div>
      </section>

      <div className="grid section-actions">
        <ListPanel title="Business Profile Memory" empty="No business profile memory yet. Run Quick Setup." rows={dashboard.profiles} />
        <ListPanel title="Website Imports" empty="No website import requests yet." rows={dashboard.websiteImports} />
        <ListPanel title="Campaigns" empty="No content studio campaigns yet." rows={dashboard.campaigns} />
        <ListPanel title="Review-Ready Outputs" empty="No campaign outputs yet." rows={dashboard.outputs} />
        <ListPanel title="Media Library" empty="No media library records yet." rows={dashboard.mediaAssets} />
        <ListPanel title="Graphic Jobs" empty="No graphic jobs yet." rows={dashboard.graphicJobs} />
        <ListPanel title="Video Jobs" empty="No video jobs yet." rows={dashboard.videoJobs} />
      </div>
    </QueuePageShell>
  );
}

function BrandSelect({ brands, compact = false }: { brands: MarketingOsBrandOption[]; compact?: boolean }) {
  if (brands.length === 0) {
    return <input name="brandId" type="hidden" value="" />;
  }

  return (
    <label>
      {compact ? <span className="sr-only">Brand</span> : "Brand"}
      <select name="brandId" defaultValue={brands[0]?.id ?? ""}>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function ListPanel({ title, empty, rows }: { title: string; empty: string; rows: MarketingOsRow[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((item) => (
          <li className="list-row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              {item.detail ? <p>{item.detail}</p> : null}
              <p className="muted">{item.meta}</p>
            </div>
            <span className="pill">{item.status}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
