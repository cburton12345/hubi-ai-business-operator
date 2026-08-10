import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "SMS Consent and Opt-In Policy",
  description: "How Ferocity collects, records, honors, and revokes consent for SMS communications.",
  alternates: { canonical: "/sms-consent" }
};

export default function SmsConsentPage() {
  return (
    <LegalPageShell eyebrow="Consent" title="SMS Consent / Opt-In Policy">
      <p>
        Ferocity sends SMS or MMS messages only when the recipient has provided the consent required for the specific message category or another lawful basis applies to a requested transactional communication. This policy describes Ferocity&apos;s own messaging program and the standards businesses must follow when using Ferocity for their communications.
      </p>

      <h2>Affirmative, specific consent</h2>
      <p>
        Web consent controls start unchecked. The disclosure appears at or next to the checkbox and identifies Ferocity, the types of messages, variable frequency, possible message and data rates, and STOP instructions. General acceptance of Terms or a purchase does not constitute marketing consent. Consent is not a condition of purchase.
      </p>

      <h2>Separate marketing choice</h2>
      <p>
        Where marketing messages are offered, they use a separate optional checkbox. A person may request account or service communications without agreeing to marketing. Ferocity does not expand consent from one program to another without a new, clear choice.
      </p>

      <h2>Consent records</h2>
      <p>
        Ferocity may record the mobile number, consent category, disclosure version, source, date and time, and later opt-out or re-opt-in events. These records are used to demonstrate and enforce the recipient&apos;s instructions. We do not use purchased, rented, scraped, or third-party lead lists as proof of SMS consent.
      </p>

      <h2>Opt-out and suppression</h2>
      <p>
        Reply STOP to revoke consent. Ferocity records supported provider opt-out signals and suppresses future messages from the applicable program. Reply HELP for help. A recipient who later wants messages again must complete a supported re-opt-in action; Ferocity does not silently restore consent.
      </p>

      <h2>Businesses using Ferocity</h2>
      <p>
        Each Ferocity customer is responsible for identifying itself in messages, documenting a lawful opt-in, limiting messages to the disclosed purpose, respecting quiet hours and recipient preferences, maintaining required registrations, and honoring opt-outs across every connected provider. Ferocity may require evidence, block a send, pause a tenant or provider lane, or terminate access when messaging creates recipient, carrier, provider, or platform risk.
      </p>

      <h2>Mobile-data sharing</h2>
      <p>
        Mobile numbers and SMS consent are not sold, rented, or shared with third parties or affiliates for their own marketing or promotional purposes. They may be provided to messaging vendors and processors only to operate the requested program, maintain compliance records, prevent abuse, or comply with law. See the <Link href="/privacy">Privacy Policy</Link> and <Link href="/sms-terms">SMS Terms</Link>.
      </p>

      <h2>Questions or complaints</h2>
      <p>Email ferocityflow@outlook.com with the mobile number involved and a description of the request. Do not include passwords, verification codes, or full payment details.</p>
    </LegalPageShell>
  );
}
