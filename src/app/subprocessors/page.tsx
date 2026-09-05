import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Subprocessor List",
  description: "Core and optional providers that may process data to deliver Ferocity services.",
  alternates: { canonical: "/subprocessors" }
};

const coreProviders = [
  ["Netlify", "Application hosting, content delivery, serverless functions, and deployment infrastructure"],
  ["Supabase", "Database, authentication, storage, and related application infrastructure"],
  ["OpenAI", "Configured AI generation, extraction, classification, reasoning, and realtime capabilities"],
  ["Stripe", "Subscription billing, payment processing, connected-account onboarding, fraud prevention, and payment records"],
  ["Resend", "Transactional and configured inbound email delivery"]
] as const;

const optionalProviders = [
  ["Retell AI", "Configured AI voice conversations, call events, recordings, and transcripts"],
  ["Twilio", "Configured phone numbers, calling, SMS, MMS, routing, and delivery events"],
  ["Telnyx", "Configured telephony, messaging, and delivery events"],
  ["Google", "Customer-authorized calendar, business profile, advertising, analytics, cloud, and media services"],
  ["Microsoft", "Customer-authorized calendar, email, advertising, and business services"],
  ["Meta, TikTok, Reddit, Snapchat, and other advertising platforms", "Customer-authorized campaign, audience, creative, and performance operations"],
  ["Customer-selected CRM, field-service, accounting, website, communications, media, and automation providers", "Only the data and permissions needed for the integration the customer activates"]
] as const;

function ProviderTable({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">Provider</th><th scope="col">Purpose</th></tr></thead>
        <tbody>
          {rows.map(([provider, purpose]) => (
            <tr key={provider}><th scope="row">{provider}</th><td>{purpose}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SubprocessorsPage() {
  return (
    <LegalPageShell eyebrow="Data protection" title="Subprocessor List" updated="August 17, 2026">
      <p>
        Ferocity uses a small core provider set to operate the platform and additional providers only when a workspace enables the related feature or connection. A provider receives only the categories reasonably needed for its function and processes data under its own infrastructure, security, and contractual commitments.
      </p>

      <h2>Core platform providers</h2>
      <ProviderTable rows={coreProviders} />

      <h2>Optional or customer-activated providers</h2>
      <ProviderTable rows={optionalProviders} />

      <h2>Bring-your-own providers</h2>
      <p>
        When an authorized workspace user connects a provider account, Ferocity acts on that customer&apos;s documented choice. The provider may process customer data under both Ferocity&apos;s integration instructions and the customer&apos;s direct agreement with that provider. Disconnecting the provider stops new routine exchanges after in-flight callbacks and legally required records are handled.
      </p>

      <h2>Updates and objections</h2>
      <p>
        This page is the current notice of core subprocessors. Material additions will be reflected here before or when processing begins. Customers may send a reasonable data-protection objection to support@ferocity.live as described in the Data Processing Addendum.
      </p>
    </LegalPageShell>
  );
}
