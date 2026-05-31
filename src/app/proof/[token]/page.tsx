import { notFound } from "next/navigation";
import { submitProofAction } from "@/app/proof/actions";
import { getProofRequestContext } from "@/lib/ugc/proof";

export default async function ProofCapturePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const context = await getProofRequestContext(token);

  if (!context) {
    notFound();
  }

  return (
    <ProofCaptureShell
      cityState={context.location}
      customerEmail={context.customerEmail}
      customerName={context.customerName}
      customerPhone={context.customerPhone}
      error={query.error}
      jobTitle={context.jobTitle}
      mode="request"
      organizationName={context.organizationName}
      success={query.success === "1"}
      token={token}
    />
  );
}

export function ProofCaptureShell({
  cityState,
  customerEmail,
  customerName,
  customerPhone,
  error,
  jobTitle,
  mode,
  organizationName,
  success,
  token
}: {
  cityState: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  error?: string;
  jobTitle: string | null;
  mode: "portal" | "request";
  organizationName: string;
  success: boolean;
  token: string;
}) {
  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <p className="eyebrow">{organizationName}</p>
        <h1>Share photos, a quick story, or a review.</h1>
        <p className="muted">
          This helps the business document real work and prepare honest marketing. Nothing is published automatically.
        </p>

        {success ? (
          <section className="panel success-panel">
            Thank you. Your submission was saved for review. The business will approve any public use first.
          </section>
        ) : null}

        <form action={submitProofAction} className="panel form-stack">
          <input name="token" type="hidden" value={token} />
          <input name="mode" type="hidden" value={mode} />

          <div className="two-col">
            <label>
              Name
              <input name="customerName" defaultValue={customerName} autoComplete="name" />
            </label>
            <label>
              Email
              <input name="customerEmail" defaultValue={customerEmail} type="email" autoComplete="email" />
            </label>
          </div>

          <div className="two-col">
            <label>
              Phone
              <input name="customerPhone" defaultValue={customerPhone} autoComplete="tel" />
            </label>
            <label>
              Rating
              <select name="rating" defaultValue="5">
                <option value="5">5 - great experience</option>
                <option value="4">4 - good experience</option>
                <option value="3">3 - okay</option>
                <option value="2">2 - had issues</option>
                <option value="1">1 - needs attention</option>
              </select>
            </label>
          </div>

          <div className="two-col">
            <label>
              Service
              <input name="serviceType" defaultValue={jobTitle ?? ""} placeholder="Roof replacement, remodel, HVAC repair" />
            </label>
            <label>
              City / state
              <input name="city" defaultValue={cityState} placeholder="Eau Claire, WI" />
            </label>
          </div>

          <label>
            What happened?
            <textarea
              name="storyText"
              rows={5}
              placeholder="Example: They replaced our roof after the hail storm, helped with the process, and cleaned up when finished."
            />
          </label>

          <label>
            Result summary
            <textarea name="resultSummary" rows={3} placeholder="Example: New roof completed in one day. No leaks after the storm." />
          </label>

          <label>
            Upload photos or videos
            <input accept="image/*,video/mp4,video/quicktime,video/webm" multiple name="proofFiles" type="file" />
            <span className="muted">Up to 12 files. Large files may take a moment. Every upload still requires review before public use.</span>
          </label>

          <label>
            Photo links
            <textarea name="photoUrls" rows={4} placeholder="Optional: paste one shared photo link per line." />
          </label>

          <label>
            Video links
            <textarea name="videoUrls" rows={3} placeholder="Paste one shared video link per line." />
          </label>

          <fieldset className="form-fieldset">
            <legend>Permission</legend>
            <label className="checkbox-row">
              <input name="permissionMarketing" type="checkbox" />
              The business may review this submission and use approved words, photos, or videos in marketing.
            </label>
            <label className="checkbox-row">
              <input name="permissionUseName" type="checkbox" />
              The business may use my first name or display name.
            </label>
            <label className="checkbox-row">
              <input name="permissionUseLocation" type="checkbox" />
              The business may use the city or service area.
            </label>
            <label className="checkbox-row">
              <input name="permissionContactFollowup" type="checkbox" />
              The business may contact me if they need clarification.
            </label>
            <p className="muted">
              You can contact the business later to ask for a change or removal. Public use still requires internal review.
            </p>
          </fieldset>

          {error ? (
            <p className="form-error">
              {error === "limit"
                ? "This business needs to review its Ferocity proof capture limit before more submissions can be accepted."
                : "The submission could not be saved. Please check the form and try again."}
            </p>
          ) : null}

          <button className="button" type="submit">
            Submit for review
          </button>
        </form>
      </section>
    </main>
  );
}
