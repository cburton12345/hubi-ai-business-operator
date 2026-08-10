import { notFound } from "next/navigation";
import { submitReviewFeedbackAction } from "@/app/review/[token]/actions";
import { getReviewRequestContext } from "@/lib/reviews/review-destinations";

function providerLabel(provider: string) {
  if (provider === "google_business_profile") return "Google";
  if (provider === "bbb") return "BBB";
  if (provider === "industry_directory") return "Industry directory";
  return provider.charAt(0).toUpperCase() + provider.slice(1).replaceAll("_", " ");
}

export default async function PublicReviewRequestPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const context = await getReviewRequestContext(token);
  if (!context) notFound();

  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <p className="eyebrow">{context.organizationName}</p>
        <h1>How did we do?</h1>
        <p className="muted">
          We welcome honest feedback about your experience{context.jobTitle ? ` with ${context.jobTitle}` : ""}.
          Public reviews are optional, and no discount or reward is offered for leaving one.
        </p>

        {query.sent === "1" ? (
          <section className="panel success-panel" role="status">
            Thank you. Your feedback was shared with {context.organizationName}.
          </section>
        ) : null}

        {context.destinations.length > 0 ? (
          <section className="panel form-stack">
            <div>
              <h2>Leave a public review</h2>
              <p className="muted">
                Choose any site below. These same choices are available to every customer, whatever their rating or comments.
              </p>
            </div>
            <div className="button-row">
              {context.destinations.map((destination) => (
                <a
                  className="button"
                  href={destination.reviewUrl}
                  key={destination.id}
                  rel="nofollow noreferrer"
                  target="_blank"
                >
                  {destination.displayName || `Review on ${providerLabel(destination.provider)}`}
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="panel">
            <h2>Public review link not available</h2>
            <p className="muted">
              This business has not added a public review destination yet. You can still send private feedback below.
            </p>
          </section>
        )}

        <form action={submitReviewFeedbackAction} className="panel form-stack">
          <input name="token" type="hidden" value={token} />
          <div>
            <h2>Send feedback to the business</h2>
            <p className="muted">This message goes to the business and is not posted publicly.</p>
          </div>
          <label>
            Overall experience
            <select defaultValue={context.ratingReceived?.toString() ?? "5"} name="rating">
              <option value="5">5 - excellent</option>
              <option value="4">4 - good</option>
              <option value="3">3 - okay</option>
              <option value="2">2 - had problems</option>
              <option value="1">1 - needs attention</option>
            </select>
          </label>
          <label>
            What should the business know?
            <textarea maxLength={4000} name="feedback" placeholder="Tell us what went well or what could be better." rows={6} />
          </label>
          {query.error ? <p className="form-error">We could not save that feedback. Please try again.</p> : null}
          <button className="button" type="submit">Send private feedback</button>
        </form>
      </section>
    </main>
  );
}
