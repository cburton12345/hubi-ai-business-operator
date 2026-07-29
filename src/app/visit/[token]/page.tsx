import { notFound } from "next/navigation";
import { getPublicVisit } from "@/lib/scheduling/get-public-visit";
import { respondToVisitAction } from "./actions";

function displayTime(value: string | null) {
  if (!value) return "Time to be arranged";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

export default async function PublicVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const visit = await getPublicVisit(token);
  if (!visit) notFound();

  const finished = ["completed", "canceled", "no_show"].includes(visit.visitStatus);

  return (
    <main className="public-page">
      <section className="public-shell">
        <span className="eyebrow">Appointment</span>
        <h1>{visit.title}</h1>
        <p>{visit.businessName} for {visit.customerName}</p>

        <section className="panel">
          <h2>{displayTime(visit.arrivalWindowStart || visit.scheduledStart)}</h2>
          {visit.arrivalWindowEnd || visit.scheduledEnd ? (
            <p className="muted">Expected window ends {displayTime(visit.arrivalWindowEnd || visit.scheduledEnd)}</p>
          ) : null}
          <p>{visit.locationName || "Service location"}{visit.address ? ` · ${visit.address}` : ""}</p>

          {finished ? (
            <div className="notice"><strong>This appointment is {visit.visitStatus.replaceAll("_", " ")}.</strong></div>
          ) : visit.confirmationStatus === "confirmed" ? (
            <div className="success-card"><strong>You’re confirmed.</strong><p>No other action is needed.</p></div>
          ) : visit.confirmationStatus === "reschedule_requested" ? (
            <div className="notice"><strong>Your change request was sent.</strong><p>The team will contact you with a new time.</p></div>
          ) : visit.confirmationStatus === "declined" ? (
            <div className="notice"><strong>Your response was sent.</strong><p>The team will follow up before changing the appointment.</p></div>
          ) : (
            <div className="stacked-form">
              <form action={respondToVisitAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="response" value="confirmed" />
                <button className="button" type="submit">Confirm this appointment</button>
              </form>
              <details>
                <summary>I need a different time</summary>
                <form action={respondToVisitAction} className="stacked-form compact-form">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="response" value="reschedule_requested" />
                  <label>
                    What timing works better?
                    <textarea name="note" maxLength={1000} required placeholder="For example: any weekday after 3 PM" />
                  </label>
                  <button className="mini-button" type="submit">Request a different time</button>
                </form>
              </details>
              <details>
                <summary>I cannot make this appointment</summary>
                <form action={respondToVisitAction} className="stacked-form compact-form">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="response" value="declined" />
                  <label>
                    Optional note
                    <textarea name="note" maxLength={1000} placeholder="Tell the team anything they should know" />
                  </label>
                  <button className="mini-button secondary-button" type="submit">Send response</button>
                </form>
              </details>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
