import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkerIntakeProfile } from "@/lib/labor-bench/public-worker-intake";
import { submitPublicWorkerIntake } from "./actions";

export default async function PublicWorkerIntakePage({
  params,
  searchParams
}: {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<{
    error?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    source?: string;
    campaign?: string;
    page_url?: string;
    referrer?: string;
  }>;
}) {
  const { publicKey } = await params;
  const query = await searchParams;
  const profile = await getWorkerIntakeProfile(publicKey);

  if (!profile) notFound();

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Worker Availability</p>
          <h1>Tell {profile.brandName} when you can work.</h1>
          <p className="muted">
            Share your trade, service area, availability, and contact details. Ferocity adds this to the owner&apos;s labor bench for review.
          </p>
        </div>

        <form action={submitPublicWorkerIntake} className="panel form-stack auth-panel">
          <input name="formPublicKey" type="hidden" value={publicKey} />
          <input name="submittedAt" type="hidden" value={new Date().toISOString()} />
          <input name="utmSource" type="hidden" value={query.utm_source ?? query.source ?? ""} />
          <input name="utmMedium" type="hidden" value={query.utm_medium ?? ""} />
          <input name="utmCampaign" type="hidden" value={query.utm_campaign ?? query.campaign ?? ""} />
          <input name="pageUrl" type="hidden" value={query.page_url ?? ""} />
          <input name="referrer" type="hidden" value={query.referrer ?? ""} />
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>

          <label>
            Name
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            Trade or role
            <input name="trade" placeholder={`Roofing, cleaning, driver, helper, ${profile.industry}`} required />
          </label>
          <label>
            Service area
            <input name="serviceArea" placeholder="Cities, counties, or areas you can work" />
          </label>
          <label>
            Home base
            <input name="homeLocation" placeholder="Your city or general location" />
          </label>
          <div className="two-col">
            <label>
              Phone
              <input name="phone" autoComplete="tel" />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" />
            </label>
          </div>
          <label>
            Availability
            <input name="availabilityLabel" placeholder="Weekdays, weekends, next week, evenings, on call" />
          </label>
          <div className="two-col">
            <label>
              Travel radius
              <input name="travelRadiusMiles" inputMode="numeric" placeholder="Miles" />
            </label>
            <label>
              Rate
              <input name="rateLabel" placeholder="$25/hr, per job, negotiable" />
            </label>
          </div>
          <label>
            Experience
            <input name="experienceLabel" placeholder="Years, skills, licenses, equipment, crew size" />
          </label>
          <label>
            Tools, insurance, notes
            <textarea name="toolsAndInsurance" rows={3} placeholder="Tools, truck, insurance, certifications, limitations" />
          </label>
          <label>
            Anything else?
            <textarea name="notes" rows={4} placeholder="Schedule limits, preferred work, who referred you, or questions." />
          </label>
          <label className="checkbox-row">
            <input name="consentToContact" type="checkbox" required />
            <span>I agree that this business may contact me about work opportunities.</span>
          </label>

          {query.error === "limit" ? (
            <p className="form-error">This business needs to upgrade or raise its worker-intake limit before more availability submissions can be accepted.</p>
          ) : query.error ? (
            <p className="form-error">Please add your name, trade, consent, and either phone or email.</p>
          ) : null}

          <button className="button" type="submit">
            Submit availability
          </button>
          <p className="muted">
            Submitting this form does not guarantee work. The owner reviews matches before contacting or placing anyone.
          </p>
        </form>

        <Link className="mini-button" href="/">
          Back to Ferocity
        </Link>
      </section>
    </main>
  );
}
