import Link from "next/link";
import { Building2, CheckCircle2, WandSparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getWorkspaceOnboardingRows } from "@/lib/onboarding/get-workspace-onboarding";
import { createWorkspaceOnboardingAction } from "./actions";

export default async function WorkspaceOnboardingPage() {
  const rows = await getWorkspaceOnboardingRows();

  return (
    <QueuePageShell
      eyebrow="SaaS Onboarding"
      title="Create an Organization Workspace"
      description="Set up an external business workspace, primary brand, marketing context, automation preferences, and lead form."
    >
      <form action={createWorkspaceOnboardingAction} className="onboarding-grid">
        <section className="panel form-stack">
          <h2>
            <Building2 size={18} /> Organization
          </h2>
          <label>
            Organization name
            <input name="organizationName" placeholder="Acme Home Services" required />
          </label>
          <label>
            Workspace slug
            <input name="workspaceSlug" placeholder="acme-home-services" />
          </label>
          <label>
            Primary brand name
            <input name="brandName" placeholder="Acme Roofing" required />
          </label>
          <label>
            Business model
            <select name="businessModel" defaultValue="local_service">
              <option value="local_service">Local service</option>
              <option value="rental">Rental</option>
              <option value="software">Software</option>
              <option value="marketplace">Marketplace</option>
              <option value="lead_generation">Lead generation</option>
            </select>
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Brand Basics</h2>
          <label>
            Domain
            <input name="domain" placeholder="example.com" />
          </label>
          <label>
            Phone
            <input name="phone" placeholder="(555) 010-1000" />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="hello@example.com" />
          </label>
          <label>
            Primary location
            <input name="primaryLocation" placeholder="Phoenix, AZ" />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Positioning</h2>
          <label>
            Industry
            <input name="industry" placeholder="Roofing, legal intake, trailer rental" />
          </label>
          <label>
            Vertical
            <input name="vertical" placeholder="storm_restoration" />
          </label>
          <label>
            Description
            <textarea name="description" rows={4} placeholder="What the business does, who it helps, and what makes it different." />
          </label>
          <label>
            Primary goal
            <textarea name="primaryGoal" rows={3} placeholder="Generate qualified estimate requests, demo bookings, rental quotes, or intake leads." />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Marketing Context</h2>
          <label>
            Target customers
            <textarea name="targetCustomers" rows={3} placeholder="Homeowners after hail damage, property managers, weekend trailer renters..." />
          </label>
          <label>
            CTA
            <input name="ctaGoals" placeholder="Request a quote" />
          </label>
          <label>
            Tone of voice
            <textarea name="toneOfVoice" rows={3} placeholder="Direct, helpful, local, and professional." />
          </label>
          <label>
            Ad goals
            <textarea name="adGoals" rows={2} placeholder="Recommend campaign ideas only; no launch or budget changes." />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Services and Areas</h2>
          <label>
            Services
            <textarea name="services" rows={6} placeholder={"Roof repair - Emergency and scheduled roof repairs\nStorm inspection - Post-storm exterior checks"} />
          </label>
          <label>
            Service areas
            <textarea name="serviceAreas" rows={5} placeholder={"Phoenix, AZ\nScottsdale, AZ\nMesa, AZ"} />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Offers and SEO</h2>
          <label>
            Offers
            <textarea name="offers" rows={4} placeholder={"Free inspection - Review if this is still accurate before publishing"} />
          </label>
          <label>
            SEO keywords
            <textarea name="seoKeywords" rows={5} placeholder={"roof repair phoenix\nstorm restoration phoenix\nemergency roofer phoenix"} />
          </label>
          <label>
            Landing pages
            <textarea name="landingPages" rows={4} placeholder={"Roof Repair in Phoenix\nStorm Restoration in Scottsdale"} />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>Safety</h2>
          <label>
            Risk profile
            <select name="riskProfile" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="regulated">Regulated</option>
              <option value="legal_sensitive">Legal sensitive</option>
            </select>
          </label>
          <label>
            Approval mode
            <select name="approvalMode" defaultValue="manual">
              <option value="manual">Manual approval</option>
              <option value="recommend_only">Recommend only</option>
              <option value="low_risk_auto">Low-risk drafts allowed</option>
            </select>
          </label>
          <label>
            Review strategy
            <textarea name="reviewStrategy" rows={3} placeholder="Draft review requests only. Do not auto-send." />
          </label>
          <label>
            Follow-up strategy
            <textarea name="followUpStrategy" rows={3} placeholder="Draft follow-up replies only. Confirm consent before sending." />
          </label>
        </section>

        <section className="panel form-stack">
          <h2>
            <WandSparkles size={18} /> Automation
          </h2>
          <label className="checkbox-row">
            <input name="autoCreateLowRiskDrafts" type="checkbox" defaultChecked />
            Auto-create low-risk drafts
          </label>
          <label className="checkbox-row">
            <input name="autoWeeklySeoPosts" type="checkbox" defaultChecked />
            Weekly SEO post drafts
          </label>
          <label className="checkbox-row">
            <input name="autoGbpPostDrafts" type="checkbox" defaultChecked />
            Google Business Profile drafts
          </label>
          <label className="checkbox-row">
            <input name="autoFacebookPostDrafts" type="checkbox" defaultChecked />
            Facebook post drafts
          </label>
          <label className="checkbox-row">
            <input name="autoReviewRequestDrafts" type="checkbox" defaultChecked />
            Review request drafts
          </label>
          <label className="checkbox-row">
            <input name="autoFollowUpDrafts" type="checkbox" defaultChecked />
            Lead follow-up drafts
          </label>
          <label className="checkbox-row">
            <input name="autoLandingPageSuggestions" type="checkbox" defaultChecked />
            Landing page suggestions
          </label>
        </section>

        <section className="span-12 button-row">
          <button className="button" type="submit">
            <CheckCircle2 size={16} /> Create workspace
          </button>
          <Link className="button secondary-button" href="/app/workspaces">
            View organizations
          </Link>
        </section>
      </form>

      <section className="panel span-12">
        <h2>Recent Workspaces</h2>
        <ul className="list">
          {rows.map((row) => (
            <li className="list-row" key={row.id}>
              <div>
                <Link href={`/app/workspace/${row.slug}`}>
                  <h3>{row.name}</h3>
                </Link>
                <p className="muted">
                  {row.brandCount} brands · {row.leadFormCount} forms · {row.accountType}
                </p>
              </div>
              <div className="inline-actions">
                <span className="pill">{row.status}</span>
                <span className="pill">{row.onboardingStatus}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </QueuePageShell>
  );
}
