import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "SMS Terms",
  description: "Terms for text messages sent by Ferocity to people who affirmatively opt in.",
  alternates: { canonical: "/sms-terms" }
};

export default function SmsTermsPage() {
  return (
    <LegalPageShell eyebrow="Messaging" title="SMS Terms">
      <p>
        These SMS Terms apply to text messages sent by Ferocity to a mobile number whose owner has affirmatively opted in. They do not automatically enroll customers of businesses that use the Ferocity platform; each business is responsible for its own lawful messaging program and consent.
      </p>

      <h2>Program description</h2>
      <p>
        Depending on the consent selected, Ferocity may send account and service messages such as verification codes, setup updates, requested reminders, support follow-up, operational notices, and security alerts. If you separately select marketing consent, Ferocity may also send product education, offers, or event announcements. Marketing consent is optional and is not a condition of purchase.
      </p>

      <h2>How to opt in</h2>
      <p>
        You may opt in through a Ferocity web form or another documented consent method that clearly identifies Ferocity, the message category, frequency, rates disclosure, and opt-out instructions. Consent applies only to the program described at the point of opt-in and is not transferred to unrelated programs.
      </p>

      <h2>Frequency and charges</h2>
      <p>
        Message frequency varies according to your account activity, requests, and selected preferences. Message and data rates may apply. Ferocity does not charge a separate fee merely to receive its text messages, but your carrier&apos;s plan and charges still apply.
      </p>

      <h2>Opt out and help</h2>
      <p>
        Reply STOP to opt out. After an opt-out request, you may receive one confirmation message and then no additional messages from that program unless you opt in again. Reply HELP for help or email ferocityflow@outlook.com. We may also recognize other customary opt-out keywords where supported by the provider.
      </p>

      <h2>Delivery and availability</h2>
      <p>
        Delivery is subject to carrier and provider availability and is not guaranteed. Carriers are not liable for delayed or undelivered messages. Ferocity may change or discontinue a messaging program, switch an underlying provider, or suspend delivery to protect recipients, providers, or the platform.
      </p>

      <h2>Privacy</h2>
      <p>
        Mobile numbers and SMS consent are handled as described in the <Link href="/privacy">Privacy Policy</Link> and <Link href="/sms-consent">SMS Consent / Opt-In Policy</Link>. They are not sold or shared with third parties or affiliates for their own marketing or promotional purposes.
      </p>

      <h2>Contact</h2>
      <p>For SMS questions or support, email ferocityflow@outlook.com.</p>
    </LegalPageShell>
  );
}
