import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrandProfile } from "@/lib/brands/get-brand-profile";
import { updateBrandProfile } from "./actions";

export default async function BrandProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { brandSlug } = await params;
  const query = await searchParams;
  const brand = await getBrandProfile(brandSlug);

  if (!brand) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Brand Profile</p>
            <h1>{brand.name}</h1>
            <p className="muted">Identity, positioning, marketing context, and risk settings used by the AI operator.</p>
          </div>
          <Link className="button secondary-button" href="/app/brands">
            Back to brands
          </Link>
        </div>

        {query.saved ? <p className="panel success-panel">Brand profile saved.</p> : null}

        <form action={updateBrandProfile} className="grid">
          <input name="brandId" type="hidden" value={brand.id} />

          <section className="panel span-6 form-stack">
            <h2>Identity</h2>
            <label>
              Name
              <input name="name" defaultValue={brand.name} required />
            </label>
            <label>
              Domain
              <input name="domain" defaultValue={brand.domain} placeholder="example.com" />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={brand.phone} />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={brand.email} />
            </label>
            <label>
              Logo URL
              <input name="logoUrl" type="url" defaultValue={brand.logoUrl} />
            </label>
          </section>

          <section className="panel span-6 form-stack">
            <h2>Business Context</h2>
            <label>
              Business model
              <input value={brand.businessModel} disabled />
            </label>
            <label>
              Industry
              <input name="industry" defaultValue={brand.industry} />
            </label>
            <label>
              Vertical
              <input name="vertical" defaultValue={brand.vertical} />
            </label>
            <label>
              Primary location
              <input name="primaryLocation" defaultValue={brand.primaryLocation} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={brand.status}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </section>

          <section className="panel span-12 form-stack">
            <h2>Operator Strategy</h2>
            <label>
              Description
              <textarea name="description" rows={4} defaultValue={brand.description} />
            </label>
            <label>
              Primary goal
              <textarea name="primaryGoal" rows={3} defaultValue={brand.primaryGoal} />
            </label>
            <label>
              Target customers
              <textarea name="targetCustomers" rows={3} defaultValue={brand.marketing.targetCustomers} />
            </label>
            <label>
              CTA goals
              <textarea name="ctaGoals" rows={2} defaultValue={brand.marketing.ctaGoals} />
            </label>
          </section>

          <section className="panel span-6 form-stack">
            <h2>Marketing Settings</h2>
            <label>
              Ad goals
              <textarea name="adGoals" rows={3} defaultValue={brand.marketing.adGoals} />
            </label>
            <label>
              SEO targets
              <textarea name="seoTargets" rows={3} defaultValue={brand.marketing.seoTargets} />
            </label>
            <label>
              Review strategy
              <textarea name="reviewStrategy" rows={3} defaultValue={brand.marketing.reviewStrategy} />
            </label>
            <label>
              Follow-up strategy
              <textarea name="followUpStrategy" rows={3} defaultValue={brand.marketing.followUpStrategy} />
            </label>
          </section>

          <section className="panel span-6 form-stack">
            <h2>Safety</h2>
            <label>
              Tone of voice
              <textarea name="toneOfVoice" rows={4} defaultValue={brand.marketing.toneOfVoice} />
            </label>
            <label>
              Risk profile
              <select name="riskProfile" defaultValue={brand.riskProfile}>
                <option value="normal">Normal</option>
                <option value="regulated">Regulated</option>
                <option value="legal_sensitive">Legal sensitive</option>
              </select>
            </label>
            <label>
              Approval mode
              <select name="approvalMode" defaultValue={brand.marketing.approvalMode}>
                <option value="manual">Manual approval</option>
                <option value="recommend_only">Recommend only</option>
                <option value="low_risk_auto">Low-risk auto later</option>
              </select>
            </label>
          </section>

          <section className="span-12 button-row">
            <button className="button" type="submit">
              Save brand profile
            </button>
          </section>
        </form>
      </section>
    </main>
  );
}
