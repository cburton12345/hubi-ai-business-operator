import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Ferocity collects, uses, protects, and shares information, including mobile and SMS consent information.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <LegalPageShell eyebrow="Privacy" title="Privacy Policy">
      <p>
        This Privacy Policy explains how Ferocity collects, uses, discloses, and protects information when people visit ferocity.live, request information, create or use a Ferocity workspace, connect a provider, or communicate with us.
      </p>

      <h2>Information we collect</h2>
      <p>
        We may collect account and contact information; business, customer, lead, employee, job, estimate, invoice, payment-status, message, review, marketing, and operational records entered into a workspace; connected-provider identifiers and permissions; support communications; and technical information such as device, browser, approximate location, log, security, and usage data. Payment card and bank details are collected and processed by the applicable payment provider rather than stored as full payment credentials by Ferocity.
      </p>

      <h2>How we use information</h2>
      <p>
        We use information to provide, secure, support, and improve Ferocity; authenticate users; maintain the shared Business Brain; operate requested workflows; prepare AI-assisted drafts, summaries, and recommendations; route authorized actions; process billing; communicate about accounts and service requests; prevent abuse; satisfy legal obligations; and understand product performance.
      </p>

      <h2>AI and automated processing</h2>
      <p>
        Ferocity may process workspace information with configured AI services to prepare or perform features requested by an authorized workspace user. Available authority controls determine whether work remains a recommendation or draft, requires approval, or may run automatically. AI output can be incomplete or incorrect and should receive appropriate human review, especially for legal, safety, financial, employment, and other consequential decisions.
      </p>

      <h2>Connected providers</h2>
      <p>
        External services—including communications, calendars, payments, advertising, analytics, reviews, websites, accounting, voice, and media providers—are optional. Ferocity uses their credentials, tokens, data, and callbacks only after an authorized user connects or configures the service. Those providers process information under their own terms and privacy policies. Workspace owners may disconnect supported providers, subject to security, fraud-prevention, legal, and record-retention requirements.
      </p>

      <h2>SMS and mobile information</h2>
      <p>
        When you provide a mobile number and affirmatively opt in, we use it for the specific categories of messages described at the point of consent. SMS consent is not a condition of purchase. Mobile numbers, SMS opt-in records, and messaging consent are not sold, rented, or shared with third parties or affiliates for their own marketing or promotional purposes. We may disclose this information to communications vendors and other processors only as needed to deliver and support the requested program, maintain consent and suppression records, secure the service, or comply with law. Text STOP to opt out and HELP for help. See our SMS Terms and SMS Consent / Opt-In Policy for more information.
      </p>

      <h2>How we disclose information</h2>
      <p>
        We may disclose information to service providers working on our behalf; at the direction of an authorized workspace user; during a corporate transaction subject to appropriate protections; to protect users, Ferocity, or the public; or when required by law. We do not sell personal information for money. We do not use or disclose sensitive workspace information for unrelated advertising.
      </p>

      <h2>Retention and security</h2>
      <p>
        We retain information for as long as reasonably necessary to provide the service, honor consent and opt-out choices, resolve disputes, prevent fraud, and meet legal, tax, accounting, and security obligations. Ferocity uses administrative, technical, and organizational safeguards, including tenant separation, access controls, encrypted credential storage, logging, and provider-specific permissions. No system can guarantee absolute security.
      </p>

      <h2>Your choices and requests</h2>
      <p>
        Depending on your location, you may have rights to request access, correction, deletion, portability, or restriction of certain personal information. Workspace owners can manage users, preferences, providers, and many records in Ferocity. To make a privacy request, email ferocityflow@outlook.com from the address associated with the account. We may verify identity and authority before acting. Some information may be retained where required for security, consent evidence, legal compliance, or financial records.
      </p>

      <h2>Children</h2>
      <p>Ferocity is a business service and is not directed to children under 13. We do not knowingly collect personal information from children under 13.</p>

      <h2>Changes and contact</h2>
      <p>
        We may update this policy as Ferocity and applicable requirements change. The updated date identifies the current version. Privacy and data requests may be sent to ferocityflow@outlook.com.
      </p>
    </LegalPageShell>
  );
}
