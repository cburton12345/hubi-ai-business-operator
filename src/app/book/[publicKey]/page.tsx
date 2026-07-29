import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicFormProfile } from "@/lib/forms/get-public-form-profile";
import { requestPublicAppointment } from "./actions";

export default async function PublicBookingPage({
  params,
  searchParams
}: {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { publicKey } = await params;
  const query = await searchParams;
  const profile = await getPublicFormProfile(publicKey);
  if (!profile) notFound();

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Appointment request</p>
          <h1>Request a time with {profile.brandName}</h1>
          <p className="muted">Choose the time you prefer. The business will confirm availability or offer the closest useful option.</p>
        </div>
        {query.success ? (
          <section className="panel auth-panel">
            <h2>Your request is in.</h2>
            <p className="muted">Ferocity recorded the requested time and notified the team to confirm it.</p>
            <Link className="button" href={`/chat/${publicKey}`}>Continue in chat</Link>
          </section>
        ) : (
          <form action={requestPublicAppointment} className="panel form-stack auth-panel">
            <input name="formPublicKey" type="hidden" value={publicKey} />
            <label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <label>Name<input name="name" autoComplete="name" required /></label>
            <div className="two-col">
              <label>Email<input name="email" type="email" autoComplete="email" /></label>
              <label>Phone<input name="phone" type="tel" autoComplete="tel" /></label>
            </div>
            <label>Service or reason<input name="service" required /></label>
            <label>Preferred date and time<input name="requestedStart" type="datetime-local" required /></label>
            <label>Anything the team should know?<textarea name="message" rows={4} /></label>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              I consent to being contacted about this appointment request.
            </label>
            {query.error ? <p className="form-error">Please provide a future time and a valid email or phone number.</p> : null}
            <button className="button" type="submit">Request this time</button>
            <p className="muted">This requests a time; the business confirms final availability.</p>
          </form>
        )}
      </section>
    </main>
  );
}
