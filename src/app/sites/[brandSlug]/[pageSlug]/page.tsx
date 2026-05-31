import { notFound } from "next/navigation";
import { submitHostedPageLeadAction } from "@/app/sites/[brandSlug]/[pageSlug]/actions";
import { getPublicHostedGrowthPage } from "@/lib/sites/hosted-growth-pages";

function defaultLeadType(businessModel: string) {
  if (businessModel === "rental") return "rental_request";
  if (businessModel === "software") return "demo";
  if (businessModel === "marketplace") return "buyer";
  if (businessModel === "lead_generation") return "case_intake";
  return "quote";
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ brandSlug: string; pageSlug: string }>;
}) {
  const { brandSlug, pageSlug } = await params;
  const page = await getPublicHostedGrowthPage(brandSlug, pageSlug);

  if (!page) return {};

  return {
    title: `${page.title} | ${page.brandName}`,
    description: page.subheadline,
    robots: page.noindex ? { index: false, follow: false } : { index: true, follow: true },
    alternates: page.canonicalUrl ? { canonical: page.canonicalUrl } : undefined
  };
}

export default async function HostedGrowthPage({
  params,
  searchParams
}: {
  params: Promise<{ brandSlug: string; pageSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandSlug, pageSlug } = await params;
  const query = await searchParams;
  const page = await getPublicHostedGrowthPage(brandSlug, pageSlug);

  if (!page || !page.formPublicKey) notFound();

  const utm = {
    source: typeof query.utm_source === "string" ? query.utm_source : "",
    medium: typeof query.utm_medium === "string" ? query.utm_medium : "",
    campaign: typeof query.utm_campaign === "string" ? query.utm_campaign : "",
    term: typeof query.utm_term === "string" ? query.utm_term : "",
    content: typeof query.utm_content === "string" ? query.utm_content : ""
  };
  const serviceInterest = page.primaryKeyword ?? page.services[0]?.name ?? page.industry ?? "";

  return (
    <main className="public-page growth-site-page">
      <section className="public-shell growth-site-shell">
        <header className="growth-site-header">
          <div>
            <p className="eyebrow">{page.brandName}</p>
            <h1>{page.headline}</h1>
            <p>{page.subheadline}</p>
          </div>
          <div className="growth-site-contact">
            {page.brandPhone ? <a href={`tel:${page.brandPhone}`}>{page.brandPhone}</a> : null}
            {page.brandEmail ? <a href={`mailto:${page.brandEmail}`}>{page.brandEmail}</a> : null}
          </div>
        </header>

        {query.thanks ? (
          <section className="panel success-panel">
            Thanks. Your request was sent to {page.brandName}.
          </section>
        ) : null}

        <section className="growth-site-grid">
          <div className="growth-site-main">
            <section>
              <h2>How {page.brandName} Can Help</h2>
              <p>
                {page.primaryGoal ??
                  `${page.brandName} helps local customers request service, ask questions, and get clear next steps.`}
              </p>
            </section>

            <section>
              <h2>Services</h2>
              <ul className="growth-site-list">
                {(page.services.length > 0 ? page.services : [{ name: page.industry ?? "Service request", description: page.primaryGoal }]).map(
                  (service) => (
                    <li key={service.name}>
                      <strong>{service.name}</strong>
                      {service.description ? <span>{service.description}</span> : null}
                    </li>
                  )
                )}
              </ul>
            </section>

            <section>
              <h2>Service Area</h2>
              <p>
                {(page.locations.length > 0 ? page.locations.map((location) => location.label).join(", ") : page.primaryLocation) ??
                  "Contact the business to confirm availability for your location."}
              </p>
            </section>

            {page.offers.length > 0 ? (
              <section>
                <h2>Current Offers</h2>
                <ul className="growth-site-list">
                  {page.offers.map((offer) => (
                    <li key={offer.title}>
                      <strong>{offer.title}</strong>
                      {offer.description ? <span>{offer.description}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <form action={submitHostedPageLeadAction} className="panel form-stack growth-site-form">
            <input name="brandSlug" type="hidden" value={brandSlug} />
            <input name="pageSlug" type="hidden" value={pageSlug} />
            <input name="formPublicKey" type="hidden" value={page.formPublicKey} />
            <input name="landingPageId" type="hidden" value={page.id} />
            <input name="trackingCode" type="hidden" value={page.trackingCode ?? ""} />
            <input name="submittedAt" type="hidden" value={new Date().toISOString()} />
            <input name="utmSource" type="hidden" value={utm.source} />
            <input name="utmMedium" type="hidden" value={utm.medium} />
            <input name="utmCampaign" type="hidden" value={utm.campaign} />
            <input name="utmTerm" type="hidden" value={utm.term} />
            <input name="utmContent" type="hidden" value={utm.content} />
            <label className="honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <h2>{page.ctaGoals ?? "Request service"}</h2>
            <label>
              Name
              <input name="name" autoComplete="name" />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" />
            </label>
            <label>
              Phone
              <input name="phone" autoComplete="tel" />
            </label>
            <input name="leadType" type="hidden" value={defaultLeadType(page.businessModel)} />
            <label>
              Service or project
              <input name="serviceInterest" defaultValue={serviceInterest} />
            </label>
            <label>
              City or service address
              <input name="location" defaultValue={page.primaryLocation ?? ""} />
            </label>
            <label>
              What do you need?
              <textarea name="message" rows={5} />
            </label>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" />
              I consent to be contacted about this request.
            </label>
            {page.riskProfile === "legal_sensitive" ? (
              <label className="checkbox-row">
                <input name="legalDisclaimerAcknowledged" type="checkbox" />
                I understand this does not create an attorney-client relationship.
              </label>
            ) : null}
            {query.error ? <p className="form-error">Please enter a valid email or phone number.</p> : null}
            <button className="button" type="submit">
              Send request
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
