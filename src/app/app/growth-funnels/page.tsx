import Link from "next/link";
import { ArrowRight, CalendarCheck, ClipboardCheck, Gauge, Megaphone, PlayCircle, ShieldCheck, Target } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketingOsDashboard, type MarketingOsBrandOption } from "@/lib/marketing-os/get-marketing-os-dashboard";
import { createAdAutopilotPackageAction, createAdLaunchKitAction } from "@/app/app/marketing-os/actions";

const funnelSteps = [
  ["1", "Free audit or quiz", "Give prospects a useful score, checklist, or diagnosis before asking them to buy.", Gauge],
  ["2", "Short proof clip", "Use a 15-45 second video, not a long pitch, to show the problem and next step.", PlayCircle],
  ["3", "Qualified request", "Ask enough questions to know fit, urgency, service area, budget, and bottleneck.", ClipboardCheck],
  ["4", "Setup call or plan", "Route strong prospects to a call, plan checkout, or guided setup path.", CalendarCheck],
  ["5", "Follow-up and tracking", "Remind, nurture, and track which source turns into booked work and paid revenue.", Target]
] as const;

const customerFunnelTypes = [
  "Free roof inspection audit",
  "Website or business score",
  "Estimate request funnel",
  "Review and proof funnel",
  "Seasonal service campaign",
  "Rental availability funnel",
  "Professional consultation funnel",
  "E-commerce offer funnel"
];

export default async function GrowthFunnelsPage() {
  const dashboard = await getMarketingOsDashboard();

  return (
    <QueuePageShell
      eyebrow="Growth Funnels"
      title="Build Customer Acquisition Funnels"
      description="Use the audit-to-qualified-lead pattern for customer businesses. Ferocity turns a rough idea into an AI-assisted page and ad package plus an active qualification form and follow-up sequence, without pretending outside publishing or ad accounts are already live."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Funnel Engine</h2>
            <p className="muted">
              This is for your customers too: roofers, cleaners, clinics, agencies, rentals, sellers, and other businesses can use a simple audit or offer funnel to get better leads.
            </p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/growth-system" target="_blank">
              Public example <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/app/marketing-os">
              Marketing OS
            </Link>
          </div>
        </div>
        <div className="funnel-strip">
          {funnelSteps.map(([step, title, body, Icon]) => (
            <article key={title}>
              <span>{step}</span>
              <Icon size={18} />
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <form action={createAdAutopilotPackageAction} className="panel span-7 form-stack">
          <div>
            <p className="eyebrow">Build a funnel package</p>
            <h2>Tell Ferocity the offer and audience.</h2>
            <p className="muted">
              Ferocity shapes the strategy, prepares the page and creative package, and activates the qualification form and internal follow-up sequence that Revenue Growth can operate.
            </p>
          </div>
          <BrandSelect brands={dashboard.brands} />
          <label>
            Funnel type
            <select name="serviceLabel" defaultValue="Website or business score">
              {customerFunnelTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <textarea
            name="businessThought"
            rows={4}
            placeholder="Example: Build a free roof inspection funnel for homeowners after hail storms. Qualify urgency, roof age, city, insurance status, and timeline."
            required
          />
          <div className="two-col">
            <input name="offerLabel" placeholder="Offer or CTA, optional" />
            <input name="audience" placeholder="Audience, optional" />
          </div>
          <input name="sourceUrl" type="url" placeholder="Website, service page, or offer URL, optional" />
          <textarea name="sourceAssets" rows={3} placeholder="Paste approved reviews, photos, short clips, job proof, customer objections, or offer notes." />
          <div className="status-grid compact-status-grid">
            {["facebook", "instagram", "google", "tiktok", "youtube", "reddit", "microsoft"].map((platform) => (
              <label className="status-card compact-check" key={platform}>
                <input name="platforms" type="checkbox" value={platform} defaultChecked={["facebook", "instagram", "google"].includes(platform)} />
                <span>{platform[0].toUpperCase() + platform.slice(1)}</span>
              </label>
            ))}
          </div>
          <div className="two-col">
            <select name="publishMode" defaultValue="approval_required">
              <option value="draft_only">Draft only</option>
              <option value="approval_required">Approve before publishing or spending</option>
              <option value="auto_when_connected">Prepare for owner-authorized automation after connection</option>
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
            <Megaphone size={16} /> Build funnel package
          </button>
          <p className="muted">Qualification and follow-up records are created inside Ferocity. Live publishing, rendered video, customer sends, and ad spend still follow connected-account, authority, consent, and budget rules.</p>
        </form>

        <aside className="panel span-5">
          <h2>What the package should include</h2>
          <ul className="plain-list">
            {[
              "Landing page or hosted page draft",
              "Active qualification form with AI-suggested questions",
              "15-45 second video script and scene plan",
              "Platform-specific ad copy and hooks",
              "Active qualified-lead follow-up sequence",
              "Source tracking and conversion labels",
              "Review queue before anything goes live"
            ].map((item) => (
              <li key={item}>
                <ShieldCheck size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Advanced option</p>
            <h2>Create an ad launch kit from a goal.</h2>
            <p className="muted">Use this when you want a campaign kit without the full audit/qualification funnel around it.</p>
          </div>
          <span className="pill">review before spend</span>
        </div>
        <form action={createAdLaunchKitAction} className="form-stack">
          <BrandSelect brands={dashboard.brands} />
          <input name="platforms" type="hidden" value="facebook" />
          <input name="platforms" type="hidden" value="google" />
          <input name="variantCount" type="hidden" value="5" />
          <input name="budgetDollars" type="hidden" value="0" />
          <textarea name="goal" rows={3} placeholder="I need more qualified consultation requests from homeowners this month." required />
          <div className="two-col">
            <input name="productOrServiceUrl" type="url" placeholder="Service or offer URL, optional" />
            <input name="serviceLabel" placeholder="Service, optional" />
          </div>
          <div className="two-col">
            <input name="offerLabel" placeholder="Offer, optional" />
            <input name="audience" placeholder="Audience, optional" />
          </div>
          <button className="button" type="submit">Create ad launch kit</button>
        </form>
      </section>
    </QueuePageShell>
  );
}

function BrandSelect({ brands }: { brands: MarketingOsBrandOption[] }) {
  if (brands.length === 0) {
    return <input name="brandId" type="hidden" value="" />;
  }

  return (
    <label>
      Brand
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
