import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: "Contract terms governing Ferocity's processing of customer personal data.",
  alternates: { canonical: "/data-processing-addendum" }
};

export default function DataProcessingAddendumPage() {
  return (
    <LegalPageShell eyebrow="Data protection" title="Data Processing Addendum" updated="August 17, 2026">
      <p>
        This Data Processing Addendum (&quot;DPA&quot;) forms part of the Ferocity Terms of Service or other agreement governing a customer&apos;s use of Ferocity. It applies when Ferocity processes personal data on behalf of a customer in providing the service. If there is a conflict concerning that processing, this DPA controls over the general Terms.
      </p>

      <h2>Roles and instructions</h2>
      <p>
        The customer is the controller or business and Ferocity is the processor or service provider for workspace personal data, except where each party independently determines the purposes and means of processing, such as its own account administration, security, fraud prevention, billing, or legal compliance. Ferocity will process customer personal data only on documented instructions expressed through the agreement, workspace configuration, authorized user actions, connected-provider choices, and lawful support requests. Ferocity will notify the customer if it believes an instruction violates applicable data-protection law, unless prohibited from doing so.
      </p>

      <h2>Processing details</h2>
      <p>
        Processing includes collecting, receiving, organizing, storing, retrieving, analyzing, generating, transmitting, securing, deleting, and otherwise using data to provide the configured Ferocity service. Purposes may include authentication, customer and lead management, communications, scheduling, estimates, jobs, payments, reporting, marketing operations, AI-assisted workflows, support, security, and connected-provider execution. Processing continues for the subscription term and any limited retention period described below.
      </p>
      <p>
        Data subjects may include customer personnel, applicants, workers, contractors, leads, customers, prospects, vendors, partners, and other people whose information an authorized user places in a workspace. Data may include contact and identity information; account roles; communications; call recordings and transcripts when enabled; job, appointment, estimate, invoice, payment-status, employee, marketing, website, review, and operational records; device and log data; connected-account identifiers; and other content submitted by the customer. Customers must not submit highly sensitive data unless the feature expressly supports it and the customer has a lawful basis and appropriate safeguards.
      </p>

      <h2>Confidentiality and personnel</h2>
      <p>
        Ferocity will limit access to personnel and contractors who need it to provide, secure, support, or maintain the service and who are subject to appropriate confidentiality obligations. Ferocity remains responsible for their compliance with this DPA to the extent required by applicable law.
      </p>

      <h2>Security measures</h2>
      <p>
        Ferocity will maintain reasonable administrative, technical, and organizational safeguards appropriate to the nature of the processing. Measures include tenant-aware access controls, role and authority controls, encryption in transit, protected secret and credential handling, logging, provider-specific permissions, software-dependency and vulnerability maintenance, backups or recovery mechanisms appropriate to the service, incident response, and safeguards designed to isolate one workspace&apos;s activity from another. Security measures may evolve so long as overall protection is not materially reduced.
      </p>

      <h2>Subprocessors</h2>
      <p>
        The customer grants general authorization for Ferocity to use the providers on the <Link href="/subprocessors">Subprocessor List</Link> and providers an authorized workspace user deliberately connects. Ferocity will impose data-protection obligations appropriate to each provider&apos;s function. Ferocity may update the public list before or when a new core subprocessor begins processing customer personal data. A customer with a reasonable data-protection objection may notify support@ferocity.live; Ferocity will attempt a commercially reasonable alternative, and if none is reasonably available, either party may discontinue the affected feature without terminating unaffected services.
      </p>

      <h2>Individual rights and customer assistance</h2>
      <p>
        Taking into account the nature of the processing, Ferocity will provide reasonable assistance through available product controls and support so the customer can respond to verified requests for access, correction, deletion, portability, restriction, or objection. If Ferocity receives a request relating to customer-controlled workspace data, it may direct the requester to the customer unless law requires Ferocity to respond directly. The customer is responsible for deciding whether and how to fulfill the request.
      </p>

      <h2>Security incidents</h2>
      <p>
        Ferocity will notify the affected customer without undue delay after confirming unauthorized access to, acquisition of, or disclosure of customer personal data that applicable law requires Ferocity to report. Notice will include information reasonably available to Ferocity about the nature of the incident, affected data, likely consequences, and mitigation. Notification is not an admission of fault. The customer is responsible for notifications it is legally required to make as controller or business.
      </p>

      <h2>Deletion, return, and retention</h2>
      <p>
        During an active subscription, available exports and product controls may be used to retrieve customer data. After termination or a verified deletion request, Ferocity will delete or return customer personal data within a commercially reasonable period unless retention is required for legal, billing, fraud-prevention, security, dispute, consent, or recordkeeping purposes. Data in protected backups may remain until overwritten under normal retention cycles and will remain protected and unavailable for ordinary use.
      </p>

      <h2>Compliance information and audits</h2>
      <p>
        Ferocity will make information reasonably necessary to demonstrate compliance with this DPA available through documentation, security responses, and relevant third-party reports then available. If that information is insufficient, a customer may request one audit per year at its expense, during normal business hours, with reasonable advance notice, subject to confidentiality, security, and tenant-protection restrictions. Audits may not expose another customer&apos;s data, source code, vulnerability details, or privileged information.
      </p>

      <h2>California and similar U.S. privacy laws</h2>
      <p>
        Where Ferocity acts as a service provider or contractor under the California Consumer Privacy Act or a comparable state law, it will not sell or share customer personal information; retain, use, or disclose it outside the specific business purposes described in this DPA and the agreement; use it outside the direct business relationship except as legally permitted; or combine it with personal information received from another person except as legally permitted. Ferocity will provide the same level of privacy protection required of service providers, notify the customer if it can no longer comply, and permit reasonable steps to stop and remediate unauthorized use.
      </p>

      <h2>International transfers</h2>
      <p>
        Customer personal data may be processed in the United States and other locations used by approved subprocessors. When applicable law requires a transfer mechanism, the parties will rely on a valid adequacy decision, certification, or the then-current controller-to-processor Standard Contractual Clauses approved by the European Commission, which are incorporated by reference and completed using the processing details and security measures in this DPA. The customer is the data exporter, Ferocity is the data importer, Module Two applies, and Wisconsin law governs questions the clauses allow the parties to choose, without overriding mandatory rights under the clauses.
      </p>

      <h2>Customer obligations</h2>
      <p>
        The customer will provide lawful instructions, required notices, and a valid legal basis; obtain required consents; limit data to what is necessary; configure access and authority appropriately; and avoid submitting prohibited or unsupported data. The customer is responsible for the lawfulness, accuracy, and quality of customer data and for its own compliance as controller or business.
      </p>

      <h2>Liability and termination</h2>
      <p>
        Liability arising from this DPA is subject to the Terms&apos; limitations to the extent permitted by applicable law and without limiting rights that cannot lawfully be waived. This DPA terminates when Ferocity no longer processes customer personal data, except provisions that must survive to protect retained data or resolve existing obligations.
      </p>

      <h2>Contact</h2>
      <p>Questions, objections, or data-protection requests may be sent to support@ferocity.live.</p>
    </LegalPageShell>
  );
}
