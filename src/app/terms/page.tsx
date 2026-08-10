import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of Ferocity's AI business operating platform.",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <LegalPageShell eyebrow="Terms" title="Terms of Service">
      <p>
        These Terms of Service govern access to and use of Ferocity. By creating an account, purchasing a subscription, or using the service, you agree to these Terms on behalf of yourself and, when applicable, the business or organization you represent.
      </p>

      <h2>Eligibility and accounts</h2>
      <p>
        You must be legally able to enter a binding agreement and authorized to act for the organization whose workspace you use. You are responsible for accurate account information, safeguarding access, assigning appropriate roles, and activity performed through your account. Notify Ferocity promptly of suspected unauthorized access.
      </p>

      <h2>The Ferocity service</h2>
      <p>
        Ferocity provides AI-assisted business operations software for managing information, recommendations, workflows, communications, jobs, marketing, payments, and connected services. Features may depend on the selected plan, configuration, authority settings, data quality, third-party providers, legal eligibility, and provider approval. A listed integration or prepared workflow does not mean every provider action is active for every account.
      </p>

      <h2>AI, automation, and owner responsibility</h2>
      <p>
        Ferocity may prepare, prioritize, summarize, route, or perform authorized work. You choose whether eligible actions remain drafts, require approval, or may run automatically. You are responsible for supervising use, confirming material inputs and outputs, and applying appropriate human judgment. Ferocity is not a substitute for legal, tax, accounting, medical, safety, employment, engineering, or other professional advice.
      </p>

      <h2>Communications and consent</h2>
      <p>
        You are responsible for sending communications only to recipients for whom you have a lawful basis and any required consent. You must honor opt-outs, suppression lists, quiet-hour rules, calling and texting laws, sender-registration requirements, and applicable provider policies. Ferocity may block, pause, or limit messaging that presents compliance, abuse, deliverability, or provider risk. Ferocity&apos;s own SMS program is governed by the SMS Terms and SMS Consent / Opt-In Policy.
      </p>

      <h2>Subscriptions, fees, and third-party costs</h2>
      <p>
        Paid plans are billed according to the pricing and billing period shown at checkout or in an applicable order. Usage-based providers, advertising spend, phone numbers, messages, calls, media generation, payment processing, and other external services may incur separate charges. Taxes may apply. Unless required by law or stated otherwise in writing, fees already earned are nonrefundable. You may cancel future renewal through the available billing controls.
      </p>

      <h2>Connected services</h2>
      <p>
        Third-party services are governed by their own terms, availability, pricing, limits, and review processes. You authorize Ferocity to exchange the information necessary to perform the connection you request. Ferocity is not responsible for a provider&apos;s suspension, outage, policy change, delivery decision, rejected advertisement, or discontinued feature, but may provide fallbacks or isolate a failing provider where practical.
      </p>

      <h2>Your data and content</h2>
      <p>
        You retain ownership of content and business data you provide. You grant Ferocity a limited right to host, process, transmit, display, and create requested outputs from that information to operate and improve the service for you. You represent that you have the rights and permissions needed for data, content, contacts, recordings, media, and instructions submitted to Ferocity.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You must comply with the Acceptable Use Policy. You may not use Ferocity for unlawful, deceptive, abusive, unsafe, infringing, discriminatory, or unauthorized activity; to send spam; to evade provider safeguards; or to access another workspace without permission.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Ferocity and its software, designs, documentation, trademarks, and underlying technology remain the property of Ferocity and its licensors. These Terms provide a limited, revocable, nonexclusive right to use the service; they do not transfer ownership of the platform or its protected orchestration and decision systems.
      </p>

      <h2>Service changes, suspension, and termination</h2>
      <p>
        We may update the service and may restrict or suspend access when reasonably necessary for security, legal compliance, nonpayment, abuse prevention, provider protection, or material violation of these Terms. You may stop using Ferocity and cancel future subscription renewal. Provisions that by their nature should survive termination will survive.
      </p>

      <h2>Disclaimers and limitation of liability</h2>
      <p>
        Ferocity is provided on an &quot;as available&quot; basis to the extent permitted by law. We do not guarantee uninterrupted operation, message delivery, search ranking, advertising results, lead volume, revenue, savings, or business growth. To the maximum extent permitted by law, Ferocity will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, or lost business opportunities. Ferocity&apos;s aggregate liability arising from the service will not exceed the amount you paid Ferocity for the service during the twelve months before the event giving rise to the claim. Some jurisdictions do not permit certain limitations, so they may not apply to you.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these Terms and will identify the current version by its updated date. Continued use after an effective update constitutes acceptance where permitted by law. Questions may be sent to ferocityflow@outlook.com.
      </p>
    </LegalPageShell>
  );
}
