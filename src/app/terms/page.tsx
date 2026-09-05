import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/public/LegalPageShell";
import { TERMS_LAST_UPDATED } from "@/lib/legal/terms";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of Ferocity's AI business operating platform.",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <LegalPageShell eyebrow="Terms" title="Terms of Service" updated={TERMS_LAST_UPDATED}>
      <p>
        These Terms of Service govern access to and use of Ferocity. By creating an account, purchasing a subscription, or using the service, you agree to these Terms on behalf of yourself and, when applicable, the business or organization you represent.
      </p>
      <p>
        In these Terms, &quot;Ferocity,&quot; &quot;we,&quot; and &quot;us&quot; mean Preferred LLC, doing business as Ferocity and operating ferocity.live, or a successor that lawfully assumes this agreement.
      </p>

      <h2>Business use and authority</h2>
      <p>
        Ferocity is offered primarily for business and commercial use. You represent that you are acquiring and using the service for business purposes and that you have authority to bind the organization associated with the workspace. If you do not have that authority, do not accept these Terms or use the workspace on the organization&apos;s behalf.
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
      <p>
        AI and automated systems can misunderstand instructions or data and may produce incomplete, inaccurate, outdated, duplicated, inappropriate, or unintended outputs or actions. They may also fail to identify a condition, deadline, risk, communication, or opportunity. You must review and test important workflows before enabling automatic action and must not rely on Ferocity as the sole basis for consequential legal, financial, employment, housing, credit, insurance, medical, safety, or regulatory decisions.
      </p>

      <h2>Configuration, safeguards, and business continuity</h2>
      <p>
        You are responsible for the accuracy of business rules, prices, schedules, recipients, account permissions, approval levels, spending limits, connected accounts, and instructions supplied to Ferocity. You must maintain reasonable safeguards appropriate to your business, including independent access to critical records, appropriate backups or exports, a way to pause automated activity, and practical fallback procedures for communications, scheduling, payments, safety, and other time-sensitive operations. Authority settings and approvals reduce risk but cannot eliminate every error or interruption.
      </p>

      <h2>Communications and consent</h2>
      <p>
        You are responsible for sending communications only to recipients for whom you have a lawful basis and any required consent. You must honor opt-outs, suppression lists, quiet-hour rules, calling and texting laws, sender-registration requirements, and applicable provider policies. Ferocity may block, pause, or limit messaging that presents compliance, abuse, deliverability, or provider risk. Ferocity&apos;s own SMS program is governed by the SMS Terms and SMS Consent / Opt-In Policy.
      </p>

      <h2>Subscriptions, fees, and third-party costs</h2>
      <p>
        Paid plans are billed according to the pricing and billing period shown at checkout or in an applicable order. Subscriptions automatically renew for successive billing periods until canceled, and you authorize the applicable payment method to be charged for recurring subscription fees, disclosed usage charges, and taxes. You may cancel future renewal through the available billing controls; cancellation takes effect at the end of the paid period unless checkout or an order states otherwise. Usage-based providers, advertising spend, phone numbers, messages, calls, media generation, payment processing, and other external services may incur separate charges. Taxes may apply. Unless required by law or stated otherwise in writing, fees already earned are nonrefundable and partial billing periods are not prorated. We will provide advance notice of a material subscription-price change when required by law.
      </p>

      <h2>Connected services</h2>
      <p>
        Third-party services are governed by their own terms, availability, pricing, limits, and review processes. You authorize Ferocity to exchange the information necessary to perform the connection you request. Ferocity is not responsible for a provider&apos;s suspension, outage, policy change, delivery decision, rejected advertisement, or discontinued feature, but may provide fallbacks or isolate a failing provider where practical.
      </p>

      <h2>Your data and content</h2>
      <p>
        You retain ownership of content and business data you provide. You grant Ferocity a limited right to host, process, transmit, display, and create requested outputs from that information to operate and improve the service for you. You represent that you have the rights and permissions needed for data, content, contacts, recordings, media, and instructions submitted to Ferocity.
      </p>

      <h2>Confidentiality and data processing</h2>
      <p>
        Each party may receive nonpublic business, technical, financial, security, customer, or operational information from the other. The receiving party will use that information only to perform or receive the service, protect it using reasonable care, and disclose it only to personnel and service providers who need it and are bound by appropriate confidentiality duties, or when disclosure is legally required. These duties do not apply to information that is public through no breach, already lawfully known without restriction, independently developed, or lawfully received from another source.
      </p>
      <p>
        When Ferocity processes personal data for a workspace, the <Link href="/data-processing-addendum">Data Processing Addendum</Link> is incorporated into these Terms. The current <Link href="/subprocessors">Subprocessor List</Link> identifies core providers and explains customer-selected provider connections.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You must comply with the Acceptable Use Policy. You may not use Ferocity for unlawful, deceptive, abusive, unsafe, infringing, discriminatory, or unauthorized activity; to send spam; to evade provider safeguards; or to access another workspace without permission.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Ferocity and its software, designs, documentation, trademarks, and underlying technology remain the property of Ferocity and its licensors. These Terms provide a limited, revocable, nonexclusive right to use the service; they do not transfer ownership of the platform or its protected orchestration and decision systems.
      </p>

      <h2>Feedback and generated output</h2>
      <p>
        Subject to these Terms and third-party rights, you may use output generated for your workspace for your lawful business purposes. Similar or identical output may be generated for others, and output may not qualify for intellectual-property protection. If you voluntarily provide product feedback, you grant Ferocity a perpetual, worldwide, royalty-free right to use it without identifying you or disclosing your confidential information.
      </p>

      <h2>Preview and evolving features</h2>
      <p>
        Features identified as beta, preview, experimental, planned, readiness-only, draft-only, or dependent on provider activation may be incomplete, change materially, or be discontinued. Do not use preview features for critical operations without an independent fallback. A public description of a planned or provider-dependent capability is not a promise that the capability is active in every workspace.
      </p>

      <h2>Service changes, suspension, and termination</h2>
      <p>
        We may update the service and may restrict or suspend access when reasonably necessary for security, legal compliance, nonpayment, abuse prevention, provider protection, or material violation of these Terms. You may stop using Ferocity and cancel future subscription renewal. Provisions that by their nature should survive termination will survive.
      </p>

      <h2>Your responsibility for claims and misuse</h2>
      <p>
        To the extent permitted by law, you will defend, indemnify, and hold harmless Ferocity and its owners, personnel, and service providers from third-party claims, losses, liabilities, damages, judgments, and reasonable costs, including legal fees, arising from content, data, instructions, accounts, recipients, products, services, or business practices you provide or control; your unlawful or unauthorized use of Ferocity; your violation of these Terms or the Acceptable Use Policy; or your infringement of another person&apos;s rights. Ferocity will provide reasonable notice and allow you to control the defense, subject to Ferocity&apos;s right to participate and to reject a settlement that admits fault or imposes obligations on Ferocity. This obligation does not apply to the extent a claim was caused by Ferocity&apos;s own conduct for which liability cannot lawfully be excluded.
      </p>

      <h2>Disclaimers and limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Ferocity is provided &quot;as is&quot; and &quot;as available&quot; without implied warranties of merchantability, fitness for a particular purpose, title, or noninfringement. We do not guarantee that the service or any AI output will be accurate, complete, secure, uninterrupted, error-free, or suitable for a particular business decision. We do not guarantee message delivery, search ranking, advertising results, lead volume, revenue, savings, regulatory compliance, or business growth.
      </p>
      <p>
        To the maximum extent permitted by law, Ferocity will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; lost profits, revenue, goodwill, data, customers, contracts, or business opportunities; business interruption; replacement-service costs; or losses arising from reliance on AI output, customer-approved or automatically authorized actions, incorrect configuration, unavailable providers, or a failure to maintain reasonable safeguards and recovery procedures. Ferocity&apos;s aggregate liability arising from or relating to the service will not exceed the amount you paid Ferocity for the service during the twelve months before the event giving rise to the claim.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited. Depending on applicable law, this may include liability for fraud, willful misconduct, gross negligence, or certain personal injury, privacy, security, or statutory obligations. Some jurisdictions do not permit certain warranty disclaimers, damage exclusions, or liability caps, so some of the provisions above may not apply to you.
      </p>

      <h2>Governing law and dispute process</h2>
      <p>
        These Terms and disputes arising from them are governed by the laws of the State of Wisconsin, without regard to conflict-of-law rules, except where applicable law requires otherwise. Before filing a lawsuit, each party will give written notice describing the dispute and requested resolution and will allow thirty days for a good-faith informal resolution attempt. If the dispute is not resolved, the parties consent to exclusive jurisdiction and venue in the state or federal courts located in Wisconsin that have subject-matter jurisdiction. Either party may seek immediate injunctive or protective relief for unauthorized access, misuse, security threats, or infringement without completing the informal process first.
      </p>

      <h2>General contract terms</h2>
      <p>
        Neither party is liable for delay or failure caused by events beyond its reasonable control, except payment obligations. You may not assign these Terms without Ferocity&apos;s written consent; Ferocity may assign them in connection with a merger, financing, reorganization, sale of assets, or transfer of the service. If a provision is unenforceable, it will be enforced to the greatest lawful extent and the remaining provisions remain effective. Failure to enforce a provision is not a waiver. These Terms, incorporated policies, checkout terms, and any signed order form are the entire agreement concerning the service. A signed order form controls only where it expressly conflicts with these Terms. Headings are for convenience only.
      </p>

      <h2>Electronic records and notices</h2>
      <p>
        You consent to transact electronically and to receive contractual, billing, security, and service notices electronically. Checking the acceptance box and submitting checkout constitutes your electronic acceptance. Ferocity may provide notices through the service or to the account email. Notices to Ferocity must be sent to support@ferocity.live. You are responsible for keeping the account email current and retaining copies of agreements and notices needed for your records.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these Terms and will identify the current version by its updated date. Material changes apply prospectively after reasonable notice where required. Continued use after an effective update constitutes acceptance where permitted by law. Questions may be sent to support@ferocity.live.
      </p>
    </LegalPageShell>
  );
}
