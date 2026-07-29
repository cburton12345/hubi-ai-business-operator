import Link from "next/link";
import { Bot, CalendarDays, FileText, ImagePlus, Megaphone, Sparkles, Wand2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import {
  getMarketingOsDashboard,
  type MarketingOsAdvertisingDestination,
  type MarketingOsBrandOption,
  type MarketingOsRow
} from "@/lib/marketing-os/get-marketing-os-dashboard";
import {
  createAdAutopilotPackageAction,
  createAdLaunchKitAction,
  createContentStudioCampaignAction,
  createGraphicJobAction,
  createMarketingDepartmentRecommendationsAction,
  createOneClickCampaignAction,
  processWebsiteImportAction,
  createVideoJobAction,
  refreshBusinessProfileMemoryAction,
  requestWebsiteImportAction,
  saveAdvertisingDestinationAction
} from "./actions";

export default async function MarketingOsPage() {
  const dashboard = await getMarketingOsDashboard();

  return (
    <QueuePageShell
      eyebrow="AI Marketing Department"
      title="Create Demand And Turn Proof Into Booked Work"
      description="Ferocity uses Business Info, leads, jobs, proof, reviews, service areas, and results to recommend campaigns, create assets, and keep publishing or ad spend under review."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Tell Ferocity The Outcome</h2>
            <p className="muted">Ask for more roofing jobs, more concrete work, a full schedule next week, old-lead recovery, or marketing from completed jobs. Ferocity builds the plan and draft assets.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">
              <Bot size={16} /> Let Ferocity Set This Up
            </Link>
            <Link className="button secondary-button" href="/app/build-system">
              <Wand2 size={16} /> Update This For Me
            </Link>
            <Link className="button secondary-button" href="/app/growth-calendar">
              <CalendarDays size={16} /> Growth Calendar
            </Link>
            <Link className="button secondary-button" href="/app/growth-funnels">
              <Megaphone size={16} /> Growth Funnels
            </Link>
          </div>
        </div>

        <section className="panel form-stack">
          <div className="list-row flush-row">
            <div>
              <h2>Make The Ad For Me</h2>
              <p className="muted">
                Say what you want in normal words. Ferocity turns it into a landing page draft, platform-specific ads, a short-video script, scene plan, calendar items, and a review queue entry.
              </p>
            </div>
            <span className="pill">one request</span>
          </div>
          <form action={createAdAutopilotPackageAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <textarea
              name="businessThought"
              rows={3}
              placeholder="We finished a great roof after a hail storm. Make an ad that gets more storm inspections this week."
              required
            />
            <div className="two-col">
              <input name="serviceLabel" placeholder="Service or product, optional" />
              <input name="offerLabel" placeholder="Offer or next step, optional" />
            </div>
            <div className="two-col">
              <input name="audience" placeholder="Audience, optional" />
              <input name="sourceUrl" type="url" placeholder="Website or offer URL, optional" />
            </div>
            <textarea name="sourceAssets" rows={2} placeholder="Paste approved photos, videos, reviews, proof, job notes, or customer permission notes." />
            <PlatformChoices destinations={dashboard.advertisingDestinations} defaultPlatforms={["facebook", "instagram", "google"]} prefix="autopilot" />
            <div className="two-col">
              <select name="publishMode" defaultValue="approval_required">
                <option value="draft_only">Draft only</option>
                <option value="approval_required">Approve before posting</option>
                <option value="auto_when_connected">Schedule after approval and connected account</option>
              </select>
              <select name="durationSeconds" defaultValue="15">
                <option value="6">6 second clip</option>
                <option value="15">15 second clip</option>
                <option value="30">30 second clip</option>
                <option value="45">45 second clip</option>
                <option value="60">60 second clip</option>
              </select>
            </div>
            <input name="budgetDollars" min="0" step="25" type="number" placeholder="Ad budget, optional" />
            <button className="button" type="submit">
              <Wand2 size={16} /> Build ad package
            </button>
            <p className="muted">
              Ferocity can prepare the campaign now. Posting, final video rendering, or spending money requires the connected account, budget/credit limits, and approval settings.
            </p>
          </form>
        </section>

        <div className="grid section-actions">
          <Metric label="Business profiles" value={dashboard.metrics.businessProfiles} />
          <Metric label="Website imports" value={dashboard.metrics.websiteImports} />
          <Metric label="Campaigns" value={dashboard.metrics.campaigns} />
          <Metric label="Content outputs" value={dashboard.metrics.contentOutputs} />
          <Metric label="Media assets" value={dashboard.metrics.mediaAssets} />
          <Metric label="Graphic jobs" value={dashboard.metrics.graphicJobs} />
          <Metric label="Video jobs" value={dashboard.metrics.videoJobs} />
          <Metric label="Recommendations" value={dashboard.metrics.recommendations} />
          <Metric label="Memory items" value={dashboard.metrics.memoryItems} />
          <Metric label="Ad launch kits" value={dashboard.metrics.adExperiments} />
          <Metric label="Creative variants" value={dashboard.metrics.creativeVariants} />
          <Metric label="Platform playbooks" value={dashboard.metrics.platformPlaybooks} />
          <Metric label="Custom destinations" value={dashboard.metrics.advertisingDestinations} />
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
          <form action={createMarketingDepartmentRecommendationsAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <button className="button secondary-button" type="submit">
              <Megaphone size={16} /> Recommend campaigns from business signals
            </button>
            <p className="muted">Uses current leads, jobs, proof, invoices, services, and service areas. Nothing publishes or spends money.</p>
          </form>
          <form action={requestWebsiteImportAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <input name="websiteUrl" type="url" placeholder="https://theirwebsite.com" required />
            <button className="button secondary-button" type="submit">Import From Website</button>
            <p className="muted">This queues a safe public-page import. Review facts before Ferocity uses them.</p>
          </form>
        </section>

        <section className="panel span-6 form-stack">
          <h2>Creative Studio</h2>
          <p className="muted">Use normal words. Ferocity creates review-ready posts, emails, landing pages, ad copy, image ideas, and short video scripts from one campaign request.</p>
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
            <h2>Bring Your Own Advertising Destination</h2>
            <p className="muted">
              Add any community, directory, marketplace, publisher, niche ad network, or website—even an obscure one. Ferocity will prepare native-looking creative and keep manual export as the safe fallback.
            </p>
          </div>
          <span className="pill">BYO or manual export</span>
        </div>
        <form action={saveAdvertisingDestinationAction} className="form-stack">
          <BrandSelect brands={dashboard.brands} />
          <div className="two-col">
            <input name="displayName" placeholder="Destination name, such as MySpace or a local directory" required />
            <input name="websiteUrl" type="url" placeholder="https://destination.example" required />
          </div>
          <div className="two-col">
            <select name="destinationType" defaultValue="community">
              <option value="social">Social network</option>
              <option value="community">Community</option>
              <option value="directory">Directory</option>
              <option value="marketplace">Marketplace</option>
              <option value="ad_network">Ad network</option>
              <option value="publisher">Publisher</option>
              <option value="website">Website</option>
              <option value="other">Other</option>
            </select>
            <select name="connectionMode" defaultValue="manual_export">
              <option value="manual_export">Manual export</option>
              <option value="byo_credentials">Bring your own credentials</option>
              <option value="oauth_or_api_future">API/OAuth connection later</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Audience, format rules, account owner, or anything Ferocity should remember." />
          <button className="button secondary-button" type="submit">Save advertising destination</button>
          <p className="muted">Saving a destination never authorizes posting or spend. Connected credentials, approval, and budget controls are still required.</p>
        </form>
        <ListPanel
          title="Saved Advertising Destinations"
          empty="No custom destinations yet. Known networks remain available above."
          rows={dashboard.advertisingDestinationRows}
        />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Ad Launch Kit</h2>
            <p className="muted">Turn a service, offer, product link, or growth goal into a landing page, static ad ideas, UGC-style video scripts, captions, search ads, and test variants.</p>
          </div>
          <span className="pill">review before spend</span>
        </div>
        <form action={createAdLaunchKitAction} className="form-stack">
          <BrandSelect brands={dashboard.brands} />
          <textarea name="goal" rows={3} placeholder="I need more booked roof inspections next week for storm damage." required />
          <div className="two-col">
            <input name="productOrServiceUrl" type="url" placeholder="Product/service URL, optional" />
            <input name="serviceLabel" placeholder="Service or product, optional" />
          </div>
          <div className="two-col">
            <input name="offerLabel" placeholder="Offer, optional" />
            <input name="audience" placeholder="Audience, optional" />
          </div>
          <PlatformChoices destinations={dashboard.advertisingDestinations} defaultPlatforms={["facebook", "google"]} prefix="launch-kit" />
          <div className="two-col">
            <input name="budgetDollars" min="0" step="25" type="number" placeholder="Ad budget, optional" />
            <select name="variantCount" defaultValue="5">
              <option value="3">3 variants</option>
              <option value="5">5 variants</option>
              <option value="7">7 variants</option>
              <option value="10">10 variants</option>
            </select>
          </div>
          <button className="button" type="submit">
            <Megaphone size={16} /> Create ad launch kit
          </button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>One-Click Campaigns</h2>
            <p className="muted">Large buttons for common local-service marketing work. Each one creates draft outputs for review.</p>
          </div>
          <Link className="mini-button" href="/app/calendar">
            <CalendarDays size={14} /> Calendar
          </Link>
          <Link className="mini-button" href="/app/growth-calendar">
            Growth plan
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
          {dashboard.blueprints.length === 0 ? <p className="muted">Complete marketing setup or create a campaign to populate starters here.</p> : null}
        </div>
      </section>

      <section className="grid section-actions">
        <ListPanel title="AI Marketing Department Recommendations" empty="No recommendations yet. Ask Ferocity to recommend campaigns from business signals." rows={dashboard.recommendations} />
        <ListPanel title="Marketing Memory" empty="No marketing memory yet. Run recommendations or start campaigns so Ferocity can learn what works." rows={dashboard.memoryItems} />
        <ListPanel title="Platform Playbooks" empty="No platform playbooks yet. Add channel rules before launching paid creative." rows={dashboard.platformPlaybooks} />
        <ListPanel title="Ad Launch Kits" empty="No launch kits yet. Create one from a growth goal, service, or product link." rows={dashboard.adExperiments} />
        <ListPanel title="Creative Variants" empty="No variants yet. Launch kits create hooks, angles, formats, and platform-specific ideas." rows={dashboard.creativeVariants} />
      </section>

      <div className="grid section-actions">
        <section className="panel span-6 form-stack">
          <h2>Media And Graphics</h2>
          <p className="muted">Prepare review graphics, before/after graphics, image ads, social proof images, and reusable creative briefs from approved brand assets.</p>
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
          <h2>Video Ad Studio</h2>
          <p className="muted">
            Ferocity prepares the hook, script, scenes, voiceover, CTA, platform sizes, and variants. Rendered AI videos use credits or an approved add-on.
          </p>
          <form action={createVideoJobAction} className="form-stack">
            <BrandSelect brands={dashboard.brands} />
            <input name="goal" placeholder="Generate a 15 second storm repair ad clip" required />
            <div className="two-col">
              <input name="serviceLabel" placeholder="Service, optional" />
              <input name="offerLabel" placeholder="Offer, optional" />
            </div>
            <div className="two-col">
              <select name="platform" defaultValue="multi_platform">
                <option value="multi_platform">Multi-platform</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="reddit">Reddit</option>
                <option value="google_display">Google Display</option>
                <option value="ctv">Connected TV</option>
              </select>
              <select name="durationSeconds" defaultValue="15">
                <option value="6">6 second clip</option>
                <option value="15">15 second clip</option>
                <option value="30">30 second clip</option>
                <option value="45">45 second clip</option>
                <option value="60">60 second clip</option>
              </select>
            </div>
            <div className="two-col">
              <input name="audience" placeholder="Audience, optional" />
              <select name="variantCount" defaultValue="3">
                <option value="1">1 variant</option>
                <option value="2">2 variants</option>
                <option value="3">3 variants</option>
                <option value="5">5 variants</option>
              </select>
            </div>
            <textarea name="sourceAssets" rows={3} placeholder="Approved photos, reviews, before/after clips, proof, offer details, or product shots to use" />
            <p className="muted">Briefs are included in Marketing OS. Actual rendered videos should use credits or a paid production add-on.</p>
            <button className="button" type="submit">Prepare video ad brief</button>
          </form>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Advanced Settings</h2>
            <p className="muted">Power users can still open the controls directly. Everyone else can start with the guided path.</p>
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
        <ListPanel title="Business Memory" empty="No business memory yet. Run Quick Setup." rows={dashboard.profiles} />
        <ListPanel title="Website Imports" empty="No website import requests yet." rows={dashboard.websiteImports} processWebsiteImports />
        <ListPanel title="Campaigns" empty="No content studio campaigns yet." rows={dashboard.campaigns} />
        <ListPanel title="Review-Ready Outputs" empty="No campaign outputs yet." rows={dashboard.outputs} />
        <ListPanel title="Media Library" empty="No media library records yet." rows={dashboard.mediaAssets} />
        <ListPanel title="Graphic Jobs" empty="No graphic jobs yet." rows={dashboard.graphicJobs} />
        <ListPanel title="Video Jobs" empty="No video jobs yet." rows={dashboard.videoJobs} />
      </div>
    </QueuePageShell>
  );
}

function PlatformChoices({
  destinations,
  defaultPlatforms,
  prefix
}: {
  destinations: MarketingOsAdvertisingDestination[];
  defaultPlatforms: string[];
  prefix: string;
}) {
  const known = [
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["google", "Google"],
    ["tiktok", "TikTok"],
    ["youtube", "YouTube"],
    ["reddit", "Reddit"],
    ["microsoft", "Microsoft"]
  ];
  const options = [
    ...known.map(([value, label]) => ({ value, label })),
    ...destinations.map((destination) => ({
      value: destination.platformKey,
      label: `${destination.displayName} (${destination.connectionMode.replaceAll("_", " ")})`
    }))
  ];

  return (
    <div className="status-grid compact-status-grid">
      {options.map(({ value, label }) => (
        <label className="status-card compact-check" key={`${prefix}-${value}`}>
          <input name="platforms" type="checkbox" value={value} defaultChecked={defaultPlatforms.includes(value)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
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

function ListPanel({ title, empty, rows, processWebsiteImports = false }: { title: string; empty: string; rows: MarketingOsRow[]; processWebsiteImports?: boolean }) {
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
            <div className="button-row">
              <span className="pill">{item.status}</span>
              {item.href ? <Link className="mini-button" href={item.href}>Open</Link> : null}
              {processWebsiteImports && ["queued", "failed", "scanning"].includes(item.status) ? (
                <form action={processWebsiteImportAction}>
                  <input name="importId" type="hidden" value={item.id} />
                  <button className="mini-button" type="submit">Process import</button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
