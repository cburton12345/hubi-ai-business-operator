import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Ferocity collects, uses, protects, and shares information, including mobile and SMS consent information.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <LegalPageShell eyebrow="Privacy" title="Privacy Policy" updated="August 17, 2026">
      <p>
        This Privacy Policy explains how Ferocity collects, uses, discloses, and protects information when people visit ferocity.live, request information, create or use a Ferocity workspace, connect a provider, or communicate with us.
      </p>
      <p>
        Ferocity is operated by Preferred LLC, doing business as Ferocity. References to &quot;Ferocity,&quot; &quot;we,&quot; and &quot;us&quot; include Preferred LLC and any successor responsible for this policy.
      </p>

      <h2>Information we collect</h2>
      <p>
        We may collect account and contact information; business, customer, lead, employee, job, estimate, invoice, payment-status, message, review, marketing, and operational records entered into a workspace; connected-provider identifiers and permissions; support communications; and technical information such as device, browser, approximate location, log, security, and usage data. Payment card and bank details are collected and processed by the applicable payment provider rather than stored as full payment credentials by Ferocity.
      </p>

      <h2>How we use information</h2>
      <p>
        We use information to provide, secure, support, and improve Ferocity; authenticate users; maintain the shared Business Brain; operate requested workflows; prepare AI-assisted drafts, summaries, and recommendations; route authorized actions; process billing; communicate about accounts and service requests; prevent abuse; satisfy legal obligations; and understand product performance.
      </p>

      <h2>Our role and legal bases</h2>
      <p>
        A workspace customer generally determines why and how its workspace data is used, and Ferocity processes that data on the customer&apos;s behalf. Ferocity independently controls information needed for its own account administration, security, fraud prevention, billing, product operation, and legal compliance. Depending on applicable law, processing is based on performing a contract, legitimate interests in operating and protecting the service, consent where requested, or compliance with legal obligations.
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
      <p>
        Core and optional infrastructure providers are identified on the <Link href="/subprocessors">Subprocessor List</Link>. Processing of customer-controlled personal data is also governed by the <Link href="/data-processing-addendum">Data Processing Addendum</Link>.
      </p>

      <h2>Cookies, local storage, and analytics</h2>
      <p>
        Ferocity may use cookies, browser storage, and similar technologies that are necessary for authentication, security, preferences, forms, and reliable operation. On public marketing pages, Ferocity records privacy-minimized page, traffic-source, campaign, and device-category information to understand demand and improve the site. This first-party measurement does not store a raw IP address, name, email address, persistent advertising identifier, or complete referring URL, and browser Do Not Track signals are respected. Product analytics may also be used to understand performance and improve the service. Ferocity does not use workspace customer data for unrelated cross-context behavioral advertising and does not sell it for money.
      </p>

      <h2>Retention and security</h2>
      <p>
        We retain information for as long as reasonably necessary to provide the service, honor consent and opt-out choices, resolve disputes, prevent fraud, and meet legal, tax, accounting, and security obligations. Ferocity uses administrative, technical, and organizational safeguards, including tenant separation, access controls, encrypted credential storage, logging, and provider-specific permissions. No system can guarantee absolute security.
      </p>

      <h2>Your choices and requests</h2>
      <p>
        Depending on your location, you may have rights to request access, correction, deletion, portability, or restriction of certain personal information. Workspace owners can manage users, preferences, providers, and many records in Ferocity. To make a privacy request, email ferocityflow@outlook.com from the address associated with the account. We may verify identity and authority before acting. Some information may be retained where required for security, consent evidence, legal compliance, or financial records.
      </p>
      <p>
        Where applicable, you may also opt out of sale, sharing, or targeted advertising; object to or restrict processing; withdraw consent; appeal a denied privacy request; or use an authorized agent. Ferocity does not discriminate against a person for exercising an applicable privacy right. Because Ferocity does not sell personal information or use workspace data for unrelated targeted advertising, an opt-out request may confirm that no such activity is occurring. Appeals may be sent to the same address with the subject &quot;Privacy appeal.&quot;
      </p>

      <h2>International processing</h2>
      <p>
        Ferocity and configured providers may process information in the United States and other countries where they operate. Where applicable law requires a transfer mechanism, Ferocity uses recognized safeguards described in the Data Processing Addendum, which may include adequacy decisions or approved contractual clauses.
      </p>

      <h2>Children</h2>
      <p>Ferocity is a business service and is not directed to people under 18. We do not knowingly create accounts for children or knowingly collect personal information from children under 13.</p>

      <h2>Changes and contact</h2>
      <p>
        We may update this policy as Ferocity and applicable requirements change. The updated date identifies the current version. Privacy and data requests may be sent to ferocityflow@outlook.com.
      </p>
    </LegalPageShell>
  );
}
