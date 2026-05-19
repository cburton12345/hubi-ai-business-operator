import { submitPublicLeadForm } from "@/app/forms/[publicKey]/actions";
import { getPublicFormProfile } from "@/lib/forms/get-public-form-profile";

function defaultLeadType(businessModel: string) {
  if (businessModel === "rental") return "rental_request";
  if (businessModel === "software") return "demo";
  if (businessModel === "marketplace") return "seller";
  if (businessModel === "lead_generation") return "case_intake";
  return "quote";
}

export default async function PublicLeadFormPage({
  params,
  searchParams
}: {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { publicKey } = await params;
  const query = await searchParams;
  const profile = await getPublicFormProfile(publicKey);
  const leadType = defaultLeadType(profile?.businessModel ?? "local_service");

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Lead Capture</p>
          <h1>{profile ? profile.ctaGoals : "Request information"}</h1>
          <p className="muted">
            {profile
              ? `${profile.brandName} - ${profile.primaryGoal}`
              : "This reusable form routes the submission to the correct workspace and brand."}
          </p>
        </div>

        <form action={submitPublicLeadForm} className="panel form-stack auth-panel">
          <input name="formPublicKey" type="hidden" value={publicKey} />
          <input name="submittedAt" type="hidden" value={new Date().toISOString()} />
          <input name="utmSource" type="hidden" value="" />
          <input name="utmMedium" type="hidden" value="" />
          <input name="utmCampaign" type="hidden" value="" />
          <input name="utmTerm" type="hidden" value="" />
          <input name="utmContent" type="hidden" value="" />
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
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
          <label>
            Lead type
            <select name="leadType" defaultValue={leadType}>
              <option value="general">General</option>
              <option value="appointment">Appointment</option>
              <option value="quote">Quote</option>
              <option value="demo">Software demo</option>
              <option value="buyer">Marketplace buyer</option>
              <option value="seller">Marketplace seller</option>
              <option value="rental_request">Rental request</option>
              <option value="case_intake">Legal intake</option>
            </select>
          </label>
          <label>
            Service or interest
            <input name="serviceInterest" placeholder={profile?.industry ?? "Service or interest"} />
          </label>
          <label>
            Location / state
            <input name="location" />
          </label>
          {profile?.businessModel === "rental" ? (
            <label>
              Rental item type
              <input name="rentalItemType" placeholder="Trailer, equipment, or rental need" />
            </label>
          ) : null}
          {profile?.businessModel === "software" ? (
            <>
              <label>
                Company
                <input name="companyName" autoComplete="organization" />
              </label>
              <label>
                Role
                <input name="role" />
              </label>
            </>
          ) : null}
          {profile?.businessModel === "marketplace" ? (
            <label>
              Asset category
              <input name="assetCategory" placeholder="Property, auction item, listing type" />
            </label>
          ) : null}
          {profile?.businessModel === "lead_generation" ? (
            <>
              <label>
                Case type
                <input name="caseType" placeholder="Personal injury, accident, or incident type" />
              </label>
              <label>
                Injury type
                <input name="injuryType" />
              </label>
            </>
          ) : null}
          <label>
            Message
            <textarea name="message" rows={5} />
          </label>
          <label className="checkbox-row">
            <input name="consentToContact" type="checkbox" />
            I consent to be contacted about this request.
          </label>
          <label className="checkbox-row">
            <input name="legalDisclaimerAcknowledged" type="checkbox" />
            If this is legal-related, I understand this does not create an attorney-client relationship.
          </label>
          {query.error ? <p className="form-error">Please provide a valid email or phone number.</p> : null}
          <button className="button" type="submit">
            Submit
          </button>
        </form>
      </section>
    </main>
  );
}
