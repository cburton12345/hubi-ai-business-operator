import type { Metadata } from "next";
import { LegalPageShell } from "@/components/public/LegalPageShell";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "Rules protecting Ferocity customers, recipients, providers, and the platform from abuse.",
  alternates: { canonical: "/acceptable-use" }
};

export default function AcceptableUsePage() {
  return (
    <LegalPageShell eyebrow="Platform protection" title="Acceptable Use Policy">
      <p>
        This Acceptable Use Policy applies to all Ferocity workspaces, users, integrations, AI employees, communications, content, and automated actions. It supplements the Terms of Service and applicable provider policies.
      </p>

      <h2>Lawful and authorized use</h2>
      <p>
        Use Ferocity only for lawful business purposes and only with data, accounts, systems, phone numbers, content, and recipients you are authorized to use. Do not impersonate others, misrepresent sender identity, evade registrations, or access another organization or account without permission.
      </p>

      <h2>Messaging and calling</h2>
      <p>
        Do not send spam, unwanted promotions, purchased-list campaigns, misleading messages, or communications that lack required consent. Honor STOP, unsubscribe, suppression, quiet-hour, recording-disclosure, do-not-call, and provider requirements. Do not rotate providers or numbers to evade filtering, complaints, enforcement, or sending limits.
      </p>

      <h2>Prohibited content and conduct</h2>
      <p>
        Ferocity may not be used for fraud, phishing, malware, harassment, threats, exploitation, hate, unlawful discrimination, deceptive offers, intellectual-property infringement, regulated goods or services without authorization, or content that facilitates illegal or unsafe activity. Do not generate or distribute nonconsensual intimate material, child sexual abuse material, or content that exploits minors.
      </p>

      <h2>AI and consequential decisions</h2>
      <p>
        Do not use Ferocity as the sole decision-maker for legal rights, medical care, employment discipline, housing, credit, insurance, public benefits, safety enforcement, or other high-impact decisions. Maintain qualified human oversight and comply with applicable notice, consent, explanation, and appeal requirements.
      </p>

      <h2>Security and platform integrity</h2>
      <p>
        Do not probe, disrupt, reverse engineer, overload, bypass, or defeat Ferocity&apos;s security, tenant isolation, usage controls, approvals, cost controls, or provider safeguards. Do not introduce malicious code, share credentials improperly, automate abusive traffic, or use the service to discover secrets or personal data.
      </p>

      <h2>Enforcement</h2>
      <p>
        Ferocity may investigate suspected abuse, request evidence of authorization or consent, throttle or block an action, disable a provider lane, suspend a workspace, preserve relevant records, and cooperate with providers or authorities where legally required. We aim to isolate risky activity so one customer&apos;s conduct does not endanger other customers.
      </p>

      <h2>Report abuse</h2>
      <p>Email ferocityflow@outlook.com with the subject “Abuse report” and enough information to identify the activity. Do not send passwords, verification codes, or full payment credentials.</p>
    </LegalPageShell>
  );
}
