import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Contact and Compliance",
  description: "Contact Ferocity about privacy, SMS, abuse, security, provider, and accessibility matters.",
  alternates: { canonical: "/contact-compliance" }
};

export default function ContactCompliancePage() {
  return (
    <LegalPageShell eyebrow="Help and reporting" title="Contact / Compliance">
      <p>
        Ferocity routes support and compliance requests to the people responsible for the affected account, provider, or policy. Email <a href="mailto:support@ferocity.live">support@ferocity.live</a> and use one of the subjects below so the request can be classified correctly.
      </p>

      <h2>SMS help or opt-out</h2>
      <p>
        Reply STOP to a Ferocity text to opt out or HELP for help. You may also email with the subject “SMS help” and include the affected mobile number. See the <Link href="/sms-terms">SMS Terms</Link> and <Link href="/sms-consent">SMS Consent / Opt-In Policy</Link>.
      </p>

      <h2>Privacy or data request</h2>
      <p>
        Use the subject “Privacy request.” Send the request from the email associated with the account and identify the relevant business or workspace. Ferocity may verify identity and authority before providing, correcting, exporting, or deleting information.
      </p>

      <h2>Abuse, unwanted communication, or provider concern</h2>
      <p>
        Use the subject “Abuse report.” Include the sender, date, channel, and a description or screenshot where practical. Do not include passwords, one-time codes, or full payment details. Reports may result in message suppression, provider isolation, account review, or other protective action under the <Link href="/acceptable-use">Acceptable Use Policy</Link>.
      </p>

      <h2>Security</h2>
      <p>
        Use the subject “Security report” for a suspected vulnerability or unauthorized access. Do not exploit a suspected issue, access data that is not yours, disrupt service, or publicly disclose sensitive details before Ferocity has had a reasonable opportunity to investigate.
      </p>

      <h2>Billing, accessibility, and general support</h2>
      <p>
        Use “Billing support,” “Accessibility,” or “General support” as appropriate. Include the workspace name and a concise description. Normal support requests should not contain highly sensitive personal, legal, health, or payment information.
      </p>

      <h2>Response and emergencies</h2>
      <p>
        Response time depends on severity and verification requirements. Ferocity is not an emergency service. Contact emergency services when there is an immediate threat to life, safety, or property.
      </p>
    </LegalPageShell>
  );
}
